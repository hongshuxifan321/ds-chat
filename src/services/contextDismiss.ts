/**
 * 上下文提示条点「知道了」之后按「会话 + 档位」记住，存 localStorage。
 * - 换会话该弹还弹；同一会话同一档位不再弹；80% 关掉后涨到 95% 会再提醒一次。
 * - 只影响界面提示，不进入请求内容。
 * - 存储被禁用或配额满时退化为只在本页生效，不报错（与 settings.ts 一致的取舍）。
 */
export type ContextLevel = 'warn' | 'danger'

const KEY = 'chat-demo:context-dismissed'
/** 最多记 50 条会话；更早的被遗忘、提示条会重新出现一次，比无限增长更划算 */
const LIMIT = 50

type Dismissed = Record<string, ContextLevel[]>

let cache: Dismissed | null = null

const isLevel = (value: unknown): value is ContextLevel => value === 'warn' || value === 'danger'

const load = (): Dismissed => {
  if (cache) {
    return cache
  }
  const result: Dismissed = {}
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [id, levels] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(levels)) {
          const kept = levels.filter(isLevel)
          if (kept.length > 0) {
            result[id] = kept
          }
        }
      }
    }
  } catch {
    // 读不出来或不是合法 JSON 就当作没有记录
  }
  cache = result
  return result
}

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache ?? {}))
  } catch {
    // 存储不可用：只在内存里生效
  }
}

export const isContextNoticeDismissed = (sessionId: string, level: ContextLevel): boolean =>
  (load()[sessionId] ?? []).includes(level)

export const dismissContextNotice = (sessionId: string, level: ContextLevel) => {
  const all = load()
  const levels = all[sessionId] ?? []
  const next: Dismissed = {
    ...all,
    [sessionId]: levels.includes(level) ? levels : [...levels, level],
  }
  // 只保留最近的 LIMIT 条会话（对象键按插入顺序排列）
  const ids = Object.keys(next)
  cache = Object.fromEntries(ids.slice(Math.max(0, ids.length - LIMIT)).map((id) => [id, next[id]]))
  save()
}

/** 删除会话时清掉记录：重新导入同一份归档会复用同一个 id，否则提示条会被永久压制 */
export const forgetContextNotice = (sessionId: string) => {
  const all = load()
  if (!all[sessionId]) {
    return
  }
  cache = Object.fromEntries(Object.entries(all).filter(([id]) => id !== sessionId))
  save()
}
