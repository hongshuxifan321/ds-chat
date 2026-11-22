/**
 * 保存失败的本地记录。
 *
 * 为什么单独存在 localStorage：IndexedDB 写不进去的时候（配额满、连接被关、数据库损坏），
 * 正是最需要留下证据的时刻。localStorage 是另一套后端，往往还活着，所以用它当「黑匣子」。
 * 只记失败的名字与消息，不记对话内容——诊断不需要，泄露风险却是实的。
 */

export type SaveFailure = {
  /** 失败时间戳 */
  at: number
  /** 哪条会话没存进去 */
  sessionId: string
  /** 错误名，如 QuotaExceededError */
  name: string
  /** 错误消息，截断保存 */
  message: string
  /** 之后有一条保存成功了，这条算自愈 */
  resolved?: boolean
  /** 用户看过提示了，不必再弹 */
  dismissed?: boolean
}

const KEY = 'chat-demo:save-log'
const LIMIT = 20
const MESSAGE_MAX = 200

const read = (): SaveFailure[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SaveFailure[]) : []
  } catch {
    return []
  }
}

/** 写不进去就算了：这是诊断用的旁路，不能因为它再抛一次错拖垮保存流程。 */
const write = (entries: SaveFailure[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-LIMIT)))
  } catch {
    // 存储整体不可用时，日志也没地方放。
  }
}

export const recordSaveFailure = (sessionId: string, error: unknown) => {
  const entries = read().filter((entry) => entry.sessionId !== sessionId || entry.resolved)
  entries.push({
    at: Date.now(),
    sessionId,
    name: error instanceof Error ? error.name : typeof error,
    message: (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE_MAX),
  })
  write(entries)
}

/** 这条会话之后存成功了：之前的失败标记为已自愈，只为数统计用。 */
export const resolveSaveFailures = (sessionId: string) => {
  const entries = read()
  let changed = false
  for (const entry of entries) {
    if (entry.sessionId === sessionId && !entry.resolved) {
      entry.resolved = true
      changed = true
    }
  }
  if (changed) {
    write(entries)
  }
}

/** 上次打开到现在还没被解释掉的失败：下次启动时提醒用户「有一批对话没能存下来」。 */
export const pendingSaveFailures = (): SaveFailure[] =>
  read().filter((entry) => !entry.resolved && !entry.dismissed)

export const dismissSaveFailures = () => {
  const entries = read()
  let changed = false
  for (const entry of entries) {
    if (!entry.resolved && !entry.dismissed) {
      entry.dismissed = true
      changed = true
    }
  }
  if (changed) {
    write(entries)
  }
}

/** 最近一次失败是不是配额问题：决定弹「存不下了」还是普通横幅。 */
export const lastSaveFailureWasQuota = (): boolean => {
  const entries = read().filter((entry) => !entry.resolved)
  const last = entries.at(-1)
  return last !== undefined && last.name === 'QuotaExceededError'
}
