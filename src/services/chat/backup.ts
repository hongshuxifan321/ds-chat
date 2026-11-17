import { formatDate } from '../../utils/format.js'
import * as db from './db.js'
import { fail } from './history/errors.js'
import type { ImportSource } from './history/archiveSource.js'
import type { ImportProgress } from './history/importArchive.js'
import { replaceHistory, useChatStore } from './store.js'
import type { Session } from './types.js'

export { BackupError } from './history/errors.js'

// 导入、导出与全部删除串行处理，避免读取归档时数据被清空或两个替换事务交错。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(run)
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepseek_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入；`missing` 是本机已找不到、被跳过的会话数。 */
export const exportHistory = (): Promise<{ name: string; blob: Blob; missing: number }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    let missing = 0
    let written = 0
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        let session: Session | undefined
        if (Object.hasOwn(sessionCache, summary.id)) {
          session = sessionCache[summary.id]
        } else {
          try {
            session = await db.loadSession(summary.id)
          } catch (error) {
            // 读不出来也跳过：本机已经写不进去的时候，这条更重要——不能让一条坏记录
            // 把整包导出弄失败，内存里还留着的对话是唯一能带走的部分。
            db.reportStorageError('read session for export')(error)
            session = undefined
          }
        }
        if (!session) {
          // 记录已被浏览器清掉（或正在删除）：跳过这一条，别让整包导出失败。
          missing += 1
          continue
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        written += 1
        yield { ...session, ...summary }
      }
      // 一条都读不出来时明确报错，别给用户一个空包
      if (sessions.length > 0 && written === 0) {
        fail('historyExportNothing')
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const blob = await exportArchive(readSessions())
    return { name: backupFileName(now), blob, missing }
  })

/** 导出并触发浏览器下载，返回被跳过的会话数；失败原因交给调用方提示。 */
export const downloadHistory = async (): Promise<{ missing: number }> => {
  const { name, blob, missing } = await exportHistory()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { missing }
}

/**
 * 确认覆盖后调用：先检查归档格式与版本，校验失败时保留正在生成的回答；
 * 通过后从 ZIP 或解压后的目录流式写入暂存，成功才替换原有会话与图片原件。
 * 返回成功导入的会话数与因结构异常被跳过的会话数。
 */
export const importHistory = (
  source: ImportSource,
  onProgress?: (progress: ImportProgress) => void
): Promise<{ imported: number; skipped: number }> =>
  enqueueBackup(async () => {
    const { checkArchiveFormat, importArchive } = await import('./history/importArchive.js')
    await checkArchiveFormat(source)
    let skipped = 0
    const imported = await replaceHistory(async () => {
      skipped = (await importArchive(source, onProgress)).skipped
    })
    return { imported, skipped }
  })

/** 确认删除后调用：以空历史原子替换全部本地会话与附件，保留 API Key 和其他设置。 */
export const clearHistory = (): Promise<void> =>
  enqueueBackup(async () => {
    await replaceHistory(async () => {})
  })
