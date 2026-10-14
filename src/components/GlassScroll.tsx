import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleProp,
  ViewStyle,
} from "react-native";

type ScrollCtx = {
  /** Live content offset. Driven natively, so panes track it at 60fps. */
  y: Animated.Value;
  /** The same number, readable synchronously when a pane measures itself. */
  now: { current: number };
};

const GlassScrollContext = createContext<ScrollCtx | null>(null);

export const useGlassScroll = () => useContext(GlassScrollContext);

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  /** For callers that need scrollToEnd (the chat thread). */
  scrollRef?: React.RefObject<ScrollView | null>;
  onContentSizeChange?: (w: number, h: number) => void;
};

/**
 * A ScrollView that publishes its offset to every GlassCard beneath it.
 *
 * The wallpaper is fixed to the screen, so what a pane should show through
 * itself depends only on where that pane currently *is* on screen. Panes get
 * that from their own anchor minus this offset, which is why the blur inside a
 * card slides correctly while you scroll instead of sitting frozen.
 */
export default function GlassScroll({
  children,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  onScroll,
  keyboardShouldPersistTaps,
  scrollRef,
  onContentSizeChange,
}: Props) {
  const y = useRef(new Animated.Value(0)).current;
  const now = useRef(0);

  useEffect(() => {
    const id = y.addListener((e) => {
      now.current = e.value;
    });
    return () => y.removeListener(id);
  }, [y]);

  const ctx = useMemo<ScrollCtx>(() => ({ y, now }), [y]);

  // Native driver keeps the backdrop transform off the JS thread; the optional
  // JS listener still fires for callers that want the raw event.
  const handleScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
        useNativeDriver: true,
        listener: onScroll,
      }),
    [y, onScroll]
  );

  return (
    <GlassScrollContext.Provider value={ctx}>
      <Animated.ScrollView
        ref={scrollRef as never}
        style={style}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {children}
      </Animated.ScrollView>
    </GlassScrollContext.Provider>
  );
}
