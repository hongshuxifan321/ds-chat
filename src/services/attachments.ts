import { create } from 'zustand'
import type { LinkedMessage, TranslationMessage } from '../i18n/index.js'
import { isUploadImageOversized } from '../utils/resizeUploadImage.js'
import { uploadFile } from './api/client.js'
import { classifyApiError, getUploadErrorInfo, isRetryableApiError } from './api/errors.js'
import type { FilePurpose } from './api/types.js'
import { loadFile } from './chat/db.js'
import type { FileAttachment } from './chat/types.js'
import { getFileExt, isSendableImage } from './imageFormat.js'
import { ACCEPT_FILE_EXTS } from './uploadExts.js'

export { getFileExt }

/** 允许上传的扩展名，按扩展名白名单过滤，清单见 uploadExts.ts */
export const ACCEPTED_EXTS = ACCEPT_FILE_EXTS
/** 选择文件对话框的过滤条件 */
export const ACCEPT = ACCEPTED_EXTS.map((ext) => `.${ext}`).join(',')
/** 单文件大小上限，与 Files API 的分档一致：图片 64 MiB、文档 100 MiB、纯文本等 32 MiB */
export const MAX_IMAGE_SIZE_MB = 64
export const MAX_DOCUMENT_SIZE_MB = 100
/** 按 user_data 上传的文件（纯文本、代码、表格、电子书）原文件上限更小 */
export const MAX_USER_DATA_SIZE_MB = 32
/** 单条消息的附件总数（自设上限；官方对总数无要求，只分别限制文档与图片） */
export const MAX_COUNT = 50
/** 官方限制：每个请求最多引用 20 个文档，超过返回 400 */
export const MAX_DOCUMENTS = 20
/** 官方限制：每个请求最多 600 张图片 */
export const MAX_IMAGES = 600
/** 同时上传的文件数 */
const MAX_CONCURRENT = 3

/** 扩展名是否在上传白名单里 */
export const isAcceptedExt = (name: string) => ACCEPTED_EXTS.includes(getFileExt(name))

/** 需要服务端做版面解析的文档；其余非图片文件（纯文本、代码、表格、电子书）无需解析 */
const LAYOUT_RECOGNITION_EXTS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx'])

/**
 * 上传时的 purpose：服务端能解码的图片不传，PDF 与 Word、PPT 做版面解析，其余按 user_data 上传。
 * 判断依据必须是「服务端能解码的格式」而不只是 MIME 以 image/ 开头：
 * svg、tiff、avif 这类按图片上传后会被服务端判为不支持的图片，之后每轮请求都会失败。
 */
export const getUploadPurpose = (name: string, mimeType: string): FilePurpose | null => {
  if (isSendableImage(mimeType, name)) {
    return null
  }
  return LAYOUT_RECOGNITION_EXTS.has(getFileExt(name)) ? 'rich_layout_recognition' : 'user_data'
}

/** 文件允许的最大体积（MB），按上传时的 purpose 分档，与官方 Files API 一致 */
const getMaxSizeMB = (file: File) => {
  switch (getUploadPurpose(file.name, resolveMimeType(file))) {
    case 'rich_layout_recognition':
      return MAX_DOCUMENT_SIZE_MB
    case 'user_data':
      return MAX_USER_DATA_SIZE_MB
    default:
      return MAX_IMAGE_SIZE_MB
  }
}

/** 走 document 块发送的附件（文档、纯文本、表格、电子书都算），用于套「每请求最多 20 个文档」 */
const isDocumentFile = (file: File) =>
  getUploadPurpose(file.name, resolveMimeType(file)) !== null

/** 添加前校验：格式 → 大小 → 总数 → 文档数 / 图片数，任一不满足即整批不添加 */
export const validateFiles = (
  files: File[],
  existing: File[] = []
): TranslationMessage | null => {
  if (files.some((file) => !isAcceptedExt(file.name))) {
    return { key: 'uploadUnsupportedFormat' }
  }
  const oversized = files.find((file) => file.size > getMaxSizeMB(file) * 1024 * 1024)
  if (oversized) {
    return { key: 'uploadMaxMBSize', params: { size: getMaxSizeMB(oversized) } }
  }
  const all = [...existing, ...files]
  if (all.length > MAX_COUNT) {
    return { key: 'uploadMaxFiles', params: { count: MAX_COUNT } }
  }
  const documents = all.filter(isDocumentFile).length
  if (documents > MAX_DOCUMENTS) {
    return { key: 'uploadMaxDocuments', params: { count: MAX_DOCUMENTS } }
  }
  if (all.length - documents > MAX_IMAGES) {
    return { key: 'uploadMaxImages', params: { count: MAX_IMAGES } }
  }
  return null
}

