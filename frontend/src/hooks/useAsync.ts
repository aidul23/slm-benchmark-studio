import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> & { reload: () => Promise<void> } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const cancelled = useRef(false);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (!cancelled.current) {
        setState({ data, loading: false, error: null });
      }
    } catch (error) {
      if (!cancelled.current) {
        setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void run();
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}
