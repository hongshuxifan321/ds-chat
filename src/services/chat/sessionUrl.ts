/**
 * 当前会话的深链：`#/s/<id>`。
 * 只改地址栏（`replaceState`），不新增历史记录，后退键行为与没有深链时一致。
 */
const PREFIX = '#/s/'

export const readSessionId = (): string | null => {
  const hash = window.location.hash
  if (!hash.startsWith(PREFIX)) {
    return null
  }
  const raw = hash.slice(PREFIX.length)
  if (!raw) {
    return null
  }
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

export const writeSessionId = (id: string | null) => {
  const next = id === null ? '' : `${PREFIX}${encodeURIComponent(id)}`
  const url = new URL(window.location.href)
  if (url.hash === next) {
    return
  }
  url.hash = next
  history.replaceState(history.state, '', url)
}
