import type { ClientSummary } from "../../common/clients/clientSchemas";

/**
 * Sorts clients by name (case-insensitive), then id for a stable order.
 * @param clients The clients to sort; not modified.
 */
export const sortClients = (
  clients: readonly ClientSummary[],
): ClientSummary[] =>
  [...clients].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );

/**
 * Adds a client to the list, or replaces the existing one with the same id,
 * keeping the list sorted.
 * @param clients The current list; not modified.
 * @param client The new or updated client.
 */
export const upsertClient = (
  clients: readonly ClientSummary[],
  client: ClientSummary,
): ClientSummary[] =>
  sortClients([...clients.filter((c) => c.id !== client.id), client]);

/**
 * The clients the sidebar shows.
 * @param clients Every client.
 * @param showArchived Whether archived clients are included.
 */
export const visibleClients = (
  clients: readonly ClientSummary[],
  showArchived: boolean,
): ClientSummary[] =>
  clients.filter((client) => showArchived || client.archivedAt === null);
