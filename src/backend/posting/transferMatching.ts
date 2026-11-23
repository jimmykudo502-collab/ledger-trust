/** A row that could be one side of a transfer between the client's own accounts. */
export interface TransferCandidate {
  readonly id: number;
  readonly bankAccountId: number;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Positive = money in. */
  readonly amountCents: number;
}

/** Two rows that look like the two sides of one transfer. */
export interface TransferPair {
  readonly first: TransferCandidate;
  readonly second: TransferCandidate;
  /** Days between the two dates. */
  readonly daysApart: number;
}

/** About 3 to 4 days, per the PRD's matching window (FR-19). */
export const TRANSFER_WINDOW_DAYS = 4;

const DAY_MS = 86_400_000;

/**
 * Days between two ISO dates, ignoring order.
 * @param a First date.
 * @param b Second date.
 */
export const daysBetween = (a: string, b: string): number =>
  Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);

/**
 * Whether two rows could be the two sides of one transfer (FR-19): different
 * tabs, the same amount in opposite directions, and dates close together.
 * @param a One row.
 * @param b The other row.
 * @param windowDays The most days apart the dates may be.
 */
export const isTransferPair = (a: TransferCandidate, b: TransferCandidate, windowDays = TRANSFER_WINDOW_DAYS): boolean =>
  a.bankAccountId !== b.bankAccountId &&
  a.amountCents === -b.amountCents &&
  a.amountCents !== 0 &&
  daysBetween(a.date, b.date) <= windowDays;

/**
 * Finds likely transfers among a client's rows (FR-19).
 *
 * `certain` pairs are rows that each have exactly one possible partner, so
 * they can be matched without asking. `suggested` adds the best remaining
 * pairs (closest dates first) for rows with several possible partners; the
 * user confirms those. Every row appears in at most one pair.
 * @param candidates Rows that may be matched.
 * @param windowDays The most days apart the two dates may be.
 */
export const findTransferPairs = (
  candidates: readonly TransferCandidate[],
  windowDays = TRANSFER_WINDOW_DAYS,
): { certain: TransferPair[]; suggested: TransferPair[] } => {
  const edges: TransferPair[] = [];
  const degree = new Map<number, number>();
  // Bucket by absolute amount so only plausible partners are compared.
  const byAmount = new Map<number, TransferCandidate[]>();
  for (const row of candidates) {
    const key = Math.abs(row.amountCents);
    byAmount.set(key, [...(byAmount.get(key) ?? []), row]);
  }
  for (const group of byAmount.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        if (!isTransferPair(a, b, windowDays)) continue;
        const [first, second] = a.amountCents < 0 ? [a, b] : [b, a];
        edges.push({ first, second, daysApart: daysBetween(a.date, b.date) });
        degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
        degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
      }
    }
  }

  const certain = edges.filter((edge) => degree.get(edge.first.id) === 1 && degree.get(edge.second.id) === 1);
  const used = new Set(certain.flatMap((edge) => [edge.first.id, edge.second.id]));
  const suggested = [...certain];
  const rest = edges
    .filter((edge) => !used.has(edge.first.id) && !used.has(edge.second.id))
    .sort((x, y) => x.daysApart - y.daysApart || x.first.date.localeCompare(y.first.date) || x.first.id - y.first.id || x.second.id - y.second.id);
  for (const edge of rest) {
    if (used.has(edge.first.id) || used.has(edge.second.id)) continue;
    suggested.push(edge);
    used.add(edge.first.id);
    used.add(edge.second.id);
  }
  return { certain, suggested };
};
