import { useCallback, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { BackupError, downloadHistory } from '../../services/chat/backup.js'
import { showToast } from '../base/toastState.js'

/**
 * 导出全部历史并提示结果。顶部提示条、崩溃页与「存不下了」弹窗共用这一份，
 * 免得三处各写一套错误映射、以后改文案还要改三个地方。
 * `last` 是最近一次成功导出的文件名，弹窗用它确认「东西已经在你手上了」；
 * 又一次写失败时要清掉——那句话只对导出那一刻的内容成立。
 */
export const useBackupExport = () => {
  const t = useTranslate()
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const reset = useCallback(() => setLast(null), [])
  const run = async () => {
    setBusy(true)
    setLast(null)
    try {
      const { missing, name } = await downloadHistory()
      setLast(name)
      showToast(missing > 0 ? t('historyExportSkipped', { count: missing }) : t('historyExported'))
    } catch (error) {
      showToast(
        error instanceof BackupError
          ? t(error.key)
          : t('historyExportFailed', {
              message: error instanceof Error ? error.message : String(error),
            })
      )
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, last, reset }
}
