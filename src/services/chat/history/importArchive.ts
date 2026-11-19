import * as db from '../db.js'
import { openArchive, type ImportSource } from './archiveSource.js'
import { BackupError, fail } from './errors.js'
import type { SessionIndexEntry } from './format.js'
import { INDEX_PATH, MANIFEST_PATH, USER_PATH, parseSessionPath } from './paths.js'
import { checkManifest, readSessionFile, readSessionIndex } from './schema.js'
import { toLocalSession } from './toLocal.js'
import {
  ArchiveError,
  isZipFile,
  readEntry,
  skipEntry,
  type ArchiveEntry,
} from './zipReader.js'

/** 从原件字节补充图片 MIME；无法识别时为空字符串，图片身份仍由归档的 is_image 决定。 */
const imageType = (bytes: Uint8Array): string => {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 12))
  if (startsWith(0xff, 0xd8, 0xff)) {
    return 'image/jpeg'
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png'
  }
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif'
  }
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x42, 0x4d)) {
    return 'image/bmp'
  }
  if (startsWith(0x49, 0x49, 0x2a, 0) || startsWith(0x4d, 0x4d, 0, 0x2a)) {
    return 'image/tiff'
  }
  if (header.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(header.slice(8, 12))) {
    return 'image/avif'
  }
  return ''
}

const readJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const text = await (await readEntry(entry)).text()
  try {
    return JSON.parse(text)
  } catch {
    return fail('backupInvalidJson')
  }
}

/** 进度回报的最小间隔：太密集会让大归档的时间花在界面重绘上 */
const PROGRESS_INTERVAL_MS = 100

/**
 * 检查归档格式、首个 manifest 条目及格式版本。
 * 校验失败时保留正在生成的回答和现有暂存数据。
 */
