import { useEffect } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  acknowledgeSaveFailure,
  newChat,
  useChatStore,
} from '../../services/chat/store.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { useBackupExport } from './useBackupExport.js'
import styles from './SaveFailureDialog.module.css'

/**
 * 写不进去时的模态，只在配额满（`QuotaExceededError`）时出现。
 * 普通失败仍走顶部提示条——偶发一次不该打断；配额满则相反：继续聊只会产出更多存不下的内容，
 * 不挡住的话用户聊得越久丢得越多。
 * 遮罩点击与 Esc 都不当「继续」处理：误触一次就等于认输，必须明确按按钮。
 *
 * 三个出口对应三种真实打算：把内容带走（导出）、腾出空间（回列表删）、
 * 明知会丢也要接着聊（继续聊）。没有「重试」——空间没变时重试必然失败，只是多闪一次模态。
 */
export const SaveFailureDialog = () => {
  const t = useTranslate()
  const failure = useChatStore((state) => state.saveFailure)
  const backup = useBackupExport()
  const { reset } = backup
  // 又一次写失败说明导出之后又产生了没存下来的内容：「已导出」只对当时那一刻成立，不能留着冒充现在
  useEffect(reset, [failure, reset])
  if (!failure) {
    return null
  }
  // 回列表而不是原地待着：侧边栏才能删对话，删完直接接着聊，不用再找入口
  const freeSpace = () => {
    acknowledgeSaveFailure()
    newChat()
  }
  return (
    <Modal
      title={t('sessionSaveQuotaTitle')}
      onClose={() => {}}
      footer={
        <>
          <Button variant="outlined" size="m" disabled={backup.busy} onClick={freeSpace}>
            {t('sessionSaveFreeSpace')}
          </Button>
          <Button variant="outlined" size="m" onClick={acknowledgeSaveFailure}>
            {t('sessionSaveContinue')}
          </Button>
          <Button variant="primary" size="m" disabled={backup.busy} onClick={() => void backup.run()}>
            {t('sessionSaveExport')}
          </Button>
        </>
      }
    >
      {t('sessionSaveQuotaBody')}
      {backup.last === null ? null : (
        <div className={styles.exported}>{t('sessionSaveExported', { name: backup.last })}</div>
      )}
    </Modal>
  )
}
