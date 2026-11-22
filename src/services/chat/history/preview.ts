import { listArchiveEntries, readArchiveText, type ImportSource } from './archiveSource.js'
import { fail } from './errors.js'
import type { SessionIndexEntry } from './format.js'
import { INDEX_PATH, parseSessionFilesPath, parseSessionPath } from './paths.js'
import { readSessionIndex } from './schema.js'

/** 清单里的一条会话。体积是归档里的解压后字节，不是本机实际占用。 */
export type ArchiveSession = {
  id: string
  title: string | null
  /** 毫秒时间戳，来自索引里的 updated_at */
  updatedAt: number
  messageCount: number
  /** 会话 JSON 的解压后字节 */
  textBytes: number
  /** 这条会话的图片原件字节 */
  imageBytes: number
}

export type ArchivePreview = {
  /** 按更新时间倒序 */
  sessions: ArchiveSession[]
  totalBytes: number
  imageBytes: number
}

/** 每条会话的固定开销：IndexedDB 按记录分配，两三条消息的小会话也被放大到 4 KB 上下 */
const PER_SESSION_BYTES = 4 * 1024
/** 文本的放大系数：写入 IndexedDB 后会被压缩，实测约为归档解压后字节的七成 */
const TEXT_RATIO = 0.7
/** 图片的放大系数：导入时暂存与正式记录同时存在，峰值约为原字节的两倍 */
const IMAGE_RATIO = 2.2

/**
 * 把归档里的解压后字节换算成本机占用的估算值。
 * 系数按 2026-11-22 在 Chromium 上实测校准（120 条小会话、单条 400 KB、20 条 × 250 KB 三组，
 * 误差都在 15% 以内）：小会话由记录粒度主导、长会话由压缩比主导，所以按「条数 + 文本 + 图片」三项分开算。
 */
export const estimateLocalBytes = (sessions: Iterable<ArchiveSession>): number => {
  let total = 0
  for (const session of sessions) {
    total +=
      PER_SESSION_BYTES + TEXT_RATIO * session.textBytes + IMAGE_RATIO * session.imageBytes
  }
  return Math.round(total)
}

/**
 * 导入前的清单：只读中央目录与索引，不解压任何会话。
 * 归档里没有索引（更早的导出格式）时返回 null，调用方退回整体导入。
 */
export const previewArchive = async (source: ImportSource): Promise<ArchivePreview | null> => {
  const entries = await listArchiveEntries(source)
  if (!entries.some((entry) => entry.path === INDEX_PATH)) {
    return null
  }
  const text = await readArchiveText(source, INDEX_PATH)
  if (text === null) {
    return null
  }
  let index: SessionIndexEntry[]
  try {
    index = readSessionIndex(JSON.parse(text))
  } catch (error) {
    // 索引解析不了等同于归档损坏：没有清单就不能让用户选
    if (error instanceof SyntaxError) {
      fail('backupInvalidJson')
    }
    throw error
  }
  // 两遍扫描：先收会话 JSON 的体积，再按归属累加图片，结果不受条目物理顺序影响
  const textBytes = new Map<string, number>()
  for (const { path, size } of entries) {
    const id = parseSessionPath(path)
    if (id !== null) {
      textBytes.set(id, size)
    }
  }
  const imageBytes = new Map<string, number>()
  for (const { path, size } of entries) {
    const id = parseSessionFilesPath(path)
    if (id !== null && textBytes.has(id)) {
      imageBytes.set(id, (imageBytes.get(id) ?? 0) + size)
    }
  }
  const sessions: ArchiveSession[] = index
    // 索引里有、归档里没有会话 JSON 的条目导入时必然失败，不进清单
    .filter((entry) => textBytes.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      updatedAt: Date.parse(entry.updated_at),
      messageCount: entry.message_count,
      textBytes: textBytes.get(entry.id) ?? 0,
      imageBytes: imageBytes.get(entry.id) ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  // 索引列了会话、正文却一条都找不到：这是损坏的归档，照导入层的判定直接拒掉，
  // 不要让用户面对一个空清单（勾不了任何东西，也就没法确认）
  if (sessions.length === 0 && index.length > 0) {
    fail('backupIncomplete')
  }
  return {
    sessions,
    totalBytes: sessions.reduce((total, session) => total + session.textBytes + session.imageBytes, 0),
    imageBytes: sessions.reduce((total, session) => total + session.imageBytes, 0),
  }
}