export const checkArchiveFormat = async (source: ImportSource): Promise<void> => {
  if (source.kind === 'zip' && !(await isZipFile(source.file))) {
    // 手机文件选择器里点开压缩包后，选中里面的 JSON 是最常见的误操作
    fail(/\.json$/i.test(source.file.name) ? 'backupInsideArchive' : 'backupUnrecognized')
  }
  try {
    for await (const entry of openArchive(source)) {
      if (entry.path !== MANIFEST_PATH) {
        fail('backupUnrecognized')
      }
      checkManifest(await readJson(entry))
      return
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  // 目录来源里连 manifest 都没有：多半选错了层级
  fail(source.kind === 'dir' ? 'backupFolderMissing' : 'backupUnrecognized')
}

/**
 * 流式导入：manifest → user（不导入）→ 全部会话 JSON → index → 全部图片。
 * 也支持会话与图片交错排列、index 位于末尾的条目顺序。
 * 会话读完立即暂存，只保留图片路径映射；图片全部读完后逐会话回填 MIME，不改变图片身份。
 * 单个会话结构异常时跳过它、其余照常导入；归档本身损坏（解压、CRC、文件缺失）才整体失败。
 * 写入导入暂存存储；调用方负责先清空暂存，成功后替换正式数据，失败时清理暂存。
 * `onProgress` 回报已处理会话数与会话总数，供界面显示进度；返回跳过的会话数与没能存下的图片张数。
 */
/** 导入进度：会话与附件分两个阶段，最后是写入本地。界面据此换文案，避免停在 100% 不动 */
export type ImportProgress =
  | { phase: 'sessions'; done: number; total: number }
  | { phase: 'files'; done: number; total: number }
  | { phase: 'saving' }

/** 会话目录下的图片条目 */
const SESSION_FILE_PATH = /^chat_sessions\/[^/]+_files\//

export const importArchive = async (
  source: ImportSource,
  onProgress?: (progress: ImportProgress) => void
): Promise<{ skipped: number; skippedImages: number }> => {
  if (source.kind === 'zip' && !(await isZipFile(source.file))) {
    fail(/\.json$/i.test(source.file.name) ? 'backupInsideArchive' : 'backupUnrecognized')
  }
  const imported = new Set<string>()
  /** 解析失败被跳过的会话数；这些会话的图片条目在下面一并跳过 */
  let skipped = 0
  /** 没能存到本机的图片张数：空间不足或浏览器不接受，都不该让整份归档失败 */
  let skippedImages = 0
  /** 会话总数，读中央目录得到；0 表示还没算出来 */
  let total = 0
  /** 附件（图片）总数：会话导完后还要逐个解压保存，进度必须继续动 */
  let fileTotal = 0
  let savedFiles = 0
  let lastReport = 0
  /**
   * 界面既要有「在动」的反馈，又不能被几千个会话刷爆：
   * 首个与末个必报，其余最多每 100ms 报一次。
   * 早先按「每 10 个」回报，少于 10 个对话的归档会整段显示 0。
   */
  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) {
      return
    }
    lastReport = now
    onProgress?.({ phase: 'sessions', done: imported.size, total })
  }
  const reportFiles = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) {
      return
    }
    lastReport = now
    onProgress?.({ phase: 'files', done: savedFiles, total: fileTotal })
  }
  const images = new Map<string, string>()
  /** 已保存的原件：文件 ID → MIME。同一图片出现在多个会话目录时只保存一次。 */
  const stored = new Map<string, string>()
  let manifest = false
  let index: SessionIndexEntry[] | undefined

  const saveImage = async (entry: ArchiveEntry, id: string) => {
    if (stored.has(id)) {
      await skipEntry(entry)
      return
    }
    const data = await readEntry(entry)
    const type = imageType(new Uint8Array(await data.slice(0, 16).arrayBuffer()))
    try {
      // 浏览器写不进 Blob 时会自动改存 base64（见 db.ts）；这里再兜一层：
      // 真写不进去（空间不足、单张超限）就跳过这一张，别让整份归档失败。
      await db.saveStagingFiles([{ id, blob: new Blob([data], { type }) }])
      stored.set(id, type)
    } catch (error) {
      db.reportStorageError('save imported image')(error)
      skippedImages += 1
    }
  }

  try {
    // 中央目录解析完先算出会话与附件总数，进度才有分母（复用同一次解析，不多读一遍）。
    for await (const entry of openArchive(source, (paths) => {
      total = paths.filter((path) => parseSessionPath(path) !== null).length
      fileTotal = paths.filter((path) => SESSION_FILE_PATH.test(path)).length
    })) {
      const { path } = entry
      const sessionId = parseSessionPath(path)
      if (!manifest) {
        if (path !== MANIFEST_PATH) {
          fail('backupUnrecognized')
        }
        checkManifest(await readJson(entry))
        manifest = true
      } else if (path === USER_PATH && !index && imported.size === 0) {
        // 账号信息（已脱敏）不导入；文件可能缺失。
        await skipEntry(entry)
      } else if (sessionId !== null && !index) {
        if (imported.has(sessionId)) {
          fail('backupIncomplete')
        }
        try {
          const local = toLocalSession(readSessionFile(await readJson(entry)))
          if (local.session.id !== sessionId) {
            fail('backupIncomplete')
          }
          await db.addStagingSession(local.session)
          imported.add(sessionId)
          for (const [imagePath, id] of local.images) {
            images.set(imagePath, id)
          }
        } catch (error) {
          // 单个会话不符合预期就跳过它：官方导出格式由对方维护，
          // 一个会话结构异常不该让整份归档导入失败。归档本身损坏（ArchiveError）仍然中止。
          if (!(error instanceof BackupError)) {
            throw error
          }
          skipped += 1
        }
        report(imported.size === 1 || imported.size === total)
      } else if (path === INDEX_PATH && !index) {
        index = readSessionIndex(await readJson(entry))
      } else {
        // 其余条目按图片处理：只有被成功导入的会话引用到的才保存。
        // 不认识的条目直接跳过——宁可少一个附件，也不要整份归档失败。
        const id = images.get(path)
        await (id === undefined ? skipEntry(entry) : saveImage(entry, id))
        if (id !== undefined) {
          savedFiles += 1
          reportFiles(savedFiles === fileTotal)
        }
      }
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  if (!manifest) {
    fail('backupUnrecognized')
  }
  const entries = index ?? fail('backupIncomplete')
  // index 只列出成功写出的会话；被跳过的会话即使出现在索引里也忽略。
  const listed = new Set(entries.map((entry) => entry.id))
  if (listed.size !== entries.length || [...imported].some((id) => !listed.has(id))) {
    fail('backupIncomplete')
  }
  if (imported.size === 0 && (total > 0 || listed.size > 0)) {
    fail('backupIncomplete')
  }
  // 会话与附件都读完了，剩下回填 MIME 和替换正式数据：换一条文案，别让进度停在 100%
  report(true)
  if (fileTotal > 0) {
    reportFiles(true)
  }
  onProgress?.({ phase: 'saving' })
  if (stored.size > 0) {
    await db.updateStagingFileTypes(stored)
  }
  return { skipped, skippedImages }
}
