/**
 * 本机存储用量：浏览器给多少就显示多少，读不到就明说读不到。
 *
 * 关键事实（2026-11-22 实测，Chrome 158 / Edge 同一套 QuotaManager）：
 * `estimate().quota` 不是「这台设备能存多少」，而是**「当前已用 + 一个固定额度」**——
 * 空白档案里 quota − usage 恰好是 10 GiB 整；往 IndexedDB 连写 15 MB 之后，
 * usage 涨多少 quota 就跟着涨多少，差值一动不动。所以「还剩多少」在 Chrome / Edge 上
 * 是个常数，拿它当倒计时永远等不到零。
 *
 * 于是阈值改为**跟自己的历史比**：记下本机观察到过的最大余量，余量缩水到一半以下
 * 才算黄、两成以下才算红。Chrome / Edge 上这套永远不亮（余量恒为 10 GiB），
 * 但在 quota 是真容量的浏览器（Firefox 大约磁盘的 10%）上有效；
 * 哪天连 Chrome 的余量也开始缩，那就说明磁盘真的紧了。
 */

export type StorageLevel = 'ok' | 'low' | 'critical'

export type StorageSnapshot = {
  /** 本站点已用，含应用缓存与同源其他页面写入的内容 */
  usage: number
  /** 浏览器报的上限，等于 usage + 固定额度（见文件头） */
  quota: number
  /** quota − usage：浏览器说「此刻还能再写多少」 */
  headroom: number
  /** 本机观察到过的最大余量，用来判断「余量有没有缩水」 */
  maxHeadroom: number
  level: StorageLevel
  /** 浏览器是否把本站列为持久存储；不是的话，磁盘紧张时可能被自动清理 */
  persisted: boolean
  /** 测量时刻 */
  at: number
  /** 用户已经点过提示条上的「知道了」 */
  warningDismissed: boolean
}

const MB = 1024 * 1024

/** 余量缩到「历史最大余量」的这个比例才开始提醒 */
const LOW_RATIO = 0.5
const CRITICAL_RATIO = 0.2
/** 绝对底线：余量本身就很小（配额真的就几百 MB 的设备）时按这个兜底 */
const LOW_FLOOR = 100 * MB
const CRITICAL_FLOOR = 20 * MB
/** 两次读取的最小间隔：`estimate()` 是跨进程调用，不能挂在每次渲染或每次保存上 */
const MIN_INTERVAL = 30_000
/** 观察到的最大余量要跨会话记住，否则每次打开都以为「本来就这么多」 */
const MAX_KEY = 'chat-demo:storage-headroom-max'

export const storageLevel = (headroom: number, maxHeadroom: number): StorageLevel => {
  if (!(maxHeadroom > 0)) {
    return 'ok'
  }
  if (headroom <= Math.max(maxHeadroom * CRITICAL_RATIO, CRITICAL_FLOOR)) {
    return 'critical'
  }
  if (headroom <= Math.max(maxHeadroom * LOW_RATIO, LOW_FLOOR)) {
    return 'low'
  }
  return 'ok'
}

const readMaxHeadroom = (): number => {
  try {
    const stored = Number(localStorage.getItem(MAX_KEY) ?? '0')
    return Number.isFinite(stored) && stored > 0 ? stored : 0
  } catch {
    return 0
  }
}

const writeMaxHeadroom = (value: number) => {
  try {
    localStorage.setItem(MAX_KEY, String(value))
  } catch {
    // 隐私模式写不进去就算了：只影响「缩水」这个信号，不影响用量显示
  }
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
    const headroom = Math.max(0, quota - usage)
    // 记下见过的最大余量：Chrome / Edge 恒为固定额度，这个值就是那个常量；
    // 别的浏览器里它就是「满额余量」，缩水才说明空间真的紧了
    const storedMax = readMaxHeadroom()
    const maxHeadroom = Math.max(storedMax, headroom)
    if (maxHeadroom > storedMax) {
      writeMaxHeadroom(maxHeadroom)
    }
    const level = storageLevel(headroom, maxHeadroom)
    const persisted =
      typeof api.persisted === 'function' ? await api.persisted().catch(() => false) : false
    if (level !== 'critical') {
      dismissed = false
    }
    const next: StorageSnapshot = {
      usage,
      quota,
      headroom,
      maxHeadroom,
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
