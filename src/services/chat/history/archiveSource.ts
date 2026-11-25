import {
  readArchive,
  readDirectoryEntries,
  readEntry,
  readEntryByPath,
  type ArchiveEntry,
  type ArchiveEntryMeta,
} from './zipReader.js'

/**
 * 导入来源：官方导出的 ZIP，或系统自动解压后用户手上的同名文件夹。
 * 手机与 macOS 常在下载时自动解开压缩包，用户手里只剩目录，
 * 两种来源解析出的条目完全一致，上层导入流程不需要区分。
 */
export type ImportSource =
  | { kind: 'zip'; file: File }
  | { kind: 'dir'; files: File[] }

export type { ArchiveEntryMeta }

const MANIFEST = 'manifest.json'

/** 归档根目录：manifest.json 所在的层级，允许用户选到外面一层（下载目录） */
const findRoot = (paths: string[]): string | null => {
  let root: string | null = null
  for (const path of paths) {
    if (path !== MANIFEST && !path.endsWith(`/${MANIFEST}`)) {
      continue
    }
    const prefix = path === MANIFEST ? '' : path.slice(0, path.length - MANIFEST.length)
    if (root === null || prefix.length < root.length) {
      root = prefix
    }
  }
  return root
}

/** 条目顺序与 ZIP 约定一致：manifest → user → 全部会话 → index → 图片 */
const rank = (path: string): number => {
  if (path === MANIFEST) {
    return 0
  }
  if (path === 'user.json') {
    return 1
  }
  if (/^chat_sessions\/[^/]+\.json$/.test(path)) {
    return 2
  }
  if (path === 'chat_session_index.json') {
    return 3
  }
  return 4
}

async function* blobStream(blob: Blob): AsyncGenerator<Uint8Array> {
  if (typeof blob.stream !== 'function') {
    yield new Uint8Array(await blob.arrayBuffer())
    return
  }
  const reader = blob.stream().getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        return
      }
      if (value) {
        yield value
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** 目录来源的条目：路径相对归档根，跳过越界与结构非法的文件 */
const directoryEntries = (files: File[]): ArchiveEntry[] => {
  const items = files.map((file) => ({
    file,
    path: ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(
      /\\/g,
      '/'
    ),
  }))
  const root = findRoot(items.map((item) => item.path))
  if (root === null) {
    return []
  }
  const entries: ArchiveEntry[] = []
  for (const { file, path } of items) {
    if (!path.startsWith(root)) {
      continue
    }
    const relative = path.slice(root.length)
    if (!relative || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
      continue
    }
    // 目录来源没有真实偏移：用排序前的下标充当出现顺序，供「同一图片只存第一次」比较
    entries.push({ path: relative, size: file.size, offset: entries.length, stream: blobStream(file) })
  }
  return entries.sort((a, b) => rank(a.path) - rank(b.path) || (a.path < b.path ? -1 : 1))
}

/**
 * 打开归档来源：先回调全部条目名与大小（导入进度需要分母），再逐条产出。
 * ZIP 与解压后的目录都走这里，调用方不区分来源。
 */
export async function* openArchive(
  source: ImportSource,
  onDirectory?: (entries: ArchiveEntryMeta[]) => void,
  options?: { skip?: (path: string) => boolean }
): AsyncGenerator<ArchiveEntry> {
  if (source.kind === 'zip') {
    yield* readArchive(source.file, onDirectory, options)
    return
  }
  const entries = directoryEntries(source.files)
  const wanted = options?.skip ? entries.filter((entry) => !options.skip?.(entry.path)) : entries
  onDirectory?.(wanted.map((entry) => ({ path: entry.path, size: entry.size })))
  yield* wanted
}

/**
 * 只列条目名与解压后大小，不解压任何内容。
 * 导入前的体积预览用它；ZIP 走中央目录，目录来源直接读文件大小。
 */
export const listArchiveEntries = async (source: ImportSource): Promise<ArchiveEntryMeta[]> =>
  source.kind === 'zip'
    ? readDirectoryEntries(source.file)
    : directoryEntries(source.files).map((entry) => ({ path: entry.path, size: entry.size }))

/** 读取单个文本条目；条目不存在时返回 null。 */
export const readArchiveText = async (
  source: ImportSource,
  path: string
): Promise<string | null> => {
  if (source.kind === 'zip') {
    const blob = await readEntryByPath(source.file, path)
    return blob ? blob.text() : null
  }
  const entry = directoryEntries(source.files).find((item) => item.path === path)
  return entry ? (await readEntry(entry)).text() : null
}
