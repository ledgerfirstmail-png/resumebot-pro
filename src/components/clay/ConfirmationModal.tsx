import { X } from "lucide-react";
import { ClayButton } from "./ClayButton";

/** Soft clay confirmation modal (used for deleting a saved resume). */
export function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-clay-ink/30 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="clay-card relative w-full max-w-sm p-6">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
        <h3 className="clay-title text-lg">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <ClayButton variant="soft" onClick={onCancel} disabled={busy}>
            Cancel
          </ClayButton>
          <ClayButton
            onClick={onConfirm}
            disabled={busy}
            className="bg-destructive text-white hover:brightness-105"
          >
            {confirmLabel}
          </ClayButton>
        </div>
      </div>
    </div>
  );
}
