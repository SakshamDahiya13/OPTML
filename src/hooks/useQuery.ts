import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Minimal async-data hook.
 *
 * Refetches whenever the screen comes back into focus, which is how a meal
 * added on the Food tab shows up on Analytics without any shared store: the
 * tabs simply re-read when you switch to them.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response from a previous query overwriting a newer
  // one, and against setting state after the screen is gone.
  const runId = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    try {
      const result = await fn();
      if (!alive.current || id !== runId.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (!alive.current || id !== runId.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current && id === runId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run])
  );

  return { data, loading, error, refetch: run };
}
