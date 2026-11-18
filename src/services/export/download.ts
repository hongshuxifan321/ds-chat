import { loadSession } from '../chat/db.js'
import { buildSessionFile } from './sessionHtml.js'

/** 导出单条对话为网页：读库里的完整会话，生成单文件 HTML 并触发下载 */

/** 失败原因：`empty` 这条对话还没有内容，`missing` 本机已经找不到这条记录 */
export type SessionExportReason = 'empty' | 'missing'

const exportError = (reason: SessionExportReason) => new Error(reason)

const triggerDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // 与导出备份一致：给浏览器一点时间取数据，再释放 URL
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const downloadSessionHtml = async (id: string) => {
  const session = await loadSession(id)
  if (!session) {
    throw exportError('missing')
  }
  if (session.messages.length === 0) {
    throw exportError('empty')
  }
  const { blob, name } = await buildSessionFile(session)
  triggerDownload(blob, name)
  return { name }
}
