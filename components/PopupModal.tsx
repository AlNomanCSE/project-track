"use client";

type PopupModalProps = {
  open: boolean;
  title: string;
  message: string;
  variant?: "info" | "success" | "error" | "confirm";
  confirmLabel?: string;
  cancelLabel?: string;
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
  onClose,
  onConfirm
}: PopupModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal-card ${variant}`}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          {variant === "confirm" ? (
            <>
              <button type="button" className="secondary" onClick={onClose}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
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
