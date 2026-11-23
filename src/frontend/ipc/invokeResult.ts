import { ipcRenderer } from "electron";

import type { IpcResult } from "../../common/ipc/IpcResult";

/**
 * Calls an app IPC channel and unwraps its {@link IpcResult}.
 * @param channel The channel name from `APP_CHANNELS`.
 * @param request The single request argument.
 * @returns The handler's value.
 * @throws Error carrying the handler's user-facing message.
 */
export const invokeResult = async <T>(
  channel: string,
  request?: unknown,
): Promise<T> => {
  const result = (await ipcRenderer.invoke(channel, request)) as IpcResult<T>;
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.value;
};
