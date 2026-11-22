/**
 * 本机存储用量：浏览器给多少就显示多少，读不到就明说读不到。
 *
 * 阈值同时看「相对上限」和「绝对底线」：桌面 Chrome 实测上限 10 GiB，
 * 手机上往往只有几百 MB，只用一个百分比会在两端都失准——
 * 大配额按百分比永远到不了线，小配额按绝对字节又会天天报警。
 */

export type StorageLevel = 'ok' | 'low' | 'critical'

export type StorageSnapshot = {
  /** 本站点已用，含应用缓存与同源其他页面写入的内容 */
  usage: number
  /** 浏览器给本站点的上限 */
  quota: number
  remaining: number
  level: StorageLevel
  /** 浏览器是否把本站列为持久存储；不是的话，磁盘紧张时可能被自动清理 */
  persisted: boolean
  /** 测量时刻 */
  at: number
  /** 用户已经点过提示条上的「知道了」 */
  warningDismissed: boolean
}

const MB = 1024 * 1024

/** 绝对底线：还剩不到这个量级就提醒（按「还能再存几张图」判断，不是按百分比） */
const LOW_FLOOR = 200 * MB
const CRITICAL_FLOOR = 50 * MB
/** 相对上限：配额小的设备（手机）按比例提前提醒 */
const LOW_RATIO = 0.1
const CRITICAL_RATIO = 0.02
/** 两次读取的最小间隔：`estimate()` 是跨进程调用，不能挂在每次渲染或每次保存上 */
const MIN_INTERVAL = 30_000

export const storageLevel = (remaining: number, quota: number): StorageLevel => {
  if (!(quota > 0)) {
    return 'ok'
  }
  if (remaining <= Math.min(CRITICAL_FLOOR, quota * CRITICAL_RATIO)) {
    return 'critical'
  }
  if (remaining <= Math.min(LOW_FLOOR, quota * LOW_RATIO)) {
    return 'low'
  }
  return 'ok'
}

const storage = (): StorageManager | undefined =>
  (navigator as Navigator & { storage?: StorageManager }).storage

let snapshot: StorageSnapshot | null = null
let measuredAt = 0
let inflight: Promise<StorageSnapshot | null> | null = null
/** 点过「知道了」就一直压着，直到空间回到安全范围再重新生效 */
let dismissed = false

const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

/** 最近一次读到的值；浏览器不支持或还没读过时为 null。 */
export const getStorageSnapshot = (): StorageSnapshot | null => snapshot

export const subscribeStorage = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const readSnapshot = async (): Promise<StorageSnapshot | null> => {
  const api = storage()
  if (typeof api?.estimate !== 'function') {
    return snapshot
  }
  try {
    const estimate = await api.estimate()
    const quota = estimate.quota ?? 0
    const usage = estimate.usage ?? 0
    // 拿不到上限就不显示，也不要拿 usage 单方面下结论
    if (!(quota > 0)) {
      return snapshot
    }
    const remaining = Math.max(0, quota - usage)
    const level = storageLevel(remaining, quota)
    const persisted =
      typeof api.persisted === 'function' ? await api.persisted().catch(() => false) : false
    if (level !== 'critical') {
      dismissed = false
    }
    const next: StorageSnapshot = {
      usage,
      quota,
      remaining,
      level,
      persisted,
      at: Date.now(),
      warningDismissed: dismissed,
    }
    snapshot = next
    measuredAt = next.at
    return next
  } catch {
    // 读不到就保留上一次的值：偶尔一次失败不该把数字清成空白
    return snapshot
  }
}

/**
 * 重新读取用量。默认按 30 秒节流；导完、删完、手动刷新传 true 强制重读。
 * 并发调用共用同一个请求。
 */
export const measureStorage = (force = false): Promise<StorageSnapshot | null> => {
  if (inflight) {
    return inflight
  }
  if (!force && snapshot !== null && Date.now() - measuredAt < MIN_INTERVAL) {
    return Promise.resolve(snapshot)
  }
  inflight = readSnapshot().finally(() => {
    inflight = null
    emit()
  })
  return inflight
}

/** 提示条上的「知道了」：只在当前这一轮紧缺里压住，空间恢复后重新生效。 */
export const dismissStorageWarning = () => {
  if (!snapshot) {
    return
  }
  dismissed = true
  snapshot = { ...snapshot, warningDismissed: true }
  emit()
}
