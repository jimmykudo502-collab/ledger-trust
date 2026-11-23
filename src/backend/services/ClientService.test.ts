import * as fc from "fast-check";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  maxDayInMonth,
  type FiscalYearEnd,
} from "../../common/clients/clientSchemas";
import { ClientFileStore } from "../db/ClientFileStore";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ClientService, type ClientInitializer } from "./ClientService";

const validFiscalYearEnd: fc.Arbitrary<FiscalYearEnd> = fc
  .integer({ min: 1, max: 12 })
  .chain((month) =>
    fc.record({
      month: fc.constant(month),
      day: fc.integer({ min: 1, max: maxDayInMonth(month) }),
    }),
  );

const clientName = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((name) => name.trim().length > 0);

let workspace: TempClientWorkspace;
let service: ClientService;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  service = new ClientService(workspace.clients);
});

afterEach(() => {
  workspace.dispose();
});

describe("ClientService", () => {
  it("lists every created client exactly once, with what was entered", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: clientName, fiscalYearEnd: validFiscalYearEnd }), {
          maxLength: 5,
        }),
        (inputs) => {
          const before = service.list().length;
          const created = inputs.map((input) => service.create(input));
          const listed = service.list();

          expect(listed).toHaveLength(before + inputs.length);
          created.forEach((client, index) => {
            expect(listed.filter((c) => c.id === client.id)).toEqual([client]);
            expect(client.name).toBe(inputs[index].name.trim());
            expect(client.fiscalYearEnd).toEqual(inputs[index].fiscalYearEnd);
            expect(client.archivedAt).toBeNull();
          });
        },
      ),
      { numRuns: 20 },
    );
  });

  it("sorts the list by name, ignoring case", () => {
    for (const name of ["beta", "Alpha", "charlie"]) {
      service.create({ name, fiscalYearEnd: { month: 12, day: 31 } });
    }
    expect(service.list().map((c) => c.name)).toEqual([
      "Alpha",
      "beta",
      "charlie",
    ]);
  });

  it("saves renames and year-end changes", () => {
    const client = service.create({
      name: "Made-up Rentals",
      fiscalYearEnd: { month: 12, day: 31 },
    });

    fc.assert(
      fc.property(clientName, validFiscalYearEnd, (name, fiscalYearEnd) => {
        service.rename(client.id, name);
        service.setFiscalYearEnd(client.id, fiscalYearEnd);

        const [saved] = service.list();
        expect(saved.name).toBe(name.trim());
        expect(saved.fiscalYearEnd).toEqual(fiscalYearEnd);
      }),
      { numRuns: 30 },
    );
  });

  it("rejects days that don't exist in the month", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }).chain((month) =>
          fc.record({
            month: fc.constant(month),
            day: fc.integer({ min: maxDayInMonth(month) + 1, max: 40 }),
          }),
        ),
        (fiscalYearEnd) => {
          expect(() =>
            service.create({ name: "Made-up Co", fiscalYearEnd }),
          ).toThrow();
        },
      ),
    );
    expect(service.list()).toEqual([]);
  });

  it("rejects blank names", () => {
    expect(() =>
      service.create({ name: "   ", fiscalYearEnd: { month: 1, day: 31 } }),
    ).toThrow(/client name/);
  });

  it("treats archiving as idempotent and keeps data when unarchiving", () => {
    const client = service.create({
      name: "Made-up Rentals",
      fiscalYearEnd: { month: 6, day: 30 },
    });

    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), (steps) => {
        service.setArchived(client.id, false);
        let firstArchivedAt: string | null = null;
        for (const archived of steps) {
          const saved = service.setArchived(client.id, archived);
          if (archived) {
            firstArchivedAt ??= saved.archivedAt;
            expect(saved.archivedAt).toBe(firstArchivedAt);
          } else {
            firstArchivedAt = null;
            expect(saved.archivedAt).toBeNull();
          }
          expect(saved.name).toBe("Made-up Rentals");
        }
      }),
      { numRuns: 30 },
    );
  });

  it("runs initializers for each new client", () => {
    const initialized: string[] = [];
    const initializer: ClientInitializer = {
      initializeClient: (id) => initialized.push(id),
    };
    service = new ClientService(workspace.clients, [initializer]);

    const client = service.create({
      name: "Made-up Co",
      fiscalYearEnd: { month: 3, day: 31 },
    });

    expect(initialized).toEqual([client.id]);
  });

  it("reports a client that doesn't exist", () => {
    expect(() =>
      service.rename("6f1c2c38-3a56-4c43-9a3d-2f3a7b9e1c10", "New name"),
    ).toThrow(/no longer exists/);
  });
});

describe("ClientFileStore", () => {
  it("only ever builds paths inside its own folder", () => {
    const store = new ClientFileStore(workspace.directory);

    fc.assert(
      fc.property(fc.oneof(fc.uuid(), fc.string()), (id) => {
        let filePath: string;
        try {
          filePath = store.pathFor(id);
        } catch {
          return;
        }
        expect(path.dirname(filePath)).toBe(workspace.directory);
      }),
    );
    expect(() => store.pathFor("..\\..\\evil")).toThrow();
  });

  it("ignores files in the folder that aren't client databases", () => {
    const client = service.create({
      name: "Made-up Co",
      fiscalYearEnd: { month: 12, day: 31 },
    });
    fs.writeFileSync(path.join(workspace.directory, "notes.txt"), "hi");
    fs.writeFileSync(path.join(workspace.directory, "not-a-uuid.sqlite"), "");

    expect(workspace.fileStore.listClientIds()).toEqual([client.id]);
  });
});
