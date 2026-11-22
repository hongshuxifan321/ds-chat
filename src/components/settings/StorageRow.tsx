import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { loadLocalStats } from '../../services/chat/db.js'
import { useChatStore } from '../../services/chat/store.js'
import {
  getStorageSnapshot,
  measureStorage,
  subscribeStorage,
} from '../../services/chat/storageInfo.js'
import { formatBytes, formatDate } from '../../utils/format.js'
import styles from './Settings.module.css'

type LocalStats = { sessions: number; files: number; attachmentBytes: number; lastWrite: number }

/** 用到这个量级就提醒一次「该导出了」：数据只在本机，攒得越多丢起来越疼 */
const BIG_USAGE = 200 * 1024 * 1024
const BIG_USAGE_KEY = 'chat-demo:storage-hint-shown'

/**
 * 设置 → 数据管理的第一行：本机已用多少、浏览器还肯写多少。
 * 注意 `quota` 不是设备容量：Chrome / Edge 报的是「已用 + 固定额度」，
 * 所以这里不摆「还能再存 X」的倒计时（那个数永远不变），只摆已用与余量。
 */
export const StorageRow = () => {
  const t = useTranslate()
  const storage = useSyncExternalStore(subscribeStorage, getStorageSnapshot)
  const sessionCount = useChatStore((state) => state.sessions.length)
  const [stats, setStats] = useState<LocalStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [bigUsage, setBigUsage] = useState(false)

  // 打开面板就读一次；30 秒内复用上次结果，不重复跨进程询问浏览器
  useEffect(() => {
    void measureStorage()
  }, [])

  // 条数变化（导入、删除、聊天中新增）时重读体检数字
  useEffect(() => {
    let alive = true
    void loadLocalStats()
      .then((next) => {
        if (alive) {
          setStats(next)
        }
      })
      .catch(() => {
        if (alive) {
          setStats(null)
        }
      })
    return () => {
      alive = false
    }
  }, [sessionCount])

  const refresh = async () => {
    setRefreshing(true)
    try {
      const [, nextStats] = await Promise.all([
        measureStorage(true),
        loadLocalStats().catch(() => null),
      ])
      if (nextStats) {
        setStats(nextStats)
      }
    } finally {
      setRefreshing(false)
    }
  }

  // 攒到一定量就劝一次备份：只劝一次（记在 localStorage），不反复打扰
  const usage = storage?.usage ?? 0
  useEffect(() => {
    if (usage < BIG_USAGE) {
      return
    }
    try {
      if (localStorage.getItem(BIG_USAGE_KEY) === '1') {
        return
      }
      localStorage.setItem(BIG_USAGE_KEY, '1')
    } catch {
      // 隐私模式写不进去：宁可不提示，也不每次都弹
    }
    setBigUsage(true)
  }, [usage])

  const level = storage?.level ?? 'ok'
  const lastWrite = stats && stats.lastWrite > 0 ? formatDate(stats.lastWrite) : null
  const details = [
    stats ? t('storageSessions', { count: stats.sessions }) : null,
    stats
      ? t('storageFiles', {
          count: stats.files,
          size: formatBytes(stats.attachmentBytes),
        })
      : null,
    lastWrite ? t('storageLastWrite', { date: lastWrite }) : null,
  ].filter((part) => part !== null)

  return (
    <div className={styles.cell}>
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.label}>{t('storageLabel')}</div>
          <div className={styles.description}>
            {storage === null
              ? t('storageUnknown')
              : t('storageUsed', {
                  used: formatBytes(storage.usage),
                  headroom: formatBytes(storage.headroom),
                })}
          </div>
          {level === 'ok' || storage === null ? null : (
            <div className={level === 'critical' ? styles.storageWarnCritical : styles.storageWarn}>
              {t(level === 'critical' ? 'storageCritical' : 'storageLow', {
                left: formatBytes(storage.headroom),
                max: formatBytes(storage.maxHeadroom),
              })}
            </div>
          )}
          {details.length > 0 ? (
            <div className={styles.storageDetails}>{details.join(' · ')}</div>
          ) : null}
          {storage === null ? null : (
            <div className={styles.storageDetails}>{t('storageHeadroomNote')}</div>
          )}
          {storage === null ? null : (
            <div className={styles.storageDetails}>
              {t(storage.persisted ? 'storagePersisted' : 'storageEvictable')}
            </div>
          )}
          {bigUsage && storage !== null ? (
            <div className={styles.storageDetails}>
              {t('storageBigUsage', { used: formatBytes(storage.usage) })}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.storageRefresh}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {t(refreshing ? 'storageRefreshing' : 'storageRefresh')}
        </button>
      </div>
    </div>
  )
}
