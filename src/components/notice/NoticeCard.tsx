import { useTranslate } from '../../i18n/index.js'
import { openNotice, useNoticeDialog } from './noticeState.js'
import { closeMobileSider } from '../sider/mobileSiderState.js'
import styles from './Notice.module.css'

/** 侧边栏底部的公告入口：与余额卡同样的框，左边「公告栏」+ 未读红点，右边「去阅读」 */
export const NoticeCard = () => {
  const t = useTranslate()
  const unread = useNoticeDialog((state) => state.unread)
  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => {
        openNotice()
        // 移动端是从抽屉里点的，顺手收起抽屉，关掉面板就回到对话
        closeMobileSider()
      }}
    >
      <span className={styles.cardLabel}>
        {t('noticeTitle')}
        {unread ? <span className={styles.cardDot} aria-hidden="true" /> : null}
      </span>
      <span className={styles.cardAction}>{t('noticeReadAction')}</span>
    </button>
  )
}