/**
 * 上传失败在附件上显示的文案：与设计稿状态对应的用具体原因，其余统一「上传失败」。
 * 服务端原文多为英文且较长，不直接展示。
 */
export const describeUploadError = (error: unknown): TranslationMessage => {
  const condition = classifyApiError(error)
  if (condition === 'serverBusy') {
    return { key: 'uploadServerBusy' }
  }
  if (condition === 'tooLarge') {
    return { key: 'uploadTooLarge' }
  }
  if (condition === 'timeout') {
    return { key: 'uploadTimeout' }
  }
  if (getUploadErrorInfo(error)?.code === 'parseFailed') {
    return { key: 'uploadParseFailed' }
  }
  return { key: 'uploadFileStatusFailed' }
}

type NoticeListener = (notice: LinkedMessage) => void
const noticeListeners = new Set<NoticeListener>()

/** 订阅需要额外提示的上传失败（配额达到上限），由界面层转成 toast */
export const onUploadNotice = (listener: NoticeListener) => {
  noticeListeners.add(listener)
  return () => {
    noticeListeners.delete(listener)
  }
}

/** 把需要额外提示的消息推给界面层（与上传配额提示共用同一通道） */
export const notifyUploadNotice = (notice: LinkedMessage) => {
  for (const listener of noticeListeners) {
    listener(notice)
  }
}

/** 删除已上传文件的接口文档 */
const DELETE_FILE_DOCS_URL = 'https://api-docs.deepseek.com/api/delete-file'

/** 文件数或存储空间达到上限：附件上只放得下「上传失败」，原因另用 toast 说明并引导删除旧文件 */
export const describeUploadQuota = (error: unknown): LinkedMessage | undefined => {
  const info = getUploadErrorInfo(error)
  const link = { key: 'uploadDeleteFiles', href: DELETE_FILE_DOCS_URL } as const
  if (info?.code === 'fileCountLimit') {
    return { type: 'error', key: 'uploadFileCountLimit', params: { limit: info.limit ?? '' }, link }
  }
  if (info?.code === 'storageLimit') {
    return { type: 'error', key: 'uploadStorageLimit', params: { limit: info.limit ?? '' }, link }
  }
  return undefined
}

type Job = () => Promise<void>
const queue: Job[] = []
let running = 0

const next = () => {
  while (running < MAX_CONCURRENT) {
    const job = queue.shift()
    if (!job) {
      return
    }
    running++
    void job().finally(() => {
      running--
      next()
    })
  }
}

/** 排队上传，最多同时上传 MAX_CONCURRENT 个；排队期间中止的任务不会发出请求 */
const enqueueUpload = (
  apiKey: string,
  file: Blob,
  name: string,
  mimeType: string,
  signal: AbortSignal
) =>
  new Promise<string>((resolve, reject) => {
    queue.push(async () => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      try {
        const body = file instanceof File ? file : new File([file], name, { type: file.type })
        resolve((await uploadFile(apiKey, body, getUploadPurpose(name, mimeType), signal)).id)
      } catch (error) {
        reject(error)
      }
    })
    next()
  })

/**
 * 上传任务按附件的本地 id 登记：输入框选中即开始上传，全部成功后携带 serverId 发送，
 * 不会重复上传；导入的历史附件没有任务，发送前按本地原件补传。
 * 任务只在内存里，历史附件补传未完成时，刷新后会在下次请求前重新上传。
 */
export type UploadTask =
  | { status: 'uploading' }
  | { status: 'done'; serverId: string }
  | { status: 'error'; error: TranslationMessage; retryable: boolean }

type UploadState = { tasks: Record<string, UploadTask> }

export const useUploads = create<UploadState>(() => ({ tasks: {} }))

/** 批量补传期间的挂起状态：key 为附件本地 id，null 表示该任务已结束（中止） */
let updatesSuspended = false
const suspendedTasks = new Map<string, UploadTask | null>()

const setTask = (id: string, task: UploadTask | null) => {
  if (updatesSuspended) {
    suspendedTasks.set(id, task)
    return
  }
  publishTask(id, task)
}

const publishTask = (id: string, task: UploadTask | null) =>
  useUploads.setState((state) => ({
    tasks: task
      ? { ...state.tasks, [id]: task }
      : Object.fromEntries(Object.entries(state.tasks).filter(([key]) => key !== id)),
  }))

