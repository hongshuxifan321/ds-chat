import { useEffect, useSyncExternalStore } from 'react'
import { useTranslate } from '../i18n/index.js'
import { useSettings } from '../services/settings.js'
import { useIsMobile, useMobileViewport, usePreventPageScroll } from './viewport.js'
import {
  bindChatPersistence,
  dismissPreviousSaveFailures,
  initChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { SaveFailureDialog } from '../components/storage/SaveFailureDialog.js'
import { useBackupExport } from '../components/storage/useBackupExport.js'
import { NoticeDialog } from '../components/notice/NoticeDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import {
  dismissStorageWarning,
  getStorageSnapshot,
  measureStorage,
  subscribeStorage,
} from '../services/chat/storageInfo.js'
import { formatBytes } from '../utils/format.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  // 配额满会弹模态，同一条信息不必再在顶部重复一遍
  const saveFailure = useChatStore((state) => state.saveFailure)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadIssue = useChatStore((state) =>
    state.activeId === null ? false : (state.sessionLoadErrors[state.activeId] ?? false)
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)
  const previousSaveFailures = useChatStore((state) => state.previousSaveFailures)
  const storage = useSyncExternalStore(subscribeStorage, getStorageSnapshot)
  const backup = useBackupExport()

  usePreventPageScroll(isMobile)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    void initChat()
    // 首次打开先在设置里输入 API Key
    ensureApiKey()
  }, [])

  // 空间用量：启动量一次（够不够弹提示条），之后每次回到页面再量（30 秒节流）
  useEffect(() => {
    void measureStorage()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void measureStorage()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // 保存失败时先把现有内容导出来：本机写不进去的时候，这是唯一还能带走对话的办法
  const onBackup = backup.run

  const loadText =
    !ready
      ? initError
        ? 'sessionListLoadFailed'
        : 'sessionLoading'
      : sessionLoadIssue === 'lost'
        ? 'sessionLost'
        : sessionLoadIssue === 'error'
          ? 'sessionLoadFailed'
          : 'sessionLoading'
  const canRetryLoad = !ready ? initError : sessionLoadIssue === 'error'

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? <MobileSider /> : siderCollapsed ? null : <Sider />}
        <main className={styles.main}>
          {previousSaveFailures > 0 ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSavePreviousFailed', { count: previousSaveFailures })}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={backup.busy}
                onClick={() => void backup.run()}
              >
                {t('historyExportBackup')}
              </Button>
              <Button variant="outlined" size="s" onClick={dismissPreviousSaveFailures}>
                {t('dismiss')}
              </Button>
            </div>
          ) : storage !== null && storage.level === 'critical' && !storage.warningDismissed &&
            saveFailure === null ? (
            // 空间快满：写不进去之前的最后一次提醒。配额失败弹窗与「上次没保存」提示优先，
            // 那两条说的都是已经发生的事，没必要同时挂三条横幅。
            <div className={styles.saveError} role="alert">
              <span>{t('storageBanner', { size: formatBytes(storage.remaining) })}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={backup.busy}
                onClick={() => void backup.run()}
              >
                {t('historyExportBackup')}
              </Button>
              <Button variant="outlined" size="s" onClick={dismissStorageWarning}>
                {t('dismiss')}
              </Button>
            </div>
          ) : null}
          {saveError && !saveFailure ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory || backup.busy}
                onClick={() => void onBackup()}
              >
                {t('historyExportBackup')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {siderCollapsed ? <CollapsedSider /> : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>{t(loadText)}</span>
                  {canRetryLoad ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
      </div>
      <SettingsDialog />
      <NoticeDialog />
      <SaveFailureDialog />
      <Toast />
    </>
  )
}
