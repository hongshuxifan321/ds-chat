import * as db from '../db.js'
import type { Session } from '../types.js'
import { openArchive, type ImportSource } from './archiveSource.js'
import { BackupError, fail } from './errors.js'
import type { SessionIndexEntry } from './format.js'
import { INDEX_PATH, MANIFEST_PATH, parseSessionFilesPath, parseSessionPath, USER_PATH } from './paths.js'
import { checkManifest, readSessionFile, readSessionIndex } from './schema.js'
import { toLocalSession } from './toLocal.js'
import { ArchiveError, isZipFile, readEntry, skipEntry, type ArchiveEntry } from './zipReader.js'

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

/** 直接从条目流解码（上游 v0.1.4）：不先拼出一个完整 Blob，省一次大对象分配 */
const readJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const decoder = new TextDecoder('utf-8')
  let text = ''
  for await (const chunk of entry.stream) {
    text += decoder.decode(chunk, { stream: true })
  }
  text += decoder.decode()
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

/** 导入进度：会话与附件分两个阶段，最后是写入本地。界面据此换文案，避免停在 100% 不动 */
export type ImportProgress =
  | { phase: 'sessions'; done: number; total: number }
  | { phase: 'files'; done: number; total: number }
  | { phase: 'saving' }

/** 会话目录下的图片条目 */
const SESSION_FILE_PATH = /^chat_sessions\/[^/]+_files\//
/** 图片条目属于哪个会话 */
const fileOwner = (path: string) => /^chat_sessions\/([^/]+)_files\//.exec(path)?.[1]

export type ImportOptions = {
  /**
   * 只导入这些会话；未选中的会话连同它的图片都不解压。
   * 缺省表示整份归档都导入。
   */
  selected?: ReadonlySet<string>
  onProgress?: (progress: ImportProgress) => void
}

/** 暂存批量写入的上限：条数与字节各一道，避免一批撑爆内存或写太久占着事务 */
const SESSION_BATCH_COUNT = 32
const SESSION_BATCH_BYTES = 2 * 1024 * 1024
const IMAGE_BATCH_COUNT = 16
const IMAGE_BATCH_BYTES = 4 * 1024 * 1024

/**
 * 流式导入：manifest → user（不导入）→ 全部会话 JSON 与各自的图片 → index。
 * 也支持会话与图片交错排列、index 位于末尾的条目顺序。
 * 会话读完立即暂存，图片随所属会话一起写入；只回填归档里确实引用了图片的会话的 MIME。
 * 单个会话结构异常时跳过它、其余照常导入；归档本身损坏（解压、CRC 文件缺失）才整体失败。
 * 写入导入暂存存储；调用方负责先清空暂存，成功后替换正式数据，失败时清理暂存。
 * 返回被跳过的会话数与没能存下的图片张数。
 */
