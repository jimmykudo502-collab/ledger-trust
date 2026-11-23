/**
 * Runs work in one database transaction for a client, so changes across
 * several repositories (e.g. a journal entry and its staged row) succeed or
 * fail together. Nested calls become savepoints.
 */
export type TransactionRunner = <T>(clientId: string, work: () => T) => T;
