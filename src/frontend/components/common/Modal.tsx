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
  /** Use the wide layout, e.g. for the import preview. */
  wide?: boolean;
  /** Disables the submit button, e.g. while there is nothing to submit. */
  submitDisabled?: boolean;
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
  wide = false,
  submitDisabled = false,
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
      className={wide ? "modal wide" : "modal"}
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
          <button type="submit" className="button primary" disabled={busy || submitDisabled}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
