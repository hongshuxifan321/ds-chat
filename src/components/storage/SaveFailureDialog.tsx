import { useTranslate } from '../../i18n/index.js'
import {
  acknowledgeSaveFailure,
  retrySaveSessions,
  useChatStore,
} from '../../services/chat/store.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { useBackupExport } from './useBackupExport.js'

/**
 * 写不进去时的模态，只在配额满（`QuotaExceededError`）时出现。
 * 普通失败仍走顶部提示条——偶发一次不该打断；配额满则相反：继续聊只会产出更多存不下的内容，
 * 不挡住的话用户聊得越久丢得越多。
 * 遮罩点击与 Esc 都不当「继续」处理：误触一次就等于认输，必须明确按按钮。
 */
export const SaveFailureDialog = () => {
  const t = useTranslate()
  const failure = useChatStore((state) => state.saveFailure)
  const backup = useBackupExport()
  if (!failure) {
    return null
  }
  return (
    <Modal
      title={t('sessionSaveQuotaTitle')}
      onClose={() => {}}
      footer={
        <>
          <Button variant="outlined" size="m" disabled={backup.busy} onClick={acknowledgeSaveFailure}>
            {t('sessionSaveContinue')}
          </Button>
          <Button variant="outlined" size="m" disabled={backup.busy} onClick={retrySaveSessions}>
            {t('retry')}
          </Button>
          <Button variant="primary" size="m" disabled={backup.busy} onClick={() => void backup.run()}>
            {t('historyExportBackup')}
          </Button>
        </>
      }
    >
      {t('sessionSaveQuotaBody')}
    </Modal>
  )
}
