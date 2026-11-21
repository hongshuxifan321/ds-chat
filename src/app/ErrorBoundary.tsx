import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslate } from '../i18n/index.js'
import { downloadHistory } from '../services/chat/backup.js'
import { Button } from '../components/base/Button.js'
import styles from './ErrorBoundary.module.css'

/** 渲染异常兜底：至少给「刷新」和「导出备份」两条出路，不直接白屏。 */
const CrashFallback = ({ message }: { message: string }) => {
  const t = useTranslate()
  return (
    <div className={styles.frame} role="alert">
      <div className={styles.panel}>
        <h1 className={styles.title}>{t('crashTitle')}</h1>
        <p className={styles.hint}>{t('crashHint')}</p>
        <p className={styles.detail}>{message}</p>
        <div className={styles.actions}>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            {t('crashReload')}
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              // 界面已经崩了，导出失败也只能静默：能导出来就是额外收获
              void downloadHistory().catch(() => {})
            }}
          >
            {t('crashBackup')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[crash]', error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    return error ? <CrashFallback message={error.message} /> : this.props.children
  }
}
