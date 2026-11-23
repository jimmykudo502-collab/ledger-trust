import type { Migration } from "./Migration";

/**
 * The SQL expression used as the default for `created_at` columns: the current
 * UTC time as an ISO-8601 string with milliseconds.
 */
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

/** A CHECK that the column holds a real calendar date as `YYYY-MM-DD`. */
const isoDate = (column: string): string => `CHECK (date(${column}) IS ${column})`;

/** A CHECK that a text column is not empty or whitespace only. */
const notBlank = (column: string): string =>
  `CHECK (length(trim(${column})) > 0)`;

/**
 * Initial client schema covering the Phase 1 data model (PRD section 5):
 * client profile, chart of accounts, bank accounts, imports and staging,
 * the journal, fiscal years and remembered coding rules.
 *
 * Design notes:
 * - Tables are STRICT, so money columns reject anything but integer cents.
 * - Journal lines carry a debit or a credit, never both or neither.
 * - Foreign keys use the default RESTRICT behaviour, so an account with posted
 *   lines cannot be deleted (FR-8).
 * - Ledger balances are never stored; reports compute them from journal lines
 *   (FR-31).
 */
const initialSchema: Migration = {
  version: 1,
  name: "initial client schema",
  sql: `
    CREATE TABLE client_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL ${notBlank("name")},
      fiscal_year_end_month INTEGER NOT NULL CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
      fiscal_year_end_day INTEGER NOT NULL CHECK (fiscal_year_end_day BETWEEN 1 AND 31),
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW}
    ) STRICT;

    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE ${notBlank("code")},
      name TEXT NOT NULL ${notBlank("name")},
      type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
      system_key TEXT UNIQUE CHECK (system_key IN ('bank_transfer_control')),
      created_at TEXT NOT NULL DEFAULT ${NOW}
    ) STRICT;

    CREATE TABLE bank_accounts (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL UNIQUE REFERENCES accounts (id),
      name TEXT NOT NULL ${notBlank("name")},
      kind TEXT NOT NULL CHECK (kind IN ('bank', 'credit_card')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW}
    ) STRICT;

    CREATE TABLE import_batches (
      id INTEGER PRIMARY KEY,
      bank_account_id INTEGER NOT NULL REFERENCES bank_accounts (id),
      source_kind TEXT NOT NULL CHECK (source_kind IN ('xlsx', 'ods', 'paste')),
      source_name TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW}
    ) STRICT;

    CREATE TABLE staged_transactions (
      id INTEGER PRIMARY KEY,
      import_batch_id INTEGER NOT NULL REFERENCES import_batches (id),
      row_number INTEGER NOT NULL CHECK (row_number >= 1),
      txn_date TEXT NOT NULL ${isoDate("txn_date")},
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
      offset_account_id INTEGER REFERENCES accounts (id),
      status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'posted')),
      UNIQUE (import_batch_id, row_number)
    ) STRICT;

    CREATE TABLE fiscal_years (
      id INTEGER PRIMARY KEY,
      start_date TEXT NOT NULL UNIQUE ${isoDate("start_date")},
      end_date TEXT NOT NULL UNIQUE ${isoDate("end_date")},
      locked_at TEXT,
      closed_at TEXT,
      CHECK (start_date <= end_date)
    ) STRICT;

    CREATE TABLE journal_entries (
      id INTEGER PRIMARY KEY,
      entry_date TEXT NOT NULL ${isoDate("entry_date")},
      description TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('bank_import', 'manual', 'reversal', 'year_end_close', 'opening_balance')),
      staged_transaction_id INTEGER UNIQUE REFERENCES staged_transactions (id),
      reverses_entry_id INTEGER UNIQUE REFERENCES journal_entries (id),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      CHECK ((source = 'bank_import') = (staged_transaction_id IS NOT NULL)),
      CHECK ((source = 'reversal') = (reverses_entry_id IS NOT NULL))
    ) STRICT;

    CREATE TABLE journal_lines (
      id INTEGER PRIMARY KEY,
      journal_entry_id INTEGER NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL CHECK (line_number >= 1),
      account_id INTEGER NOT NULL REFERENCES accounts (id),
      debit_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
      credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
      memo TEXT,
      CHECK ((debit_cents > 0) <> (credit_cents > 0)),
      UNIQUE (journal_entry_id, line_number)
    ) STRICT;

    CREATE TABLE coding_rules (
      id INTEGER PRIMARY KEY,
      match_text TEXT NOT NULL ${notBlank("match_text")},
      account_id INTEGER NOT NULL REFERENCES accounts (id),
      bank_account_id INTEGER REFERENCES bank_accounts (id),
      created_at TEXT NOT NULL DEFAULT ${NOW}
    ) STRICT;

    CREATE INDEX journal_entries_by_date ON journal_entries (entry_date);
    CREATE INDEX journal_lines_by_account ON journal_lines (account_id);
    CREATE INDEX staged_transactions_by_match
      ON staged_transactions (txn_date, amount_cents);
  `,
};

