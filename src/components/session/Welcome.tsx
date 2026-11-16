import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 按本地时间选问候语，与官方的早/午/晚三段一致 */
const pickGreeting = (hour: number) => {
  if (hour >= 18 || hour < 5) {
    return 'greetingEvening' as const
  }
  return hour < 12 ? ('greetingMorning' as const) : ('greetingAfternoon' as const)
}

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const greeting = t(pickGreeting(new Date().getHours()))
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting}>{greeting}</div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
