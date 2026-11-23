/**
 * What every app IPC handler returns: the value, or a message to show the
 * user. Wrapping errors this way keeps Electron's "Error invoking remote
 * method" prefix out of the UI.
 */
export type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };
