import type {
  ClientId,
  ClientSummary,
  CreateClientInput,
  FiscalYearEnd,
} from "../../common/clients/clientSchemas";

/**
 * Stores clients and their profile (name, fiscal year-end, archive state).
 * Inputs are already validated by the caller.
 */
export interface ClientRepository {
  /** Every client, archived or not, in no particular order. */
  list(): ClientSummary[];
  /** One client, or `undefined` if no client has that id. */
  find(clientId: ClientId): ClientSummary | undefined;
  /** Creates a client (and its own database) and returns it. */
  create(input: CreateClientInput): ClientSummary;
  /** Changes a client's name. */
  rename(clientId: ClientId, name: string): ClientSummary;
  /** Changes a client's fiscal year-end. */
  setFiscalYearEnd(clientId: ClientId, fiscalYearEnd: FiscalYearEnd): ClientSummary;
  /**
   * Archives or unarchives a client. Archiving an archived client keeps its
   * original archive time.
   */
  setArchived(clientId: ClientId, archived: boolean): ClientSummary;
}
