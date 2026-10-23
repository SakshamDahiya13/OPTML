import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";
import { addParsedMeal } from "../lib/db";
import type { ParsedItem } from "../lib/db";
import {
  LookupFailure,
  Portion,
  Product,
  confirmProduct,
  lookupBarcode,
  saveProduct,
  scaleToPortion,
} from "../lib/barcode";
import { readLabel, toPer100 } from "../lib/label";

/** Plain-English reason a scan produced nothing, so the user isn't guessing. */
function failureCopy(f: LookupFailure): { title: string; body: string } {
  switch (f.reason) {
    case "not_found":
      return {
        title: "Not in the database",
        body: `Barcode ${f.code} isn't listed on Open Food Facts yet. It's a community database, so newer and regional products are often missing.`,
      };
    case "no_nutrition":
      return {
        title: "Listed, but no nutrition data",
        body: `${f.name} is in the database, but nobody has added its nutrition facts yet. Barcode ${f.code}.`,
      };
    case "rate_limited":
      return {
        title: "Too many scans, too fast",
        body: "The food database allows about 15 lookups a minute. Wait a moment and scan again.",
      };
    case "http":
      return {
        title: "The food database errored",
        body: `It returned status ${f.status} for ${f.code}. That's their end, not yours — worth trying again in a moment.`,
      };
    case "network":
      return {
        title: "Couldn't reach the food database",
        body: `${f.detail}. Check your connection — your phone needs internet for lookups, not just the dev server.`,
      };
  }
}

// Food packaging only — leaving QR and the industrial symbologies out stops
// the scanner locking onto a random sticker on the shelf.
const FOOD_BARCODES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

const LABELS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

type Stage =
  | "scanning"
  | "looking"
  | "found"
  | "missing"
  | "adding"
  /** Camera pointed at the nutrition panel rather than the barcode. */
  | "shooting"
  /** Gemini is reading the photo. */
  | "reading";

/** The four macros every label is legally required to print. */
const LABEL_FIELDS = [
  ["calories", "Energy", "kcal"],
  ["protein", "Protein", "g"],
  ["carbs", "Carbs", "g"],
  ["fat", "Fat", "g"],
] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Hand an unrecognised product to the chat parser instead of dead-ending. */
  onFallbackToChat?: (code: string) => void;
};

