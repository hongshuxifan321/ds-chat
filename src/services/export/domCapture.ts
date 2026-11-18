import assistantStyles from '../../components/messages/AssistantMessage.module.css'
import codeStyles from '../../components/markdown/CodeBlock.module.css'
import replyStyles from '../../components/messages/ReplyArea.module.css'
import userStyles from '../../components/messages/UserMessage.module.css'

/**
 * 把界面上真实渲染的消息列克隆下来并清理：去掉所有交互件与思考过程，
 * 图片从 blob: 换成内联的 data URI。留下的结构和 class 名与页面完全一致，
 * 配合整份内联样式表，导出的网页就和界面长得一样。
 */

/** 超过这个体积的图才处理，小图原样内联（不损失画质） */
const SHRINK_THRESHOLD = 300 * 1024
/** 长边上限：导出页里图片最大也就显示 240px 宽，留几倍给缩放看细节 */
const MAX_EDGE = 1200

/**
 * 大图先缩小再内联：base64 会涨三分之一，手机截图动辄几 MB，
 * 不处理的话一封「对话」能变成几十兆。任何一步失败都退回原图。
 */
const shrinkImage = async (blob: Blob) => {
  if (blob.size <= SHRINK_THRESHOLD || blob.type === 'image/gif') {
    return blob
  }
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1) {
      bitmap.close()
      return blob
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return blob
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const scaled = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.86)
    )
    return scaled && scaled.size < blob.size ? scaled : blob
  } catch {
    return blob
  }
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** 把克隆里的本地图片地址换成内联数据；读不到的保留原样（总比丢图好） */
const inlineImages = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'))
  for (const image of images) {
    const src = image.getAttribute('src') ?? ''
    if (!src.startsWith('blob:')) {
      continue
    }
    try {
      const blob = await (await fetch(src)).blob()
      image.setAttribute('src', await dataUrl(await shrinkImage(blob)))
    } catch {
      // 原件读不出来（被浏览器清掉）时保留 blob 地址，图片位置仍在
    }
  }
  // 缩略图外层是「点开看原图」的链接，指向同一个 blob 地址：导出后这个地址必然失效，
  // 去掉 href 保留元素（样式还在，也不会变成点一下就报错的链接）
  for (const link of Array.from(root.querySelectorAll('a[href^="blob:"]'))) {
    link.removeAttribute('href')
  }
}

/** 去掉交互件与思考过程，只留提问的附件/气泡和回答的正文 */
const clean = (root: HTMLElement) => {
  // 复制、编辑、重试、分支切换、代码块复制等全是按钮
  for (const button of Array.from(root.querySelectorAll('button'))) {
    button.remove()
  }
  // 用户消息底部那行（复制 + 编辑 + 版本切换）
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(`.${userStyles.bottom}`))) {
    node.remove()
  }
  // 回答底部的操作行
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(`.${assistantStyles.actions}`))) {
    node.remove()
  }
  // 「已思考（用时 N 秒）」这一行
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(`.${replyStyles.title}`))) {
    node.remove()
  }
  // 搜索、打开网页、读取链接这些过程行：留着它们就夹进思考内容里了
  for (const steps of Array.from(root.querySelectorAll<HTMLElement>(`.${replyStyles.steps}`))) {
    for (const item of Array.from(steps.children)) {
      if (!(item as HTMLElement).querySelector('.ds-markdown')) {
        item.remove()
      }
    }
  }
  // Mermaid 的「图 / 代码」切换件
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('.md-code-block-switch'))) {
    node.remove()
  }
  // 代码块标题栏里只剩语言名，去掉复制按钮后可能留下空的右半栏
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(`.${codeStyles.container}`))) {
    if (node.childElementCount === 0) {
      node.remove()
    }
  }
}

export const captureColumn = async (column: HTMLElement) => {
  const clone = column.cloneNode(true) as HTMLElement
  clean(clone)
  await inlineImages(clone)
  return clone
}
