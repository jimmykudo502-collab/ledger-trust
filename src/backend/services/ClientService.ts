import {
  clientIdSchema,
  clientNameSchema,
  createClientInputSchema,
  fiscalYearEndSchema,
  type ClientSummary,
  type CreateClientInput,
  type FiscalYearEnd,
} from "../../common/clients/clientSchemas";
import type { ClientRepository } from "../repositories/ClientRepository";

/**
 * Sets up a newly created client's books, e.g. its required system accounts.
 */
export interface ClientInitializer {
  /**
   * Runs once right after a client is created.
   * @param clientId The new client's id.
   */
  initializeClient(clientId: string): void;
}

/**
 * Manages the client list (FR-1): create, rename, change year-end (FR-3),
 * archive and unarchive. Validates every input before it reaches storage.
 */
export class ClientService {
  /**
   * @param clients Where clients are stored.
   * @param initializers Run for every newly created client.
   */
  public constructor(
    private readonly clients: ClientRepository,
    private readonly initializers: readonly ClientInitializer[] = [],
  ) {}

  /**
   * Lists every client, archived ones included, sorted by name.
   */
  public list(): ClientSummary[] {
    return this.clients
      .list()
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
          a.id.localeCompare(b.id),
      );
  }

  /**
   * Creates a client with its own empty books.
   * @param input The client's name and fiscal year-end.
   * @returns The new client.
   */
  public create(input: CreateClientInput): ClientSummary {
    const client = this.clients.create(createClientInputSchema.parse(input));
    for (const initializer of this.initializers) {
      initializer.initializeClient(client.id);
    }
    return client;
  }

  /**
   * Renames a client.
   * @param clientId The client to rename.
   * @param name The new name.
   */
  public rename(clientId: string, name: string): ClientSummary {
    return this.clients.rename(
      clientIdSchema.parse(clientId),
      clientNameSchema.parse(name),
    );
  }

  /**
   * Changes a client's fiscal year-end (FR-3).
   * @param clientId The client to change.
   * @param fiscalYearEnd The new year-end.
   */
  public setFiscalYearEnd(
    clientId: string,
    fiscalYearEnd: FiscalYearEnd,
  ): ClientSummary {
    return this.clients.setFiscalYearEnd(
      clientIdSchema.parse(clientId),
      fiscalYearEndSchema.parse(fiscalYearEnd),
    );
  }

  /**
   * Archives or unarchives a client. Archived clients keep all their data.
   * @param clientId The client to change.
   * @param archived `true` to archive, `false` to restore.
   */
  public setArchived(clientId: string, archived: boolean): ClientSummary {
    return this.clients.setArchived(clientIdSchema.parse(clientId), archived);
  }
}