export const importArchive = async (
  source: ImportSource,
  { selected, onProgress }: ImportOptions = {}
): Promise<{ skipped: number; skippedImages: number }> => {
  if (source.kind === 'zip' && !(await isZipFile(source.file))) {
    fail(/\.json$/i.test(source.file.name) ? 'backupInsideArchive' : 'backupUnrecognized')
  }
  /** 未勾选的会话与其图片一律跳过；跳过时不命中解压，因此不校验 CRC */
  const skip = selected
    ? (path: string) => {
        const id = parseSessionPath(path) ?? parseSessionFilesPath(path)
        return id !== null && !selected.has(id)
      }
    : undefined
  const imported = new Set<string>()
  /** 解析失败被跳过的会话数 */
  let skipped = 0
  /** 没能存到本机的图片张数：空间不足或浏览器不接受，都不该让整份归档失败 */
  let skippedImages = 0
  /** 会话总数与附件总数，读中央目录得到 */
  let sessionTotal = 0
  let fileTotal = 0
  let savedFiles = 0
  let lastReport = 0
  /**
   * 界面既要有「在动」的反馈，又不能被几千个会话刷爆：首个与末个必报，其余最多每 100ms 报一次。
   * 早先按「每 10 个」回报，少于 10 个对话的归档会整段显示 0。
   */
  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) {
      return
    }
    lastReport = now
    onProgress?.({ phase: 'sessions', done: imported.size, total: sessionTotal })
  }
  const reportFiles = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) {
      return
    }
    lastReport = now
    onProgress?.({ phase: 'files', done: savedFiles, total: fileTotal })
  }

  /** 会话 ID → 该会话目录下的图片条目：图片可能排在自己会话之前，先按路径归位 */
  const filesBySession = new Map<string, ArchiveEntry[]>()
  /** 已保存的原件：文件 ID → MIME。同一图片出现在多个会话目录时只保存第一次 */
  const stored = new Map<string, string>()
  /** 图片 ID → 首次出现的条目偏移，用于上面那条去重 */
  const firstImageOffset = new Map<string, number>()
  /** 图片 ID → 引用它的会话，回填 MIME 时只碰这些会话 */
  const fileSessions = new Map<string, Set<string>>()
  let manifest = false
  let index: SessionIndexEntry[] | undefined

  let sessionBatch: Session[] = []
  let sessionBatchBytes = 0
  const flushSessions = async () => {
    if (!sessionBatch.length) {
      return
    }
    const batch = sessionBatch
    sessionBatch = []
    sessionBatchBytes = 0
    await db.addStagingSessions(batch)
    report()
  }

  let imageBatch: db.StoredFile[] = []
  let imageBatchBytes = 0
  const flushImages = async () => {
    if (!imageBatch.length) {
      return
    }
    const batch = imageBatch
    imageBatch = []
    imageBatchBytes = 0
    try {
      await db.saveStagingFiles(batch)
    } catch (error) {
      // 整批失败就退化成逐张写：一张写不进去（空间不足、单张超限）不该连累同批其余图片
      db.reportStorageError('save imported image')(error)
      for (const file of batch) {
        try {
          await db.saveStagingFiles([file])
        } catch (single) {
          db.reportStorageError('save imported image')(single)
          stored.delete(file.id)
          skippedImages += 1
        }
      }
    }
  }

  const saveImage = async (entry: ArchiveEntry, id: string) => {
    if (entry.offset >= (firstImageOffset.get(id) ?? Infinity)) {
      await skipEntry(entry)
      return
    }
    if (imageBatchBytes + entry.size > IMAGE_BATCH_BYTES) {
      await flushImages()
    }
    // 读到前 16 字节就判定 MIME，省掉再切一次 Blob
    const blob = await readEntry(entry, imageType)
    imageBatch.push({ id, blob })
    imageBatchBytes += blob.size
    firstImageOffset.set(id, entry.offset)
    stored.set(id, blob.type)
    savedFiles += 1
    reportFiles(savedFiles === fileTotal)
    if (imageBatch.length >= IMAGE_BATCH_COUNT || imageBatchBytes >= IMAGE_BATCH_BYTES) {
      await flushImages()
    }
  }

  try {
    // 先把条目收集齐：图片可能排在自己会话之前，会话与附件要能按 ID 对上。
    // 中央目录解析完先算总数（复用同一次解析），进度才有分母；未勾选的条目不在其中。
    const entries: ArchiveEntry[] = []
    for await (const entry of openArchive(
      source,
      (list) => {
        for (const item of list) {
          if (parseSessionPath(item.path) !== null) {
            sessionTotal += 1
          } else if (SESSION_FILE_PATH.test(item.path)) {
            fileTotal += 1
          }
        }
      },
      { skip }
    )) {
      entries.push(entry)
      const owner = parseSessionPath(entry.path)
      if (owner !== null) {
        filesBySession.set(owner, [])
      }
    }
    for (const entry of entries) {
      const owner = fileOwner(entry.path)
      filesBySession.get(owner ?? '')?.push(entry)
    }

    for (const entry of entries) {
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
        let local: ReturnType<typeof toLocalSession>
        try {
          local = toLocalSession(readSessionFile(await readJson(entry)))
          if (local.session.id !== sessionId) {
            fail('backupIncomplete')
          }
        } catch (error) {
          // 单个会话不符合预期就跳过它：官方导出格式由对方维护，
          // 一个会话结构异常不该让整份归档导入失败。归档本身损坏（ArchiveError）仍然中止。
          if (!(error instanceof BackupError)) {
            throw error
          }
          skipped += 1
          // 它名下的图片也一并跳过，别留成无主附件
          for (const fileEntry of filesBySession.get(sessionId) ?? []) {
            await skipEntry(fileEntry)
          }
          report()
          continue
        }
        imported.add(sessionId)
        // 图片随会话一起写：归档里图片排在会话前后都不影响
        for (const fileEntry of filesBySession.get(sessionId) ?? []) {
          const id = local.images.get(fileEntry.path)
          await (id === undefined ? skipEntry(fileEntry) : saveImage(fileEntry, id))
        }
        for (const message of local.session.messages) {
          if (message.role !== 'user') {
            continue
          }
          for (const attachment of message.files) {
            let sessions = fileSessions.get(attachment.id)
            if (!sessions) {
              sessions = new Set()
              fileSessions.set(attachment.id, sessions)
            }
            sessions.add(sessionId)
          }
        }
        if (sessionBatchBytes + entry.size > SESSION_BATCH_BYTES) {
          await flushSessions()
        }
        sessionBatch.push(local.session)
        sessionBatchBytes += entry.size
        if (
          sessionBatch.length >= SESSION_BATCH_COUNT ||
          sessionBatchBytes >= SESSION_BATCH_BYTES
        ) {
          await flushSessions()
        }
        report()
      } else if (path === INDEX_PATH && !index) {
        index = readSessionIndex(await readJson(entry))
        await flushSessions()
      } else if (SESSION_FILE_PATH.test(path)) {
        // 附件正文已经跟着所属会话处理过；这里只可能是没勾选会话的图片，跳过即可
        await skipEntry(entry)
      } else {
        // 不认识的条目直接跳过——宁可少一个附件，也不要整份归档失败。
        await skipEntry(entry)
      }
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  if (!manifest) {
    fail('backupUnrecognized')
  }
  const listed = index ?? fail('backupIncomplete')
  // index 只列出成功写出的会话；被跳过的会话即使出现在索引里也忽略。
  const listedIds = new Set(listed.map((entry) => entry.id))
  if (listedIds.size !== listed.length || [...imported].some((id) => !listedIds.has(id))) {
    fail('backupIncomplete')
  }
  if (imported.size === 0 && (sessionTotal > 0 || listedIds.size > 0)) {
    fail('backupIncomplete')
  }
  await flushSessions()
  await flushImages()
  // 会话与附件都读完了，剩下回填 MIME 和替换正式数据：换一条文案，别让进度停在 100%
  report(true)
  if (fileTotal > 0) {
    reportFiles(true)
  }
  onProgress?.({ phase: 'saving' })
  // 只回填归档里确实引用了图片的会话，省掉逐条扫暂存
  const targetSessions = new Set<string>()
  for (const [id, type] of stored) {
    if (!type) {
      continue
    }
    for (const sessionId of fileSessions.get(id) ?? []) {
      targetSessions.add(sessionId)
    }
  }
  if (targetSessions.size > 0) {
    await db.updateStagingFileTypes(stored, targetSessions)
  }
  return { skipped, skippedImages }
}
