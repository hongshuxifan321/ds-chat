import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  estimateLocalBytes,
  type ArchivePreview,
  type ArchiveSession,
} from '../../services/chat/history/preview.js'
import { formatBytes, formatDate } from '../../utils/format.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './Settings.module.css'

type Sort = 'time' | 'size'
type StorageInfo = { used: number; quota: number } | null

const sessionBytes = (session: ArchiveSession) => session.textBytes + session.imageBytes

/** 本机已用与上限；浏览器不给估算时返回 null，此时不做空间预检 */
const readStorage = async (): Promise<StorageInfo> => {
  const storage = (navigator as Navigator & { storage?: StorageManager }).storage
  if (typeof storage?.estimate !== 'function') {
    return null
  }
  try {
    const { usage = 0, quota = 0 } = await storage.estimate()
    return quota > 0 ? { used: usage, quota } : null
  } catch {
    return null
  }
}

/**
 * 导入前的清单：默认一条都不选，由用户决定带哪些进来。
 * 导入是整体替换，所以勾上的留下、没勾的从本机消失；体积按归档里的解压后字节算。
 */
export const ImportPicker = ({
  preview,
  existing,
  onCancel,
  onConfirm,
}: {
  preview: ArchivePreview
  /** 本机现有对话数：确认后会整体替换掉 */
  existing: number
  onCancel: () => void
  onConfirm: (selected: ReadonlySet<string>) => void
}) => {
  const t = useTranslate()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [sort, setSort] = useState<Sort>('time')
  // undefined = 还没读到，null = 浏览器不给估算
  const [storage, setStorage] = useState<StorageInfo | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void readStorage().then((info) => {
      if (alive) {
        setStorage(info)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(
    () =>
      sort === 'time'
        ? preview.sessions
        : [...preview.sessions].sort((a, b) => sessionBytes(b) - sessionBytes(a)),
    [preview.sessions, sort]
  )

  const picked = useMemo(
    () => preview.sessions.filter((session) => selected.has(session.id)),
    [preview.sessions, selected]
  )
  const estimated = useMemo(() => estimateLocalBytes(picked), [picked])
  const available =
    storage === null || storage === undefined ? null : Math.max(0, storage.quota - storage.used)
  const tooBig = available !== null && estimated > available
  // 平均一条多大，用来把「还差多少」折算成「再取消几条」
  const needCancel =
    tooBig && available !== null && picked.length > 0
      ? Math.min(
          picked.length,
          Math.ceil((estimated - available) / Math.max(1, estimated / picked.length))
        )
      : 0

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  const selectAll = () => setSelected(new Set(preview.sessions.map((session) => session.id)))
  const selectNone = () => setSelected(new Set())
  const invert = () =>
    setSelected(new Set(preview.sessions.filter((s) => !selected.has(s.id)).map((s) => s.id)))

  return (
    <Modal
      title={t('importPickTitle')}
      className={styles.importPicker}
      mainClassName={styles.importPickerMain}
      onClose={onCancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="dangerOutlined"
            size="m"
            disabled={selected.size === 0 || tooBig}
            onClick={() => onConfirm(selected)}
          >
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importPickerSummary}>
        <div>
          {t('importPickArchive', {
            count: preview.sessions.length,
            size: formatBytes(preview.totalBytes),
          })}
          {preview.imageBytes > 0
            ? ` · ${t('importPickImages', { size: formatBytes(preview.imageBytes) })}`
            : null}
        </div>
        <div>
          {storage === undefined
            ? t('importPickLocalLoading')
            : storage === null
              ? t('importPickUnknown')
              : t('importPickLocal', {
                  used: formatBytes(storage.used),
                  quota: formatBytes(storage.quota),
                })}
        </div>
      </div>
      <div className={styles.importPickerToolbar}>
        <button type="button" className={styles.importPickerChip} onClick={selectAll}>
          {t('importPickSelectAll')}
        </button>
        <button
          type="button"
          className={styles.importPickerChip}
          disabled={selected.size === 0}
          onClick={selectNone}
        >
          {t('importPickSelectNone')}
        </button>
        <button type="button" className={styles.importPickerChip} onClick={invert}>
          {t('importPickInvert')}
        </button>
        <span className={styles.importPickerSpacer} />
        <button
          type="button"
          aria-pressed={sort === 'time'}
          className={styles.importPickerChip}
          onClick={() => setSort('time')}
        >
          {t('importPickSortTime')}
        </button>
        <button
          type="button"
          aria-pressed={sort === 'size'}
          className={styles.importPickerChip}
          onClick={() => setSort('size')}
        >
          {t('importPickSortSize')}
        </button>
      </div>
      <div className={styles.importPickerList}>
        {rows.map((session) => {
          const date = formatDate(session.updatedAt)
          return (
            <label key={session.id} className={styles.importPickerRow}>
              <input
                type="checkbox"
                checked={selected.has(session.id)}
                onChange={() => toggle(session.id)}
              />
              <span className={styles.importPickerTitle}>
                {session.title ?? t('importPickUntitled')}
              </span>
              <span className={styles.importPickerMeta}>
                {date ? `${date.slice(5)} · ` : null}
                {t('importPickCount', { count: session.messageCount })} ·{' '}
                {formatBytes(sessionBytes(session))}
              </span>
            </label>
          )
        })}
      </div>
      <div className={tooBig ? styles.importPickerFooterWarn : styles.importPickerFooter}>
        {tooBig && available !== null ? (
          <span>
            {t('importPickTooBig', { available: formatBytes(available), count: needCancel })}
          </span>
        ) : selected.size === 0 ? (
          <span>{t('importPickEmpty')}</span>
        ) : (
          <>
            <span>
              {t('importPickSelected', {
                count: selected.size,
                size: formatBytes(estimated),
              })}
            </span>
            {available !== null ? (
              <span>{t('importPickRemain', { size: formatBytes(available - estimated) })}</span>
            ) : null}
          </>
        )}
      </div>
      {existing > 0 ? (
        <div className={styles.importPickerReplace}>
          {t('importPickReplace', { count: existing })}
        </div>
      ) : null}
    </Modal>
  )
}
