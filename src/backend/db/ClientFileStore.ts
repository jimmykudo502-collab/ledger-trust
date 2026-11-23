import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { clientIdSchema, type ClientId } from "../../common/clients/clientSchemas";

const FILE_EXTENSION = ".sqlite";

/**
 * Knows where client database files live: one `<client id>.sqlite` file per
 * client inside a single directory. Client ids are validated before they are
 * turned into paths, so a path can never point outside that directory.
 */
export class ClientFileStore {
  /**
   * @param directory Folder that holds the client database files.
   * @param generateId Source of new client ids (injectable for tests).
   */
  public constructor(
    private readonly directory: string,
    private readonly generateId: () => string = randomUUID,
  ) {}

  /**
   * Creates the client folder if it doesn't exist yet.
   */
  public ensureDirectory(): void {
    fs.mkdirSync(this.directory, { recursive: true });
  }

  /**
   * Picks an id for a new client whose file doesn't exist yet.
   * @returns A fresh client id.
   */
  public newClientId(): ClientId {
    for (;;) {
      const id = clientIdSchema.parse(this.generateId());
      if (!fs.existsSync(this.pathFor(id))) {
        return id;
      }
    }
  }

  /**
   * The database file path for a client.
   * @param clientId The client's id.
   * @throws Error if the id is not a valid client id.
   */
  public pathFor(clientId: string): string {
    const id = clientIdSchema.parse(clientId);
    return path.join(this.directory, `${id}${FILE_EXTENSION}`);
  }

  /**
   * Whether a client's database file exists.
   * @param clientId The client's id; invalid ids simply don't exist.
   */
  public exists(clientId: string): boolean {
    return (
      clientIdSchema.safeParse(clientId).success &&
      fs.existsSync(this.pathFor(clientId))
    );
  }

  /**
   * Lists the ids of every client file in the folder, ignoring other files.
   * @returns Client ids in no particular order.
   */
  public listClientIds(): ClientId[] {
    if (!fs.existsSync(this.directory)) {
      return [];
    }
    return fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith(FILE_EXTENSION))
      .map((file) => file.slice(0, -FILE_EXTENSION.length))
      .filter((id) => clientIdSchema.safeParse(id).success);
  }
}
