import fs from "node:fs";
import path from "node:path";

import {
  accountTemplateSchema,
  type AccountTemplate,
} from "../../common/templates/accountTemplateSchemas";
import { UserFacingError } from "../errors";

/**
 * Persists the master chart of accounts template.
 */
export interface TemplateStore {
  /** The saved template, or `null` if none has been saved yet. */
  read(): AccountTemplate | null;
  /** Replaces the saved template. */
  write(template: AccountTemplate): void;
}

/**
 * Keeps the master template as a JSON file. Writes go to a temporary file
 * that is then renamed, so a crash never leaves a half-written template.
 */
export class JsonFileTemplateStore implements TemplateStore {
  /**
   * @param filePath Where the template JSON lives.
   */
  public constructor(private readonly filePath: string) {}

  /** @inheritdoc */
  public read(): AccountTemplate | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }
    try {
      return accountTemplateSchema.parse(
        JSON.parse(fs.readFileSync(this.filePath, "utf8")),
      );
    } catch {
      throw new UserFacingError(
        `The master template file is damaged and can't be read: ${this.filePath}`,
      );
    }
  }

  /** @inheritdoc */
  public write(template: AccountTemplate): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(template, null, 2), "utf8");
    fs.renameSync(tempPath, this.filePath);
  }
}

/**
 * Template store held in memory, for tests.
 */
export class InMemoryTemplateStore implements TemplateStore {
  private template: AccountTemplate | null = null;

  /** @inheritdoc */
  public read(): AccountTemplate | null {
    return this.template;
  }

  /** @inheritdoc */
  public write(template: AccountTemplate): void {
    this.template = structuredClone(template);
  }
}