export default function ScanSheet({
  visible,
  onClose,
  onSaved,
  onFallbackToChat,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>("scanning");
  const [product, setProduct] = useState<Product | null>(null);
  const [failure, setFailure] = useState<LookupFailure | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState<string>("Snack");
  const [grams, setGrams] = useState(100);
  const [customText, setCustomText] = useState("");
  const [weighed, setWeighed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The contribute-a-product form, used when a barcode isn't known anywhere.
  const [form, setForm] = useState<Record<string, string>>({});

  // Set when the form was filled from a photo rather than typed, so the UI
  // can tell the user to check the numbers instead of trusting them.
  const [labelNote, setLabelNote] = useState<string | null>(null);

  const camera = useRef<CameraView | null>(null);

  // onBarcodeScanned fires every frame the code is visible. Without this the
  // same barcode triggers dozens of lookups in a second.
  const locked = useRef(false);

  const reset = useCallback(() => {
    locked.current = false;
    setStage("scanning");
    setProduct(null);
    setFailure(null);
    setCode("");
    setGrams(100);
    setCustomText("");
    setWeighed(true);
    setError(null);
    setForm({});
    setLabelNote(null);
  }, []);

  useEffect(() => {
    if (visible) reset();
  }, [visible, reset]);

  const onScan = useCallback(async (r: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;

    const raw = String(r.data ?? "");
    setCode(raw);
    setStage("looking");

    const result = await lookupBarcode(raw);
    if (!result.ok) {
      setFailure(result);
      setStage("missing");
      return;
    }

    setProduct(result.product);
    setGrams(result.product.serving?.grams ?? 100);
    setStage("found");
  }, []);

  const portion: Portion = useMemo(() => {
    if (!weighed) {
      return { kind: "estimate", label: `about ${Math.round(grams)}g`, grams };
    }
    if (product?.serving && Math.abs(product.serving.grams - grams) < 0.5) {
      return {
        kind: "serving",
        label: `1 serving (${Math.round(grams)}g)`,
        grams,
      };
    }
    return { kind: "grams", grams };
  }, [product, grams, weighed]);

  const preview: ParsedItem | null = useMemo(
    () => (product ? scaleToPortion(product, portion) : null),
    [product, portion]
  );

  async function save() {
    if (!product || !preview) return;
    setSaving(true);
    setError(null);
    try {
      await addParsedMeal(label, [preview], `Scanned barcode ${product.code}`);
      // Logging a contributed product without correcting it is a vote that
      // whoever typed it got the numbers right.
      if (product.contributed) await confirmProduct(product.code);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const num = (k: string) => {
    const n = parseFloat((form[k] ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  /**
   * Photograph the nutrition panel and let the model fill the form in.
   *
   * The result always lands in the SAME editable form the user would have
   * typed by hand — never saved straight to the shared product table. A
   * misread "7" for a "1" has to be catchable, and the only reliable checker
   * is the person holding the packet.
   */
  async function shootLabel() {
    if (!camera.current) return;
    setError(null);
    try {
      const shot = await camera.current.takePictureAsync({
        base64: true,
        // The panel is small print, so resolution matters: a heavily
        // compressed photo loses the decimal points. 0.6 keeps them legible
        // while holding the base64 upload to roughly a megabyte.
        quality: 0.6,
        skipProcessing: true,
      });
      if (!shot?.base64) throw new Error("The camera returned no image.");

      setStage("reading");
      const reading = await readLabel(shot.base64);

      if (!reading.found) {
        setStage("adding");
        setLabelNote(
          "Couldn't read the panel clearly — type the numbers in and they'll be saved for everyone."
        );
        return;
      }

      const { values, warning } = toPer100(reading);
      setForm((f) => ({
        // Anything the user already typed wins: they looked at the packet.
        name: f.name || reading.name || "",
        brand: f.brand || reading.brand || "",
        calories: f.calories || values.calories,
        protein: f.protein || values.protein,
        carbs: f.carbs || values.carbs,
        fat: f.fat || values.fat,
        serving:
          f.serving || (reading.serving_grams ? String(reading.serving_grams) : ""),
      }));
      setLabelNote(warning ?? "Read from the photo — check it against the pack.");
      setStage("adding");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("adding");
    }
  }

  async function contribute() {
    if (!(form.name ?? "").trim()) {
      setError("Give the product a name.");
      return;
    }
    if (num("calories") <= 0) {
      setError("Energy per 100g is needed — it's on the label.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveProduct({
        barcode: code,
        name: form.name,
        brand: form.brand,
        calories_100g: num("calories"),
        protein_100g: num("protein"),
        carbs_100g: num("carbs"),
        fat_100g: num("fat"),
        serving_grams: num("serving") > 0 ? num("serving") : null,
      });
      setProduct(saved);
      setGrams(saved.serving?.grams ?? 100);
      setStage("found");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A duplicate key means someone added it between the scan and the save.
      setError(
        /duplicate|unique/i.test(msg)
          ? "Someone just added this product — scan again to pick it up."
          : msg
      );
    } finally {
      setSaving(false);
    }
  }

  function setAmount(g: number) {
    setGrams(g);
    setCustomText("");
  }

  const quick = useMemo(() => {
    const out: { label: string; grams: number }[] = [];
    if (product?.serving) {
      out.push({
        label: `1 serving · ${Math.round(product.serving.grams)}g`,
        grams: product.serving.grams,
      });
      out.push({
        label: `2 servings · ${Math.round(product.serving.grams * 2)}g`,
        grams: product.serving.grams * 2,
      });
    }
    out.push({ label: "100g", grams: 100 });
    return out;
  }, [product]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} />

        <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 10 }]}>
          <GlassCard strong radius={radius.xl} style={styles.sheet}>
            <View style={styles.inner}>
              <View style={styles.head}>
                <Text style={[t.screenTitle, { color: colors.text, fontSize: 22 }]}>
                  {stage === "found"
                    ? "How much?"
                    : stage === "adding"
                      ? "Add product"
                      : "Scan a barcode"}
                </Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textDim} />
                </Pressable>
              </View>

              {/* ---------------------------------------------- camera */}
              {stage === "scanning" ? (
                !permission ? (
                  <View style={styles.center}>
                    <ActivityIndicator color={colors.textDim} />
                  </View>
                ) : !permission.granted ? (
                  <View style={styles.center}>
                    <Ionicons name="camera-outline" size={28} color={colors.textFaint} />
                    <Text
                      style={[
                        t.label,
                        { color: colors.textDim, textAlign: "center", marginTop: 12 },
                      ]}
                    >
                      OPTML needs the camera to read barcodes.
                    </Text>
                    <Pressable onPress={requestPermission} style={{ marginTop: 16 }}>
                      <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                        <Text style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}>
                          Allow camera
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.cameraWrap}>
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }}
                      onBarcodeScanned={onScan}
                    />
                    <View style={styles.reticle} pointerEvents="none">
                      <View style={[styles.reticleBox, { borderColor: "#fff" }]} />
                    </View>
                    <Text style={styles.cameraHint}>
                      Point at the barcode on the pack
                    </Text>
                  </View>
                )
              ) : null}

              {/* --------------------------------------------- looking */}
              {stage === "looking" ? (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.text} />
                  <Text style={[t.label, { color: colors.textDim, marginTop: 12 }]}>
                    Looking up {code}…
                  </Text>
                </View>
              ) : null}

              {/* --------------------------------------------- missing */}
              {stage === "missing" ? (
                <View style={styles.center}>
                  <Ionicons
                    name={
                      failure?.reason === "network" || failure?.reason === "http"
                        ? "cloud-offline-outline"
                        : "help-circle-outline"
                    }
                    size={28}
                    color={colors.textFaint}
                  />
                  <Text
                    style={[
                      t.cardTitle,
                      { color: colors.text, marginTop: 12, textAlign: "center" },
                    ]}
                  >
                    {failure ? failureCopy(failure).title : "Not in the database"}
                  </Text>
                  <Text
                    style={[
                      t.label,
                      { color: colors.textDim, textAlign: "center", marginTop: 6 },
                    ]}
                  >
                    {failure
                      ? failureCopy(failure).body
                      : `Barcode ${code} isn't listed.`}
                  </Text>
                  <Text
                    style={[
                      t.tiny,
                      { color: colors.textFaint, textAlign: "center", marginTop: 10 },
                    ]}
                  >
                    You can still describe it in chat and I'll work it out.
                  </Text>
                  {failure?.reason === "not_found" ||
                  failure?.reason === "no_nutrition" ? (
                    <Pressable
                      onPress={() => {
                        setError(null);
                        setStage("adding");
                      }}
                      style={styles.addCtaWrap}
                    >
                      <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                        <Ionicons
                          name="add-circle-outline"
                          size={16}
                          color={colors.onAccent}
                        />
                        <Text
                          style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}
                        >
                          Add it from the label
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}

                  <View style={styles.missingActions}>
                    <Pressable onPress={reset} style={styles.ghost}>
                      <Text style={[t.label, { color: colors.textDim }]}>
                        Scan again
                      </Text>
                    </Pressable>
                    {onFallbackToChat ? (
                      <Pressable
                        onPress={() => {
                          onFallbackToChat(code);
                          onClose();
                        }}
                        style={styles.ghost}
                      >
                        <Text style={[t.label, { color: colors.textDim }]}>
                          Type it in chat
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* -------------------------------------------- shooting */}
              {stage === "shooting" ? (
                <View style={styles.cameraWrap}>
                  <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
                  <View style={styles.reticle} pointerEvents="none">
                    <View style={[styles.reticleBox, { borderColor: "#fff" }]} />
                  </View>
                  <Text style={styles.cameraHint}>
                    Fill the frame with the nutrition table
                  </Text>
                  <View style={styles.shutterRow}>
                    <Pressable onPress={() => setStage("adding")} hitSlop={10}>
                      <Text style={[t.label, { color: "#fff" }]}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={shootLabel} hitSlop={10}>
                      <View style={styles.shutter} />
                    </Pressable>
                    <View style={{ width: 52 }} />
                  </View>
                </View>
              ) : null}

              {/* --------------------------------------------- reading */}
              {stage === "reading" ? (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.text} />
                  <Text style={[t.label, { color: colors.textDim, marginTop: 12 }]}>
                    Reading the label…
                  </Text>
                </View>
              ) : null}

              {/* ---------------------------------------------- adding */}
              {stage === "adding" ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[t.label, { color: colors.textDim }]}>
                    Copy the numbers from the nutrition panel. Everyone who
                    scans {code} after you gets them instantly.
                  </Text>

                  <Pressable onPress={() => setStage("shooting")} style={{ marginTop: 14 }}>
                    <View style={[styles.photoCta, { backgroundColor: glass.track }]}>
                      <Ionicons name="camera-outline" size={18} color={colors.text} />
                      <Text style={[t.label, { color: colors.text, fontWeight: "600" }]}>
                        Photograph the label instead
                      </Text>
                    </View>
                  </Pressable>

                  {labelNote ? (
                    <Text style={[t.label, { color: colors.textDim, marginTop: 12 }]}>
                      {labelNote}
                    </Text>
                  ) : null}

                  <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>
                    PRODUCT
                  </Text>
                  {[
                    ["name", "Name", "e.g. Good Day Cashew"],
                    ["brand", "Brand (optional)", "e.g. Britannia"],
                  ].map(([key, labelText, placeholder]) => (
                    <View key={key} style={{ marginTop: 9 }}>
                      <TextInput
                        value={form[key] ?? ""}
                        onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                        placeholder={placeholder}
                        placeholderTextColor={colors.textFaint}
                        accessibilityLabel={labelText}
                        style={[
                          styles.formInput,
                          { color: colors.text, backgroundColor: glass.track },
                        ]}
                      />
                    </View>
                  ))}

                  <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>
                    PER 100g — AS PRINTED
                  </Text>
                  <View style={styles.formGrid}>
                    {LABEL_FIELDS.map(([key, labelText, unit]) => (
                      <View key={key} style={styles.formCell}>
                        <Text style={[t.tiny, { color: colors.textFaint }]}>
                          {labelText.toUpperCase()}
                        </Text>
                        <View
                          style={[styles.formNum, { backgroundColor: glass.track }]}
                        >
                          <TextInput
                            value={form[key] ?? ""}
                            onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textFaint}
                            style={[styles.formNumInput, { color: colors.text }]}
                          />
                          <Text style={[t.tiny, { color: colors.textFaint }]}>
                            {unit}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>
                    SERVING SIZE (OPTIONAL)
                  </Text>
                  <View style={[styles.customRow, { backgroundColor: glass.track }]}>
                    <TextInput
                      value={form.serving ?? ""}
                      onChangeText={(v) => setForm((f) => ({ ...f, serving: v }))}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 30 if the pack says 'per 30g serving'"
                      placeholderTextColor={colors.textFaint}
                      style={[styles.customInput, { color: colors.text }]}
                    />
                    <Text style={[t.label, { color: colors.textFaint }]}>g</Text>
                  </View>

                  {error ? (
                    <Text style={[t.label, { color: colors.danger, marginTop: 12 }]}>
                      {error}
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => setStage("missing")}
                      style={styles.ghost}
                      disabled={saving}
                    >
                      <Text style={[t.label, { color: colors.textDim }]}>Back</Text>
                    </Pressable>
                    <Pressable onPress={contribute} disabled={saving} style={{ flex: 1 }}>
                      <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                        {saving ? (
                          <ActivityIndicator color={colors.onAccent} />
                        ) : (
                          <Text
                            style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}
                          >
                            Save product
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  </View>
                </ScrollView>
              ) : null}

              {/* ----------------------------------------------- found */}
              {stage === "found" && product && preview ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.product}>
                    {product.imageUrl ? (
                      <Image
                        source={{ uri: product.imageUrl }}
                        style={[styles.thumb, { backgroundColor: glass.track }]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: glass.track }]}>
                        <Ionicons name="cube-outline" size={20} color={colors.textFaint} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      {product.brand ? (
                        <Text style={[t.tiny, { color: colors.textFaint }]}>
                          {product.brand.toUpperCase()}
                        </Text>
                      ) : null}
                      <Text style={[t.cardTitle, { color: colors.text, marginTop: 2 }]}>
                        {product.name}
                      </Text>
                      {product.packSize ? (
                        <Text style={[t.tiny, { color: colors.textFaint, marginTop: 2 }]}>
                          {product.packSize} pack
                        </Text>
                      ) : null}
                      {product.contributed ? (
                        <Text style={[t.tiny, { color: colors.textFaint, marginTop: 3 }]}>
                          {product.confirmations
                            ? `Added by a user · confirmed ${product.confirmations}×`
                            : "Added by a user · not yet confirmed"}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>
                    AMOUNT
                  </Text>
                  <View style={styles.chips}>
                    {quick.map((q) => {
                      const on = Math.abs(q.grams - grams) < 0.5 && !customText;
                      return (
                        <Pressable
                          key={q.label}
                          onPress={() => setAmount(q.grams)}
                          style={[
                            styles.chip,
                            { backgroundColor: on ? colors.accent : glass.track },
                          ]}
                        >
                          <Text
                            style={[
                              t.label,
                              { color: on ? colors.onAccent : colors.textDim },
                            ]}
                          >
                            {q.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={[styles.customRow, { backgroundColor: glass.track }]}>
                    <TextInput
                      value={customText}
                      onChangeText={(v) => {
                        setCustomText(v);
                        const n = parseFloat(v.replace(",", "."));
                        if (Number.isFinite(n) && n > 0) setGrams(n);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="Or enter grams"
                      placeholderTextColor={colors.textFaint}
                      style={[styles.customInput, { color: colors.text }]}
                    />
                    <Text style={[t.label, { color: colors.textFaint }]}>g</Text>
                  </View>

                  <View style={styles.weighRow}>
                    {[
                      { on: true, text: "I weighed it", sub: "exact" },
                      { on: false, text: "Rough guess", sub: "estimated" },
                    ].map((opt) => {
                      const active = weighed === opt.on;
                      return (
                        <Pressable
                          key={opt.text}
                          onPress={() => setWeighed(opt.on)}
                          style={[
                            styles.weighOpt,
                            {
                              backgroundColor: active ? colors.accent : glass.track,
                            },
                          ]}
                        >
                          <Ionicons
                            name={opt.on ? "scale-outline" : "eye-outline"}
                            size={15}
                            color={active ? colors.onAccent : colors.textDim}
                          />
                          <Text
                            style={[
                              t.label,
                              { color: active ? colors.onAccent : colors.textDim },
                            ]}
                          >
                            {opt.text}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={[styles.result, { borderTopColor: glass.border }]}>
                    <Text style={[t.screenTitle, { color: colors.text, fontSize: 30 }]}>
                      {Math.round(preview.calories)}
                      <Text style={[t.unit, { color: colors.textDim }]}> kcal</Text>
                    </Text>
                    {weighed ? (
                      <Text style={[t.tiny, { color: colors.textFaint, marginTop: 4 }]}>
                        Exact — scaled from the label
                      </Text>
                    ) : (
                      <Text style={[t.tiny, { color: colors.textFaint, marginTop: 4 }]}>
                        Likely {Math.round(preview.calories_min)}–
                        {Math.round(preview.calories_max)} kcal · portion is a guess
                      </Text>
                    )}
                    <Text style={[t.label, { color: colors.textDim, marginTop: 8 }]}>
                      {Math.round(preview.protein_g)}g protein ·{" "}
                      {Math.round(preview.carbs_g)}g carbs ·{" "}
                      {Math.round(preview.fat_g)}g fat
                    </Text>
                  </View>

                  <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>
                    ADD TO
                  </Text>
                  <View style={styles.chips}>
                    {LABELS.map((l) => {
                      const on = label === l;
                      return (
                        <Pressable
                          key={l}
                          onPress={() => setLabel(l)}
                          style={[
                            styles.chip,
                            { backgroundColor: on ? colors.accent : glass.track },
                          ]}
                        >
                          <Text
                            style={[
                              t.tiny,
                              { color: on ? colors.onAccent : colors.textDim },
                            ]}
                          >
                            {l.toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {error ? (
                    <Text style={[t.label, { color: colors.danger, marginTop: 12 }]}>
                      {error}
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable onPress={reset} style={styles.ghost} disabled={saving}>
                      <Text style={[t.label, { color: colors.textDim }]}>Rescan</Text>
                    </Pressable>
                    <Pressable onPress={save} disabled={saving} style={{ flex: 1 }}>
                      <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                        {saving ? (
                          <ActivityIndicator color={colors.onAccent} />
                        ) : (
                          <Text
                            style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}
                          >
                            Add to log
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  </View>
                </ScrollView>
              ) : null}
            </View>
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  photoCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  shutterRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },
  shutter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.45)",
  },
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheetWrap: { maxHeight: "92%" },
  sheet: { marginHorizontal: 10 },
  inner: { padding: 20 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 36 },
  cameraWrap: {
    height: 300,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  reticle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  reticleBox: {
    width: "74%",
    height: 118,
    borderWidth: 2,
    borderRadius: radius.md,
    opacity: 0.9,
  },
  cameraHint: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  product: { flexDirection: "row", alignItems: "center", gap: 13 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: 16,
    marginTop: 9,
    gap: 6,
  },
  customInput: { flex: 1, fontSize: 15, paddingVertical: 13 },
  weighRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  weighOpt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  result: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
  missingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    alignSelf: "stretch",
  },
  ghost: { paddingHorizontal: 16, paddingVertical: 13 },
  cta: {
    height: 48,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  addCtaWrap: { alignSelf: "stretch", marginTop: 18 },
  formInput: {
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 9 },
  formCell: { width: "47%", flexGrow: 1 },
  formNum: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: 13,
    marginTop: 5,
    gap: 5,
  },
  formNumInput: { flex: 1, fontSize: 16, fontWeight: "600", paddingVertical: 11 },
});
