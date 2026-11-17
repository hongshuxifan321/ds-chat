import clsx from 'clsx'
import { useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import {
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  downloadHistory,
  importHistory,
} from '../../services/chat/backup.js'
import type { ImportSource } from '../../services/chat/history/archiveSource.js'
import type { ImportProgress } from '../../services/chat/history/importArchive.js'
import { isBlobStorageError } from '../../services/chat/db.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  isChineseBrowser,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { PLATFORM_LINKS } from '../../services/links.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  // 教程弹窗：充值指引与官方历史导出步骤共用一个开关
  const [help, setHelp] = useState<HelpTopic | null>(null)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          if (!historyDelete.busy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => setSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content}>
          {section === 'general' ? (
            <>
              <ThemeSetting />
              <LocaleSetting />
              <TtsVoiceSetting />
              <LocationSetting />
            </>
          ) : (
            <>
              <ApiKeyField editor={apiKeyEditor} />
              <SetupSteps onTopUpHelp={() => setHelp('topUp')} />
              <ImportHistory
                historyImport={historyImport}
                disabled={historyBusy}
                busy={historyImport.busy}
                onExportHelp={() => setHelp('export')}
              />
              <ExportHistory disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          )}
        </div>
      </Modal>
      {historyImport.source ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyImport.busy ? <ImportProgress historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
      {help ? <HelpModal topic={help} onClose={() => setHelp(null)} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 覆盖导入的二次确认，叠在设置弹窗上 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="dangerOutlined" size="m" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
    </Modal>
  )
}

/**
 * 导入期间的进度弹窗：交代必须保持前台，并按阶段显示进度。
 * 不可关闭——关闭只会让人以为导入停了，实际仍在跑。
 * 会话读完还有「保存附件」和「写入本地」两段，只显示会话数会一直停在 100%。
 */
const ImportProgress = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  const progress = historyImport.progress
  const counted = progress !== null && progress.phase !== 'saving' ? progress : null
  const total = counted?.total ?? 0
  const percent =
    counted && total > 0 ? Math.min(100, Math.round((counted.done / total) * 100)) : 0
  const label = () => {
    if (!progress) {
      return t('historyImportingPreparing')
    }
    if (progress.phase === 'saving' || (progress.phase === 'files' && progress.total === 0)) {
      return t('historyImportingSaving')
    }
    if (progress.phase === 'files') {
      return t('historyImportingFiles', { done: progress.done, total: progress.total })
    }
    return progress.total > 0
      ? t('historyImportingProgress', { done: progress.done, total: progress.total })
      : t('historyImportingProcessed', { count: progress.done })
  }
  return (
    <Modal
      title={t('historyImportingTitle')}
      className={styles.importConfirm}
      onClose={() => {}}
      footer={<div className={styles.importProgress}>{label()}</div>}
    >
      <div className={styles.importConfirmText}>{t('historyImportingKeepAwake')}</div>
      <div
        className={styles.importProgressBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.importProgressFill} style={{ width: `${percent}%` }} />
      </div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status =
  | (TranslationMessage & { error?: boolean; reason?: TranslationKey; detail?: string })
  | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: ReactNode
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? `${t(status.key, status.reason ? { message: t(status.reason) } : status.params)}${
                  status.detail ? ` (${status.detail})` : ''
                }`
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 屏幕常亮句柄；不支持时返回 null，不影响导入 */
type WakeSentinel = { release(): Promise<void> }

/** 导入期间申请屏幕常亮：手机自动锁屏会挂起页面，正在跑的大事务会被中止 */
const requestWakeLock = async (): Promise<WakeSentinel | null> => {
  const api = (navigator as Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> }
  }).wakeLock
  if (!api) {
    return null
  }
  try {
    return await api.request('screen')
  } catch {
    return null
  }
}

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')

/** 兜底提示后面附带的技术原因：用户截图反馈时能直接看出卡在哪一步，过长只留开头一段 */
const ERROR_DETAIL_MAX = 120
const describeError = (error: unknown): string => {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const text = raw.replace(/\s+/g, ' ').trim()
  return text.length > ERROR_DETAIL_MAX ? `${text.slice(0, ERROR_DETAIL_MAX)}…` : text
}

/** 选归档后先提示覆盖；确认后才检查文件并执行导入，任何错误都提示导入失败。 */
const useHistoryImport = () => {
  const [source, setSource] = useState<ImportSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)
  const hidden = useRef(false)
  const wakeLock = useRef<WakeSentinel | null>(null)

  const releaseWakeLock = () => {
    void wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  const confirm = async () => {
    if (!source || importing.current) {
      return
    }
    importing.current = true
    hidden.current = false
    setSource(null)
    setBusy(true)
    setProgress(null)
    setStatus(null)
    void requestWakeLock().then((sentinel) => {
      // 申请是异步的，可能导入已经先结束了
      if (importing.current) {
        wakeLock.current = sentinel
      } else {
        void sentinel?.release().catch(() => {})
      }
    })
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        hidden.current = true
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    try {
      const { imported, skipped, skippedImages } = await importHistory(source, setProgress)
      setStatus(
        skippedImages > 0
          ? {
              key: 'historyImportImagesSkipped',
              params: { count: imported, images: skippedImages },
            }
          : skipped > 0
            ? { key: 'historyImportedPartial', params: { count: imported, skipped } }
            : {
                key: imported === 1 ? 'historyImportedOne' : 'historyImported',
                params: { count: imported },
              }
      )
    } catch (error) {
      // 先看是不是切后台导致的中断，再区分存储写不进去、空间不足与文件本身的问题
      setStatus(
        hidden.current
          ? { key: 'historyImportInterrupted', error: true }
          : isQuotaError(error)
            ? { key: 'historyImportNoSpace', error: true }
            : isBlobStorageError(error)
              ? { key: 'historyImportStoreBlocked', error: true }
              : error instanceof BackupError
                ? { key: error.key, error: true }
                : { key: 'historyImportFailed', error: true, detail: describeError(error) }
      )
    } finally {
      document.removeEventListener('visibilitychange', onHidden)
      releaseWakeLock()
      importing.current = false
      setBusy(false)
    }
  }

  return {
    source,
    busy,
    progress,
    status,
    select: setSource,
    cancel: () => setSource(null),
    confirm,
  }
}

