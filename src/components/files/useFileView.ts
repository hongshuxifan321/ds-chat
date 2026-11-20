import { useEffect, useState } from 'react'
import { getFileViewType, isImage } from '../../services/attachments.js'
import { loadFile } from '../../services/chat/db.js'

const createViewUrl = (original: Blob, type: string) => {
  const blob = original.slice(0, original.size, type || 'application/octet-stream')
  if (type !== 'image/svg+xml') {
    return URL.createObjectURL(blob)
  }
  // SVG 缩略图用 data: 地址，单独打开图片时也与应用隔离。
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * 已发送的附件是「先渲染消息、原件随后异步落库」：刚发出去的那一帧常常读不到原件，
 * 读完一次就放弃的话用户会看到图片变成文件卡片（刷新才恢复）。这里按几个间隔重试，
 * 原件确实丢了（存储被清、导入漏图）就按读不到处理，退回文件卡片。
 */
const RETRY_DELAYS = [60, 160, 400]

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 读原件：字符串是 IndexedDB 里的原件 ID，File 是草稿里的本地文件（不必重试）。 */
const readBlob = async (source: File | string, attempt: number): Promise<Blob | null> => {
  const blob = typeof source === 'string' ? await loadFile(source) : source
  if (blob || typeof source !== 'string' || attempt >= RETRY_DELAYS.length) {
    return blob ?? null
  }
  await wait(RETRY_DELAYS[attempt])
  return readBlob(source, attempt + 1)
}

/** 草稿传 File，已发送的附件传 IndexedDB 原件 ID。 */
export const useFileView = (source: File | string, name: string) => {
  const type = getFileViewType(name)
  const [state, setState] = useState<{ source: File | string; type: string; url: string | null }>()
  useEffect(() => {
    let active = true
    let created: string | null = null
    const pending = readBlob(source, 0)
      .then((blob) => (blob ? createViewUrl(blob, type) : null))
      .catch(() => null)
    void pending.then((url) => {
      created = typeof url === 'string' ? url : null
      if (active) {
        setState({ source, type, url: created })
      }
    })
    return () => {
      active = false
      void pending.then(() => {
        if (created?.startsWith('blob:')) {
          URL.revokeObjectURL(created)
        }
      })
    }
  }, [source, type])

  const url = state?.source === source && state.type === type ? state.url : undefined
  const image = isImage(type)
  const openInTab = type === 'application/pdf' || (image && type !== 'image/svg+xml')
  const action = openInTab ? { target: '_blank', rel: 'noreferrer' } : { download: name }
  return { url, image, link: url ? { href: url, ...action } : undefined }
}
