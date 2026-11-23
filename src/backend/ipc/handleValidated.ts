import type { IpcMain } from "electron";
import { z } from "zod";

import type { IpcResult } from "../../common/ipc/IpcResult";
import { UserFacingError } from "../errors";

/**
 * Turns any thrown error into a message suitable for the UI.
 * @param error What was thrown.
 */
export const toErrorMessage = (error: unknown): string => {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(" ");
  }
  if (error instanceof UserFacingError) {
    return error.message;
  }
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
};

/**
 * Registers an IPC handler whose single argument is validated with zod and
 * whose outcome is wrapped in an {@link IpcResult}.
 * @param ipcMain Electron's main-process IPC.
 * @param channel The channel name from `APP_CHANNELS`.
 * @param requestSchema Schema the renderer's argument must match.
 * @param handler Does the work with the validated request.
 */
export const handleValidated = <Schema extends z.ZodType, Result>(
  ipcMain: IpcMain,
  channel: string,
  requestSchema: Schema,
  handler: (request: z.infer<Schema>) => Result,
): void => {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<IpcResult<Result>> => {
    try {
      const request = requestSchema.parse(payload);
      return { ok: true, value: await handler(request) };
    } catch (error) {
      if (!(error instanceof UserFacingError) && !(error instanceof z.ZodError)) {
        console.error(`IPC handler for ${channel} failed:`, error);
      }
      return { ok: false, error: toErrorMessage(error) };
    }
  });
};
