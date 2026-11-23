import type { FiscalYearEnd } from "../../../common/clients/clientSchemas";

interface FiscalYearEndPickerProps {
  value: FiscalYearEnd;
  onChange: (value: FiscalYearEnd) => void;
}

/**
 * A date field for the last day of the client's current fiscal year.
 */
export function FiscalYearEndPicker({ value, onChange }: FiscalYearEndPickerProps) {
  return (
    <label className="field">
      <span>Fiscal year-end</span>
      <input
        type="date"
        value={value}
        min="1900-01-01"
        max="2199-12-31"
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="hint">
        The last day of the client's current fiscal year. Later years end on
        the same day each year.
      </span>
    </label>
  );
}

/**
 * The default year-end for a new client: December 31 of the current year.
 */
export const defaultFiscalYearEnd = (): FiscalYearEnd =>
  `${new Date().getFullYear()}-12-31`;
