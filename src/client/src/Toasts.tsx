import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

export type ToastTone = "error" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_TTL_MS = 6000;

export interface ToastController {
  toasts: Toast[];
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

/**
 * Transient, non-fatal notifications. Unlike the fatal load-error overlay, these
 * report a failed action (a split/close/save that didn't apply) without tearing
 * down the app, so user actions never fail silently.
 */
export const useToasts = (): ToastController => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "error") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }].slice(-4));
      window.setTimeout(() => dismissToast(id), TOAST_TTL_MS);
    },
    [dismissToast],
  );

  return { toasts, pushToast, dismissToast };
};

export const Toasts = ({ toasts, dismissToast }: Pick<ToastController, "toasts" | "dismissToast">) => {
  if (toasts.length === 0) return null;
  return (
    <div className="wmux-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`wmux-toast wmux-toast-${toast.tone}`}>
          <span className="wmux-toast-message">{toast.message}</span>
          <button
            type="button"
            className="wmux-toast-dismiss"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
