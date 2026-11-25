import { useState } from "react";

import {
  FS_MAP_LABELS,
  FS_SECTION_INFO,
  FS_SECTIONS,
  type FsLine,
  type FsLineInput,
  type FsMap,
  type FsSection,
} from "../../../common/fsMaps/fsMapSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";

interface FsLineDialogProps {
  map: FsMap;
  /** The line being edited, or `undefined` to add one. */
  line?: FsLine;
  /** Saves the form; rejects with a user-facing message. */
  onSave: (input: FsLineInput) => Promise<unknown>;
  onClose: () => void;
}

/** Dialog for adding or editing an FS line's map number, name and section (FR-33). */
export function FsLineDialog({ map, line, onSave, onClose }: FsLineDialogProps) {
  const [code, setCode] = useState(line?.code ?? "");
  const [name, setName] = useState(line?.name ?? "");
  const [section, setSection] = useState<FsSection>(line?.section ?? "current_assets");
  const { busy, error, submit } = useSubmit(() => onSave({ code, name, section }), onClose);
  const label = FS_MAP_LABELS[map].toLowerCase();

  return (
    <ModalForm
      title={line ? `Edit ${label} FS line` : `Add ${label} FS line`}
      submitLabel={line ? "Save" : "Add line"}
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="field-row">
        <label className="field code-field">
          <span>Map number</span>
          <input autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. 1000" />
        </label>
        <label className="field">
          <span>Line name (as printed on the statement)</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Cash and bank" />
        </label>
      </div>
      <label className="field">
        <span>Statement section</span>
        <select value={section} onChange={(event) => setSection(event.target.value as FsSection)}>
          <optgroup label="Balance sheet">
            {FS_SECTIONS.filter((s) => FS_SECTION_INFO[s].statement === "balanceSheet").map((s) => (
              <option key={s} value={s}>
                {FS_SECTION_INFO[s].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Income statement">
            {FS_SECTIONS.filter((s) => FS_SECTION_INFO[s].statement === "incomeStatement").map((s) => (
              <option key={s} value={s}>
                {FS_SECTION_INFO[s].label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {line && line.accountCount > 0 && (
        <p className="hint">
          {line.accountCount} account{line.accountCount === 1 ? " is" : "s are"} mapped to this line.
        </p>
      )}
    </ModalForm>
  );
}
