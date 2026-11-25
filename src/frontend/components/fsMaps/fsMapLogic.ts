import type { Account, AccountType } from "../../../common/accounts/accountSchemas";
import {
  canMap,
  compareFsLines,
  FS_SECTIONS,
  type FsAssignment,
  type FsLine,
  type FsMap,
  type FsSection,
} from "../../../common/fsMaps/fsMapSchemas";

/** A map's lines grouped by section, in statement order; empty sections are left out. */
export interface SectionGroup {
  readonly section: FsSection;
  readonly lines: readonly FsLine[];
}

/**
 * Groups one map's lines by section, sorted by map number within each.
 * @param lines Lines of both maps.
 * @param map Which map to show.
 */
export const linesBySection = (lines: readonly FsLine[], map: FsMap): SectionGroup[] => {
  const onMap = lines.filter((line) => line.map === map).sort(compareFsLines);
  return FS_SECTIONS.map((section) => ({ section, lines: onMap.filter((line) => line.section === section) })).filter(
    (group) => group.lines.length > 0,
  );
};

/**
 * The lines an account of this type can be mapped to on a map, grouped by
 * section (balance sheet accounts only to balance sheet lines, and so on).
 * @param lines Lines of both maps.
 * @param map Which map.
 * @param type The account's type.
 */
export const lineOptionsFor = (lines: readonly FsLine[], map: FsMap, type: AccountType): SectionGroup[] =>
  linesBySection(lines, map).filter((group) => canMap(type, group.section));

/**
 * Accounts with no line on a map (or a line that no longer fits their type).
 * @param accounts The client's accounts.
 * @param lines Lines of both maps.
 * @param assignments Every account's lines.
 * @param map Which map.
 */
export const unmappedAccounts = (
  accounts: readonly Account[],
  lines: readonly FsLine[],
  assignments: readonly FsAssignment[],
  map: FsMap,
): Account[] => {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const assignmentOf = new Map(assignments.map((a) => [a.accountId, a]));
  return accounts.filter((account) => {
    const lineId = assignmentOf.get(account.id)?.[map] ?? null;
    const line = lineId === null ? undefined : lineById.get(lineId);
    return line === undefined || !canMap(account.type, line.section);
  });
};