/**
 * 补传历史附件期间先攒着任务状态，结束时一次性发布。
 * 每张图都发布进度会让长会话列表跟着重渲染＋重排：150 轮 / 30 图的实测里，
 * 30 秒有 28.8 秒耗在渲染而非 JS 与网络上（单条 files 记录读取只要 0.1 ms）。
 */
export const runWithoutUploadProgress = async <T>(work: () => Promise<T>): Promise<T> => {
  updatesSuspended = true
  try {
    return await work()
  } finally {
    updatesSuspended = false
    if (suspendedTasks.size > 0) {
      const updates = new Map(suspendedTasks)
      suspendedTasks.clear()
      const cleared = new Set<string>()
      const added: Record<string, UploadTask> = {}
      for (const [id, task] of updates) {
        if (task) {
          added[id] = task
        } else {
          cleared.add(id)
        }
      }
      useUploads.setState((state) => ({
        tasks: {
          ...Object.fromEntries(Object.entries(state.tasks).filter(([id]) => !cleared.has(id))),
          ...added,
        },
      }))
    }
  }
}

const pending = new Map<string, { promise: Promise<string>; controller: AbortController }>()

/** 开始（或复用进行中的）上传，返回服务端 file_id；失败时任务记为 error 并抛出原错误 */
export const uploadAttachment = (
  apiKey: string,
  id: string,
  blob: Blob,
  name: string,
  mimeType: string
): Promise<string> => {
  const current = pending.get(id)
  if (current) {
    return current.promise
  }
  const controller = new AbortController()
  setTask(id, { status: 'uploading' })
  const promise = enqueueUpload(apiKey, blob, name, mimeType, controller.signal)
    .then((serverId) => {
      setTask(id, { status: 'done', serverId })
      return serverId
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) {
        setTask(id, null)
      } else {
        setTask(id, {
          status: 'error',
          error: describeUploadError(error),
          retryable: isRetryableApiError(error),
        })
        const notice = describeUploadQuota(error)
        if (notice) {
          notifyUploadNotice(notice)
        }
      }
      throw error
    })
    .finally(() => pending.delete(id))
  pending.set(id, { promise, controller })
  return promise
}

export const cancelUpload = (id: string) => {
  pending.get(id)?.controller.abort()
  setTask(id, null)
}

/** 检查旧图片的 file_id。超限返回 null 以触发补传，无法读取原件时保留原 ID。 */
export const checkImageFileIds = async (files: FileAttachment[], signal: AbortSignal) => {
  const checked = new Map<string, string | null>()
  for (const file of files) {
    if (!file.isImage || !file.serverId || file.imageSizeChecked || checked.has(file.id)) {
      continue
    }
    signal.throwIfAborted()
    const oversized = await loadFile(file.id)
      .then((blob) => blob && isUploadImageOversized(blob))
      .catch(() => undefined)
    if (oversized === undefined) {
      continue
    }
    signal.throwIfAborted()
    const task = useUploads.getState().tasks[file.id]
    if (oversized && task?.status === 'done' && task.serverId === file.serverId) {
      cancelUpload(file.id)
    }
    checked.set(file.id, oversized ? null : file.serverId)
  }
  return checked
}

/** 各扩展名对应的 MIME：部分系统（如 Windows）给不出 file.type，按扩展名补齐 */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

const VIEW_MIME_BY_EXT: Record<string, string> = {
  ...MIME_BY_EXT,
  apng: 'image/png',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  pjp: 'image/jpeg',
  pjpeg: 'image/jpeg',
  bmp: 'image/bmp',
  dib: 'image/bmp',
  ico: 'image/x-icon',
  cur: 'image/x-icon',
  avif: 'image/avif',
  avifs: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

/** 展示附件时只按后缀确定类型。 */
export const getFileViewType = (name: string) => {
  const ext = getFileExt(name)
  return Object.hasOwn(VIEW_MIME_BY_EXT, ext) ? VIEW_MIME_BY_EXT[ext] : ''
}

/** 取文件的 MIME：优先用浏览器给出的类型，缺失时按扩展名推断 */
export const resolveMimeType = (file: File) => file.type || MIME_BY_EXT[getFileExt(file.name)] || ''

export const isImage = (mimeType: string) => mimeType.startsWith('image/')

/** 文件扩展名（大写），用于卡片元信息 */
export const getExtension = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : ''
}

export const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
