import { useState } from "react";

/**
 * Tracks a form submission: busy flag and the error message to show if the
 * action rejects.
 * @param action The async work to run on submit.
 * @param onSuccess Called after the action resolves (e.g. close the dialog).
 */
export function useSubmit(
  action: () => Promise<unknown>,
  onSuccess: () => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, submit };
}
