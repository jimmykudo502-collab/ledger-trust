import {
  maxDayInMonth,
  monthName,
  type FiscalYearEnd,
} from "../../../common/clients/clientSchemas";

interface FiscalYearEndPickerProps {
  value: FiscalYearEnd;
  onChange: (value: FiscalYearEnd) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * Month and day selectors for a fiscal year-end. Changing the month clamps
 * the day so it always exists in that month.
 */
export function FiscalYearEndPicker({ value, onChange }: FiscalYearEndPickerProps) {
  const days = Array.from({ length: maxDayInMonth(value.month) }, (_, i) => i + 1);

  return (
    <fieldset className="field-row">
      <legend>Fiscal year-end</legend>
      <label className="field">
        <span>Month</span>
        <select
          value={value.month}
          onChange={(event) => {
            const month = Number(event.target.value);
            onChange({ month, day: Math.min(value.day, maxDayInMonth(month)) });
          }}
        >
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {monthName(month)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Day</span>
        <select
          value={value.day}
          onChange={(event) =>
            onChange({ month: value.month, day: Number(event.target.value) })
          }
        >
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
