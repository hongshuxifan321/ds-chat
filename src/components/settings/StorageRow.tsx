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

/**
 * 设置 → 数据管理的第一行：本机已用多少、还能存多少。
 * 撞上配额之后才提示已经太晚（对话当时只存在内存里），所以这行是常驻的、带预警的。
 */
export const StorageRow = () => {
  const t = useTranslate()
  const storage = useSyncExternalStore(subscribeStorage, getStorageSnapshot)
  const sessionCount = useChatStore((state) => state.sessions.length)
  const [stats, setStats] = useState<LocalStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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
    lastWrite ? t('storageLastWrite', { date: lastWrite.slice(5) }) : null,
  ].filter((part) => part !== null)

  return (
    <div className={styles.cell}>
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.label}>{t('storageLabel')}</div>
          <div className={styles.description}>
            {storage === null
              ? t('storageUnknown')
              : t('storageRemain', {
                  size: formatBytes(storage.remaining),
                  used: formatBytes(storage.usage),
                  quota: formatBytes(storage.quota),
                })}
          </div>
          {level === 'ok' || storage === null ? null : (
            <div className={level === 'critical' ? styles.storageWarnCritical : styles.storageWarn}>
              {t(level === 'critical' ? 'storageCritical' : 'storageLow')}
            </div>
          )}
          {details.length > 0 ? (
            <div className={styles.storageDetails}>{details.join(' · ')}</div>
          ) : null}
          {storage === null ? null : (
            <div className={styles.storageDetails}>
              {t(storage.persisted ? 'storagePersisted' : 'storageEvictable')}
            </div>
          )}
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
