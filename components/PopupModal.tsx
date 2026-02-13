"use client";

type PopupModalProps = {
  open: boolean;
  title: string;
  message: string;
  variant?: "info" | "success" | "error" | "confirm";
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmOrder?: "close-first" | "confirm-first";
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
};

export default function PopupModal({
  open,
  title,
  message,
  variant = "info",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  confirmOrder = "close-first",
  children,
  onClose,
  onConfirm
}: PopupModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal-card ${variant}`}>
        <h3>{title}</h3>
        <p>{message}</p>
        {children}
        <div className="modal-actions">
          {variant === "confirm" ? (
            <>
              <button type="button" className="secondary" onClick={onClose}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className="danger"
                disabled={confirmDisabled}
                onClick={() => {
                  if (confirmOrder === "confirm-first") {
                    onConfirm?.();
                    onClose();
                    return;
                  }
                  onClose();
                  onConfirm?.();
                }}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
