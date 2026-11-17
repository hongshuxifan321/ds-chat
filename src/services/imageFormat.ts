/**
 * 服务端能解码的图片格式。Files API 只对 JPEG、PNG、GIF、WebP 做图片解码，
 * 其余 image/* 扩展名（svg、bmp、tiff、avif、ico、psd 等）会被判为「不支持的图片」；
 * 这类附件一旦进入历史，之后每轮请求都会因为同一个 image 块失败。
 */

/** 文件扩展名（小写，不含点）；没有扩展名时为空 */
export const getFileExt = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** 能解码的 MIME；apng 的字节与 PNG 相同 */
const SENDABLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/apng',
  'image/gif',
  'image/webp',
])

/** MIME 缺失时（部分系统给不出 file.type）按扩展名判断，列出的都是上面前四种的字节 */
const SENDABLE_EXTS = new Set([
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'pjpeg',
  'pjp',
  'png',
  'apng',
  'gif',
  'webp',
])

/**
 * 能否按 image 块（而不是 document 块）引用。
 * MIME 明确是 image/* 时以它为准——导入的附件按字节识别，能如实反映 svg、tiff、avif 这些原生格式；
 * MIME 缺失时才退回扩展名，否则导入的图片会被一律判成文档。
 */
export const isSendableImage = (mimeType: string, name: string) => {
  const mime = mimeType.trim().toLowerCase()
  return mime.startsWith('image/')
    ? SENDABLE_MIME_TYPES.has(mime)
    : SENDABLE_EXTS.has(getFileExt(name))
}
