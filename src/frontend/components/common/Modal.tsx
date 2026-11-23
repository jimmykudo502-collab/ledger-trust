import { useEffect, useRef, type FormEvent, type ReactNode } from "react";

interface ModalFormProps {
  /** Heading shown at the top of the dialog. */
  title: string;
  /** Label of the primary (submit) button. */
  submitLabel: string;
  /** Message from the last failed submit, shown above the buttons. */
  error: string | null;
  /** True while the submit is in progress. */
  busy: boolean;
  /** Called when the form is submitted. */
  onSubmit: () => void;
  /** Called when the dialog is cancelled (button or Escape). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal dialog wrapping a form, built on the native `<dialog>` element so
 * focus trapping and Escape-to-close come for free.
 */
export function ModalForm({
  title,
  submitLabel,
  error,
  busy,
  onSubmit,
  onClose,
  children,
}: ModalFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
