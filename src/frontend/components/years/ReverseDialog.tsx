import { useState } from "react";

import { localToday } from "../../../common/fiscalYears";
import type { FiscalYearView } from "../../../common/years/yearSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";
import { defaultReversalDate } from "./yearLogic";

interface ReverseDialogProps {
  clientId: string;
  entry: { id: number; date: string; description: string };
  years: readonly FiscalYearView[];
  onReversed: () => void;
  onClose: () => void;
}

/**
 * Posts a reversing entry for an entry in a locked year (FR-27): the same
 * lines with debits and credits swapped, dated in an open period. The
 * original stays in the ledger.
 */
export function ReverseDialog({ clientId, entry, years, onReversed, onClose }: ReverseDialogProps) {
  const [date, setDate] = useState(() => defaultReversalDate(years, entry.date, localToday()));
  const { busy, error, submit } = useSubmit(async () => {
    await window.yearEnd.reverse(clientId, entry.id, date);
    onReversed();
  }, onClose);

  return (
    <ModalForm title="Reverse entry" submitLabel="Post reversal" busy={busy} error={error} onSubmit={submit} onClose={onClose}>
      <p>
        <strong>{entry.date}</strong> · {entry.description}
      </p>
      <p className="hint">
        This entry is in a locked year, so it can't be changed. A reversing entry posts the same lines with debits
        and credits swapped, so the original stays visible. Then post the corrected entry.
      </p>
      <label className="field date-field">
        <span>Date of the reversal (must be in an open year)</span>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
    </ModalForm>
  );
}
