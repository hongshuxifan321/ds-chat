import { useTranslate } from '../../i18n/index.js'
import { IconChevronDownOutline14 } from '../base/icons.js'
import { useMessageTools } from './messageTools.js'
import styles from './ScrollToBottomButton.module.css'

/** 往上翻看旧消息时，输入框上方右侧出现「回到底部」按钮 */
export const ScrollToBottomButton = () => {
  const t = useTranslate()
  const tools = useMessageTools()

  if (!tools || tools.atBottom) {
    return null
  }

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('scrollToBottom')}
      title={t('scrollToBottom')}
      onClick={tools.jumpToBottom}
    >
      <IconChevronDownOutline14 />
    </button>
  )
}
