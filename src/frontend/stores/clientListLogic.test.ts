import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ClientSummary } from "../../common/clients/clientSchemas";
import { sortClients, upsertClient, visibleClients } from "./clientListLogic";

const clientArb: fc.Arbitrary<ClientSummary> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  fiscalYearEnd: fc.constant("2026-12-31"),
  archivedAt: fc.option(fc.constant("2026-11-22T00:00:00.000Z"), {
    nil: null,
  }),
  createdAt: fc.constant("2026-11-22T00:00:00.000Z"),
});

const uniqueClients = fc.uniqueArray(clientArb, {
  selector: (client) => client.id,
  maxLength: 10,
});

describe("client list logic", () => {
  it("upsert keeps one entry per id, holds the newest version and stays sorted", () => {
    fc.assert(
      fc.property(uniqueClients, clientArb, fc.nat(), (clients, client, pick) => {
        // Half the time, update an existing client instead of adding one.
        const target =
          clients.length > 0 && pick % 2 === 0
            ? { ...client, id: clients[pick % clients.length].id }
            : client;
        const result = upsertClient(sortClients(clients), target);

        expect(result.filter((c) => c.id === target.id)).toEqual([target]);
        expect(new Set(result.map((c) => c.id)).size).toBe(result.length);
        expect(result.length).toBe(
          clients.some((c) => c.id === target.id)
            ? clients.length
            : clients.length + 1,
        );
        expect(result).toEqual(sortClients(result));
      }),
    );
  });

  it("upserting the same client twice is the same as once", () => {
    fc.assert(
      fc.property(uniqueClients, clientArb, (clients, client) => {
        const once = upsertClient(clients, client);
        expect(upsertClient(once, client)).toEqual(once);
      }),
    );
  });

  it("hides archived clients unless asked, and never drops active ones", () => {
    fc.assert(
      fc.property(uniqueClients, (clients) => {
        expect(visibleClients(clients, true)).toEqual(clients);
        expect(visibleClients(clients, false)).toEqual(
          clients.filter((c) => c.archivedAt === null),
        );
      }),
    );
  });
});
