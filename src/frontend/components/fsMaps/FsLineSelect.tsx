import type { AccountType } from "../../../common/accounts/accountSchemas";
import { FS_MAP_LABELS, FS_SECTION_INFO, type FsLine, type FsMap } from "../../../common/fsMaps/fsMapSchemas";
import { lineOptionsFor } from "./fsMapLogic";

interface FsLineSelectProps {
  map: FsMap;
  accountType: AccountType;
  /** Lines of both maps. */
  lines: readonly FsLine[];
  /** The account's current line on this map, or null. */
  value: number | null;
  disabled?: boolean;
  onChange: (lineId: number | null) => void;
}

/**
 * Picks an account's FS line on one map, offering only lines the account's
 * type can go on, grouped by section.
 */
export function FsLineSelect({ map, accountType, lines, value, disabled, onChange }: FsLineSelectProps) {
  const groups = lineOptionsFor(lines, map, accountType);
  const offered = groups.some((group) => group.lines.some((line) => line.id === value));
  return (
    <select
      className={`fs-select${value === null || !offered ? " unmapped" : ""}`}
      aria-label={`${FS_MAP_LABELS[map]} FS line`}
      value={offered && value !== null ? String(value) : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
    >
      <option value="">— Not mapped —</option>
      {groups.map((group) => (
        <optgroup key={group.section} label={FS_SECTION_INFO[group.section].label}>
          {group.lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.code} {line.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
