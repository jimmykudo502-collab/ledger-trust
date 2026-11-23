import { useState } from "react";

import type {
  ClientSummary,
  FiscalYearEnd,
} from "../../../common/clients/clientSchemas";
import { useClientStore } from "../../stores/useClientStore";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";
import { FiscalYearEndPicker } from "./FiscalYearEndPicker";

interface DialogProps {
  onClose: () => void;
}

/**
 * Dialog for creating a client with its name and fiscal year-end.
 */
export function NewClientDialog({ onClose }: DialogProps) {
  const create = useClientStore((state) => state.create);
  const [name, setName] = useState("");
  const [fiscalYearEnd, setFiscalYearEnd] = useState<FiscalYearEnd>({
    month: 12,
    day: 31,
  });
  const { busy, error, submit } = useSubmit(
    () => create({ name, fiscalYearEnd }),
    onClose,
  );

  return (
    <ModalForm
      title="New client"
      submitLabel="Create client"
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <label className="field">
        <span>Client name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Maple Street Rentals"
        />
      </label>
      <FiscalYearEndPicker value={fiscalYearEnd} onChange={setFiscalYearEnd} />
      <p className="hint">
        The client starts with a blank chart of accounts plus the Bank Transfer
        Control account. You can change the year-end later.
      </p>
    </ModalForm>
  );
}

interface ClientDialogProps extends DialogProps {
  client: ClientSummary;
}

/**
 * Dialog for renaming a client.
 */
export function RenameClientDialog({ client, onClose }: ClientDialogProps) {
  const rename = useClientStore((state) => state.rename);
  const [name, setName] = useState(client.name);
  const { busy, error, submit } = useSubmit(
    () => rename(client.id, name),
    onClose,
  );

  return (
    <ModalForm
      title="Rename client"
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <label className="field">
        <span>Client name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </ModalForm>
  );
}

/**
 * Dialog for changing a client's fiscal year-end (FR-3).
 */
export function FiscalYearEndDialog({ client, onClose }: ClientDialogProps) {
  const save = useClientStore((state) => state.setFiscalYearEnd);
  const [fiscalYearEnd, setFiscalYearEnd] = useState(client.fiscalYearEnd);
  const { busy, error, submit } = useSubmit(
    () => save(client.id, fiscalYearEnd),
    onClose,
  );

  return (
    <ModalForm
      title="Change fiscal year-end"
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <FiscalYearEndPicker value={fiscalYearEnd} onChange={setFiscalYearEnd} />
    </ModalForm>
  );
}
