/**
 * 图片裁剪：把原图的一块矩形区域裁出来，重新编码成 JPEG。
 * 重新编码是刻意的：canvas 产出的 JPEG 是最规矩的格式（不会出现 avif 之类
 * 服务端解不了的编码），同时长边压到 MAX_CROP_EDGE 以内，顺带把体积也收住。
 */

export type CropRect = {
  /** 原图像素坐标与尺寸 */
  x: number
  y: number
  width: number
  height: number
}

/** 输出长边上限：老设备 canvas 面积约 4096² 像素封顶，2048 留足余量 */
export const MAX_CROP_EDGE = 2048

/** JPEG 质量：0.9 时截图上的小字仍然清楚，体积通常是原 PNG 的几分之一 */
const JPEG_QUALITY = 0.9

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const sizeOf = (source: ImageBitmap | HTMLImageElement) =>
  source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }

/** 解码原图；优先 createImageBitmap（按 EXIF 方向摆正），失败时退回 <img> */
const loadSource = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // 个别浏览器对某些格式不给解，交给 <img> 再试一次
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('image decode failed'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 扩展名换成 .jpg，避免名字与内容对不上（按扩展名推断 MIME 的地方会用到） */
const jpegName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'image'}.jpg`

/**
 * 裁出 `rect` 指定的区域并重新编码。
 * rect 会被夹到图像范围内；宽高至少 1 像素，避免 canvas 抛错。
 */
export const cropImage = async (file: File, rect: CropRect): Promise<File> => {
  const source = await loadSource(file)
  try {
    const { width: naturalWidth, height: naturalHeight } = sizeOf(source)
    if (naturalWidth < 1 || naturalHeight < 1) {
      throw new Error('empty image')
    }
    const x = clamp(Math.round(rect.x), 0, naturalWidth - 1)
    const y = clamp(Math.round(rect.y), 0, naturalHeight - 1)
    const width = clamp(Math.round(rect.width), 1, naturalWidth - x)
    const height = clamp(Math.round(rect.height), 1, naturalHeight - y)

    const scale = Math.min(1, MAX_CROP_EDGE / Math.max(width, height))
    const outputWidth = Math.max(1, Math.round(width * scale))
    const outputHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('canvas unavailable')
    }
    // JPEG 没有透明通道：先铺白底，否则截图里的透明区域会变成黑块
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, outputWidth, outputHeight)
    context.drawImage(source, x, y, width, height, 0, 0, outputWidth, outputHeight)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    })
    if (!blob) {
      throw new Error('encode failed')
    }
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    if (!(source instanceof HTMLImageElement)) {
      source.close()
    }
  }
}
