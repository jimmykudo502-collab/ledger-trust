import type { Database } from "better-sqlite3";

import type {
  ClientId,
  ClientSummary,
  CreateClientInput,
  FiscalYearEnd,
} from "../../common/clients/clientSchemas";
import type { ClientConnectionPool } from "../db/ClientConnectionPool";
import type { ClientFileStore } from "../db/ClientFileStore";
import { UserFacingError } from "../errors";
import type { ClientRepository } from "./ClientRepository";

interface ProfileRow {
  name: string;
  fiscal_year_end: string;
  archived_at: string | null;
  created_at: string;
}

const SELECT_PROFILE = `
  SELECT name, fiscal_year_end, archived_at, created_at
  FROM client_profile WHERE id = 1`;

/**
 * Client repository backed by one SQLite file per client (FR-2). Each
 * client's profile lives in the single `client_profile` row of its own file.
 */
export class SqliteClientRepository implements ClientRepository {
  /**
   * @param fileStore Lists client files and allocates new ids.
   * @param pool Open connections to client databases.
   */
  public constructor(
    private readonly fileStore: ClientFileStore,
    private readonly pool: ClientConnectionPool,
  ) {}

  /** @inheritdoc */
  public list(): ClientSummary[] {
    return this.fileStore
      .listClientIds()
      .map((id) => this.find(id))
      .filter((client): client is ClientSummary => client !== undefined);
  }

  /** @inheritdoc */
  public find(clientId: ClientId): ClientSummary | undefined {
    if (!this.fileStore.exists(clientId)) {
      return undefined;
    }
    const row = this.pool.get(clientId).prepare(SELECT_PROFILE).get() as
      | ProfileRow
      | undefined;
    // A file without a profile row is a client whose creation never finished.
    return row ? toSummary(clientId, row) : undefined;
  }

  /** @inheritdoc */
  public create(input: CreateClientInput): ClientSummary {
    const id = this.fileStore.newClientId();
    this.pool
      .create(id)
      .prepare(
        "INSERT INTO client_profile (id, name, fiscal_year_end) VALUES (1, ?, ?)",
      )
      .run(input.name, input.fiscalYearEnd);
    return this.require(id);
  }

  /** @inheritdoc */
  public rename(clientId: ClientId, name: string): ClientSummary {
    this.dbFor(clientId)
      .prepare("UPDATE client_profile SET name = ? WHERE id = 1")
      .run(name);
    return this.require(clientId);
  }

  /** @inheritdoc */
  public setFiscalYearEnd(
    clientId: ClientId,
    fiscalYearEnd: FiscalYearEnd,
  ): ClientSummary {
    this.dbFor(clientId)
      .prepare(
        "UPDATE client_profile SET fiscal_year_end = ? WHERE id = 1",
      )
      .run(fiscalYearEnd);
    return this.require(clientId);
  }

  /** @inheritdoc */
  public setArchived(clientId: ClientId, archived: boolean): ClientSummary {
    this.dbFor(clientId)
      .prepare(
        archived
          ? "UPDATE client_profile SET archived_at = coalesce(archived_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = 1"
          : "UPDATE client_profile SET archived_at = NULL WHERE id = 1",
      )
      .run();
    return this.require(clientId);
  }

  private dbFor(clientId: ClientId): Database {
    this.require(clientId);
    return this.pool.get(clientId);
  }

  private require(clientId: ClientId): ClientSummary {
    const client = this.find(clientId);
    if (!client) {
      throw new UserFacingError("That client no longer exists.");
    }
    return client;
  }
}

const toSummary = (id: ClientId, row: ProfileRow): ClientSummary => ({
  id,
  name: row.name,
  fiscalYearEnd: row.fiscal_year_end,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
});
