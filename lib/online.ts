/** Browser connectivity. Server environments count as online. */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

export const OFFLINE_MESSAGE = "No connection. Reconnect, then try again — nothing was saved."
