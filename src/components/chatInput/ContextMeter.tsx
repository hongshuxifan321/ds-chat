import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { copyText } from '../../utils/clipboard.js'
import {
  CONTEXT_DANGER_RATIO,
  CONTEXT_WARN_RATIO,
  formatPercent,
  formatTokens,
  formatWindow,
  type ContextUsage,
} from '../../services/chat/context.js'
import styles from './ContextMeter.module.css'

/** 被用户关掉的提示条按会话记住：同一次页面会话里切回来不再弹 */
const dismissed = new Set<string>()

/** 已用比例分成三档：正常、接近上限、随时可能失败 */
export const levelOf = (ratio: number): 'normal' | 'warn' | 'danger' =>
  ratio >= CONTEXT_DANGER_RATIO ? 'danger' : ratio >= CONTEXT_WARN_RATIO ? 'warn' : 'normal'

/** 输入框右下角的圆环：点开是完整的说明，不用悬停也能看（手机没有悬停） */
export const ContextMeter = ({
  usage,
  onExplain,
}: {
  usage: ContextUsage
  onExplain: () => void
}) => {
  const t = useTranslate()
  const level = levelOf(usage.ratio)
  const radius = 7
  const circumference = 2 * Math.PI * radius
  const percent = formatPercent(usage.ratio)
  return (
    <button
      type="button"
      className={clsx(styles.meter, styles[level])}
      aria-label={t('contextMeterTooltip', {
        used: formatTokens(usage.used),
        window: formatWindow(usage.window),
        percent,
      })}
      onClick={onExplain}
    >
      <svg className={styles.ring} viewBox="0 0 18 18" aria-hidden>
        <circle className={styles.track} cx="9" cy="9" r={radius} />
        <circle
          className={styles.arc}
          cx="9"
          cy="9"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, usage.ratio))}
          transform="rotate(-90 9 9)"
        />
      </svg>
      {level === 'normal' ? null : <span className={styles.percent}>{percent}</span>}
    </button>
  )
}

/** 接近上限时在输入框上方出现的提示条：说清楚发生了什么、该怎么办 */
export const ContextNotice = ({
  sessionId,
  usage,
  onExplain,
}: {
  sessionId: string | null
  usage: ContextUsage
  onExplain: () => void
}) => {
  const t = useTranslate()
  const [, forceRender] = useState(0)
  const level = levelOf(usage.ratio)
  if (level === 'normal' || !sessionId || dismissed.has(sessionId)) {
    return null
  }
  const percent = formatPercent(usage.ratio)
  const values = {
    used: formatTokens(usage.used),
    window: formatWindow(usage.window),
    percent,
  }
  return (
    <div className={clsx(styles.notice, styles[`notice_${level}`])} role="status">
      <div className={styles.noticeTitle}>
        {t(level === 'danger' ? 'contextDangerTitle' : 'contextWarnTitle', values)}
      </div>
      <div className={styles.noticeBody}>
        {t(level === 'danger' ? 'contextDangerBody' : 'contextWarnBody', values)}
      </div>
      <div className={styles.noticeActions}>
        <button type="button" className={styles.linkButton} onClick={onExplain}>
          {t('contextHowTo')}
        </button>
        <Button
          variant="outlined"
          size="s"
          onClick={() => {
            dismissed.add(sessionId)
            forceRender((value) => value + 1)
          }}
        >
          {t('contextDismiss')}
        </Button>
      </div>
    </div>
  )
}

/** 说明卡：面向不需要懂 token 的用户，把「上下文」讲成日常说法，并给出可直接照做的三步 */
export const ContextCard = ({ usage, onClose }: { usage: ContextUsage; onClose: () => void }) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  const values = {
    used: formatTokens(usage.used),
    window: formatWindow(usage.window),
    percent: formatPercent(usage.ratio),
  }
  const copyPrompt = async () => {
    if (!(await copyText(t('contextSummaryPrompt')))) {
      showToast({ key: 'copyFailed' })
      return
    }
    setCopied(true)
    showToast({ key: 'contextCopyPromptDone' })
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Modal title={t('contextCardTitle')} closable onClose={onClose} mainClassName={styles.cardMain}>
      <div className={styles.card}>
        <div className={styles.cardValue}>
          {t('contextCardCurrent', values)}
          {usage.measured ? null : (
            <span className={styles.cardApprox}>{t('contextCardApprox')}</span>
          )}
        </div>
        <div className={styles.cardSectionTitle}>{t('contextCardWhatTitle')}</div>
        <p className={styles.cardText}>{t('contextCardWhat')}</p>
        <div className={styles.cardSectionTitle}>{t('contextCardWhyTitle')}</div>
        <p className={styles.cardText}>{t('contextCardWhy')}</p>
        <div className={styles.cardSectionTitle}>{t('contextCardAdviceTitle')}</div>
        <p className={styles.cardText}>{t('contextCardStep1')}</p>
        <p className={styles.cardText}>{t('contextCardStep2')}</p>
        <p className={styles.cardText}>{t('contextCardStep3')}</p>
        {/* 复制失败时也能手动选中：指令原文直接摆出来 */}
        <div className={styles.promptBox}>{t('contextSummaryPrompt')}</div>
        <Button
          variant="outlined"
          size="s"
          className={styles.copyPrompt}
          onClick={() => void copyPrompt()}
        >
          {copied ? t('contextCopyPromptDone') : t('contextCopyPrompt')}
        </Button>
      </div>
    </Modal>
  )
}