/**
 * SQL for the year-end date in a given year for a stored month and day,
 * clamping February 29 to the last day of February in non-leap years.
 */
const yearEndIn = (yearExpression: string): string => `min(
  date(printf('%04d-%02d-01', ${yearExpression}, fiscal_year_end_month),
       printf('+%d days', fiscal_year_end_day - 1)),
  date(printf('%04d-%02d-01', ${yearExpression}, fiscal_year_end_month),
       '+1 month', '-1 day'))`;

/**
 * Stores the fiscal year-end as a full date (the end of the client's current
 * fiscal year, e.g. 2026-12-31) instead of a month and day. Existing clients
 * get the next year-end on or after today.
 */
const fiscalYearEndDate: Migration = {
  version: 2,
  name: "store fiscal year-end as a full date",
  sql: `
    CREATE TABLE client_profile_new (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL ${notBlank("name")},
      fiscal_year_end TEXT NOT NULL ${isoDate("fiscal_year_end")},
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW}
    ) STRICT;

    WITH this_year AS (
      SELECT *, ${yearEndIn("CAST(strftime('%Y', 'now') AS INTEGER)")} AS this_year_end,
                ${yearEndIn("CAST(strftime('%Y', 'now') AS INTEGER) + 1")} AS next_year_end
      FROM client_profile
    )
    INSERT INTO client_profile_new (id, name, fiscal_year_end, archived_at, created_at)
    SELECT id, name,
           CASE WHEN this_year_end >= date('now') THEN this_year_end ELSE next_year_end END,
           archived_at, created_at
    FROM this_year;

    DROP TABLE client_profile;
    ALTER TABLE client_profile_new RENAME TO client_profile;
  `,
};

/**
 * Confirmed transfers between a client's own accounts (FR-19): each pairs
 * two staged rows from different tabs, and a row is in at most one pair.
 * Removing an import removes its rows' pairs.
 */
const transferMatches: Migration = {
  version: 3,
  name: "transfer matches",
  sql: `
    CREATE TABLE transfer_matches (
      id INTEGER PRIMARY KEY,
      first_row_id INTEGER NOT NULL UNIQUE REFERENCES staged_transactions (id) ON DELETE CASCADE,
      second_row_id INTEGER NOT NULL UNIQUE REFERENCES staged_transactions (id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      CHECK (first_row_id <> second_row_id)
    ) STRICT;
  `,
};

/**
 * Year-end support (FR-27, FR-28): each fiscal year remembers the closing
 * entry posted for it, and client settings hold choices such as the
 * retained earnings account.
 */
const yearEnd: Migration = {
  version: 4,
  name: "year-end close",
  sql: `
    ALTER TABLE fiscal_years ADD COLUMN closing_entry_id INTEGER REFERENCES journal_entries (id);

    CREATE TABLE client_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
  `,
};

/** Every client database migration, oldest first. */
export const CLIENT_MIGRATIONS: readonly Migration[] = [
  initialSchema,
  fiscalYearEndDate,
  transferMatches,
  yearEnd,
];
