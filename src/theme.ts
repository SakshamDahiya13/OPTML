import { ImageSourcePropType, Platform, TextStyle, ViewStyle } from "react-native";

export type ThemeMode = "light" | "dark";

export const radius = {
  sm: 14,
  md: 22,
  lg: 28,
  xl: 34,
  pill: 999,
};

export const space = {
  gutter: 20,
  gap: 12,
  section: 26,
};

/**
 * How far the pre-blurred wallpaper was blurred when it was generated, in
 * source pixels at 1080w. GlassSurface samples that image rather than blurring
 * at runtime — see the note there for why.
 */
export const BACKDROP_BLUR_PX = 46;

export interface ThemePalette {
  mode: ThemeMode;
  /** Full-resolution wallpaper, drawn once at the app root. */
  wallpaper: ImageSourcePropType;
  /** The same wallpaper, pre-blurred. This is what shows *through* glass. */
  wallpaperBlurred: ImageSourcePropType;
  colors: {
    /** Flat colour under the wallpaper, for the moment before it decodes. */
    bg: string;
    text: string;
    textDim: string;
    textFaint: string;
    /** Solid chip colour — black on light, white on dark, like the reference. */
    accent: string;
    /** Text/icon colour on top of `accent`. */
    onAccent: string;
    danger: string;
    statusBar: "light" | "dark";
  };
  glass: {
    /** Alpha of the white veil over the blurred backdrop. Tuned on the real
     *  wallpaper: high enough to read text on, low enough that the moon and
     *  cloud banks stay plainly visible through every pane. */
    fill: string;
    fillStrong: string;
    border: string;
    borderStrong: string;
    /** Diagonal specular falloff. Faint on purpose — a strong sheen paints
     *  over the transparency it is meant to sell. */
    sheen: readonly [string, string, string];
    /** Lit hairline along the top edge of a pane. */
    topEdge: string;
    /** Neutral track for bars sitting on glass. */
    track: string;
    /** Tint + intensity for the optional live BlurView (overlays only). */
    tint: "light" | "dark";
    liveIntensity: number;
    shadowOpacity: number;
  };
  /** The blush "AI insight" callout from the reference. */
  insight: {
    bg: string;
    border: string;
    icon: string;
  };
}

const lightPalette: ThemePalette = {
  mode: "light",
  wallpaper: require("../assets/bg-light.webp"),
  wallpaperBlurred: require("../assets/bg-light-blur.webp"),
  colors: {
    bg: "#AEB7C4",
    text: "#0C0D10",
    textDim: "#4E525C",
    textFaint: "#7B808C",
    accent: "#0C0D10",
    onAccent: "#FFFFFF",
    danger: "#B4453A",
    statusBar: "dark",
  },
  glass: {
    fill: "rgba(255,255,255,0.34)",
    fillStrong: "rgba(255,255,255,0.44)",
    border: "rgba(255,255,255,0.46)",
    borderStrong: "rgba(255,255,255,0.60)",
    sheen: ["rgba(255,255,255,0.26)", "rgba(255,255,255,0.07)", "rgba(255,255,255,0)"],
    topEdge: "rgba(255,255,255,0.80)",
    track: "rgba(12,13,16,0.13)",
    tint: "light",
    liveIntensity: 18,
    shadowOpacity: 0.16,
  },
  insight: {
    bg: "rgba(216,196,196,0.60)",
    border: "rgba(255,255,255,0.46)",
    icon: "rgba(255,255,255,0.70)",
  },
};

const darkPalette: ThemePalette = {
  mode: "dark",
  wallpaper: require("../assets/bg-dark.webp"),
  wallpaperBlurred: require("../assets/bg-dark-blur.webp"),
  colors: {
    bg: "#121622",
    text: "#F3F5F9",
    textDim: "#A7AEBE",
    textFaint: "#79808F",
    accent: "#F3F5F9",
    onAccent: "#0A0C12",
    danger: "#E2796A",
    statusBar: "light",
  },
  glass: {
    fill: "rgba(255,255,255,0.12)",
    fillStrong: "rgba(255,255,255,0.18)",
    border: "rgba(255,255,255,0.20)",
    borderStrong: "rgba(255,255,255,0.30)",
    sheen: ["rgba(255,255,255,0.13)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0)"],
    topEdge: "rgba(255,255,255,0.38)",
    track: "rgba(255,255,255,0.16)",
    tint: "dark",
    liveIntensity: 20,
    shadowOpacity: 0.5,
  },
  insight: {
    bg: "rgba(150,124,128,0.34)",
    border: "rgba(255,255,255,0.20)",
    icon: "rgba(255,255,255,0.18)",
  },
};

export const palettes: Record<ThemeMode, ThemePalette> = {
  light: lightPalette,
  dark: darkPalette,
};

export type Palette = ThemePalette;

export function cardShadow(p: Palette): ViewStyle {
  return {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: p.glass.shadowOpacity,
    shadowRadius: 26,
    elevation: p.mode === "dark" ? 10 : 6,
  };
}

/**
 * Display numerals in the reference are set tight and large with a much
 * smaller unit suffix riding on the baseline ("7h 42m"). These keep that
 * relationship consistent wherever a figure is shown.
 */
export const type = {
  display: {
    fontSize: 52,
    fontWeight: "600",
    letterSpacing: -1.8,
  } as TextStyle,
  unit: {
    fontSize: 19,
    fontWeight: "500",
    letterSpacing: -0.2,
  } as TextStyle,
  screenTitle: {
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -1,
    lineHeight: 35,
  } as TextStyle,
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
  } as TextStyle,
  label: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.1,
  } as TextStyle,
  tiny: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.5,
  } as TextStyle,
};

// Floating tab bar geometry. Screens add TAB_BAR_SPACE + insets.bottom to
// their scroll padding so content never ends up stranded behind the bar.
export const TAB_BAR_HEIGHT = 60;
export const TAB_BAR_GAP = 12;
export const TAB_BAR_SPACE = TAB_BAR_HEIGHT + TAB_BAR_GAP + 18;

export const IS_ANDROID = Platform.OS === "android";
