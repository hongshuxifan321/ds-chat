import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { BackupError, downloadHistory } from '../../services/chat/backup.js'
import { showToast } from '../base/toastState.js'

/**
 * 导出全部历史并提示结果。顶部提示条与「存不下了」弹窗共用这一份，
 * 免得两处各写一套错误映射、以后改文案还要改两个地方。
 */
export const useBackupExport = () => {
  const t = useTranslate()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const { missing } = await downloadHistory()
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
  return { run, busy }
}
