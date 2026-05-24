import clsx from "clsx";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "info" | "success" | "error" | "warning";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title?: string;
  message: string;
  /** Auto-dismiss timeout in ms. Use 0 for sticky. Default 5000. */
  duration?: number;
}

interface ToastContextValue {
  /** Push a toast. Returns its id so callers can dismiss manually. */
  push: (toast: Omit<ToastItem, "id">) => number;
  dismiss: (id: number) => void;
  /** Convenience: show a `tone="error"` toast for a thrown error. */
  error: (message: string, title?: string) => number;
  success: (message: string, title?: string) => number;
  info: (message: string, title?: string) => number;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Tiny in-house toast system.
 *
 * We roll this instead of pulling in a library because (a) the surface area is
 * trivial and (b) we want full control over how API errors (especially provider
 * 401s) are rendered — the message text comes directly from the backend's
 * `{code, message}` envelope.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    (toast) => {
      counter.current += 1;
      const id = counter.current;
      const next: ToastItem = { ...toast, id };
      setItems((current) => [...current, next]);
      const duration = toast.duration ?? 5000;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      error: (message, title) => push({ tone: "error", message, title }),
      success: (message, title) => push({ tone: "success", message, title }),
      info: (message, title) => push({ tone: "info", message, title }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

interface ToastViewportProps {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}

function ToastViewport({ items, onDismiss }: ToastViewportProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={clsx(
        "pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 shadow-lg backdrop-blur",
        toast.tone === "error" && "border-red-200 bg-red-50/95 text-red-900",
        toast.tone === "warning" && "border-amber-200 bg-amber-50/95 text-amber-900",
        toast.tone === "success" && "border-emerald-200 bg-emerald-50/95 text-emerald-900",
        toast.tone === "info" && "border-sky-200 bg-sky-50/95 text-sky-900",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "mt-0.5 inline-block h-2 w-2 flex-none rounded-full",
            toast.tone === "error" && "bg-red-500",
            toast.tone === "warning" && "bg-amber-500",
            toast.tone === "success" && "bg-emerald-500",
            toast.tone === "info" && "bg-sky-500",
          )}
        />
        <div className="flex-1">
          {toast.title && <div className="text-sm font-semibold">{toast.title}</div>}
          <div className="text-sm leading-relaxed">{toast.message}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 rounded-md p-1 text-current opacity-60 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