/** 教程弹窗的内容：标题与步骤都是文案键，便于中英切换 */
type HelpTopic = 'topUp' | 'export'

const HELP_CONTENT: Record<HelpTopic, { title: TranslationKey; steps: TranslationKey[] }> = {
  topUp: {
    title: 'topUpHelpTitle',
    steps: ['topUpHelpStep1', 'topUpHelpStep2', 'topUpHelpStep3', 'topUpHelpStep4'],
  },
  export: {
    title: 'exportHelpTitle',
    steps: ['exportHelpStep1', 'exportHelpStep2', 'exportHelpStep3', 'exportHelpStep4'],
  },
}

/** 教程弹窗：编号步骤 + 底部关闭 */
const HelpModal = ({ topic, onClose }: { topic: HelpTopic; onClose: () => void }) => {
  const t = useTranslate()
  const { title, steps } = HELP_CONTENT[topic]
  return (
    <Modal
      title={t(title)}
      onClose={onClose}
      footer={
        <Button variant="outlined" size="m" onClick={onClose}>
          {t('close')}
        </Button>
      }
    >
      <ol className={styles.helpSteps}>
        {steps.map((step) => (
          <li key={step}>{t(step)}</li>
        ))}
      </ol>
    </Modal>
  )
}

/** 首次使用的三步引导：创建 Key → 充值 → 回填到上方输入框 */
const SetupSteps = ({ onTopUpHelp }: { onTopUpHelp: () => void }) => {
  const t = useTranslate()
  const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')
  return (
    <>
      <SettingCell
        label={t('setupStepCreateTitle')}
        description={t('setupStepCreateDesc')}
        status={null}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            onClick={() => open(PLATFORM_LINKS.apiKeys)}
          >
            {t('setupStepCreateAction')}
          </Button>
        }
      />
      <SettingCell
        label={t('setupStepTopUpTitle')}
        description={
          <>
            {t('setupStepTopUpDesc')}{' '}
            <button type="button" className={styles.helpLink} onClick={onTopUpHelp}>
              {t('billingHowTo')}
            </button>
          </>
        }
        status={null}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            onClick={() => open(PLATFORM_LINKS.topUp)}
          >
            {t('setupStepTopUpAction')}
          </Button>
        }
      />
      <SettingCell
        label={t('setupStepBackTitle')}
        description={t('setupStepBackDesc')}
        status={null}
        action={null}
      />
    </>
  )
}

/** 目录选择是 Chrome、Edge、桌面 Safari 与鸿蒙浏览器的私有属性，iOS Safari 不支持 */
const FOLDER_PICKER_SUPPORTED =
  typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype
/** 目录选择属性不在 React 的类型定义里，只能按属性对象透传 */
const FOLDER_INPUT_PROPS = {
  webkitdirectory: '',
  directory: '',
} as InputHTMLAttributes<HTMLInputElement>

/** 导入 = 覆盖：用于替换本地全部会话与附件，ZIP 与解压后的目录都能作为来源 */
const ImportHistory = ({
  historyImport,
  disabled,
  busy,
  onExportHelp,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
  busy: boolean
  onExportHelp: () => void
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  return (
    <SettingCell
      label={t('historyImport')}
      description={
        <>
          {t('historyImportDescription')}{' '}
          <button type="button" className={styles.helpLink} onClick={onExportHelp}>
            {t('exportHelpLink')}
          </button>
        </>
      }
      status={historyImport.status}
      action={
        <>
          <div className={styles.actionColumn}>
            <Button
              variant="outlined"
              size="m"
              className={clsx(styles.cellButton, styles.uploadButton)}
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <IconUploadOutline14 />
              {t(busy ? 'historyImporting' : 'upload')}
            </Button>
            {FOLDER_PICKER_SUPPORTED ? (
              <button
                type="button"
                className={styles.folderLink}
                disabled={disabled}
                onClick={() => folderRef.current?.click()}
              >
                {t('historyImportFolder')}
              </button>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                historyImport.select({ kind: 'zip', file })
              }
            }}
          />
          <input
            ref={folderRef}
            type="file"
            hidden
            multiple
            {...FOLDER_INPUT_PROPS}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              event.target.value = ''
              if (files.length > 0) {
                historyImport.select({ kind: 'dir', files })
              }
            }}
          />
        </>
      }
    />
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { missing } = await downloadHistory()
      // 有记录已经不在本机时说明清楚，避免用户以为导出包是完整的
      if (missing > 0) {
        setStatus({ key: 'historyExportSkipped', params: { count: missing } })
      }
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}
