const CHAT_ID = /^[A-Za-z0-9_-]{16,32}$/

export function isChatId(value: string): boolean {
  return CHAT_ID.test(value)
}
