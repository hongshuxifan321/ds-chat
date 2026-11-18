import { formatSize } from '../attachments.js'
import { getVisibleMessages } from '../chat/branches.js'
import { loadFile } from '../chat/db.js'
import type { AssistantMessage, FileAttachment, Message, Session, UserMessage } from '../chat/types.js'
import { buildReplyView, type Source } from '../chat/view.js'
import { translate } from '../../i18n/index.js'
import { useSettings } from '../settings.js'
import { DOCUMENT_STYLES } from './htmlStyles.js'
import { escapeHtml, renderMarkdownHtml } from './markdownHtml.js'

/**
 * 把一条对话导出成一个自包含的 HTML 文件：样式内联、图片转 data URI、
 * 公式走 MathML、图表是内联 SVG，打开时不需要网络也不需要应用本身。
 * 只导出「提问 + 回答」；思考过程与搜索步骤不写进去。
 */

const pad = (value: number) => String(value).padStart(2, '0')

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 超过这个体积的图才处理，小图原样内联（不损失画质） */
const SHRINK_THRESHOLD = 300 * 1024
/** 长边上限：导出页里图片最大也就显示 240px 宽，留几倍给缩放看细节 */
const MAX_EDGE = 1200

/**
 * 大图先缩小再内联：base64 会涨三分之一，手机截图动辄几 MB，
 * 不处理的话一封「对话」能变成几十兆，打开也卡。
 * 任何一步失败都退回原图，宁可大也不能丢图。
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

/** 图片内联成 data URI；文档类附件（以及本机找不到原件的图）只列名字与大小 */
const renderAttachments = async (files: FileAttachment[]) => {
  const shots: string[] = []
  const chips: string[] = []
  for (const file of files) {
    let blob: Blob | undefined
    try {
      blob = await loadFile(file.id)
    } catch {
      blob = undefined
    }
    if (file.isImage && blob) {
      shots.push(
        `<figure><img src="${await dataUrl(await shrinkImage(blob))}" alt="${escapeHtml(file.name)}">` +
          `<figcaption>${escapeHtml(file.name)}</figcaption></figure>`
      )
    } else {
      chips.push(
        `<span class="file">${escapeHtml(file.name)} · ${escapeHtml(formatSize(file.size))}</span>`
      )
    }
  }
  return (
    (shots.length ? `<div class="shots">${shots.join('')}</div>` : '') +
    (chips.length ? `<div class="files">${chips.join('')}</div>` : '')
  )
}

const renderAsk = async (message: UserMessage) => {
  const content = message.content.trim()
  return (
    `<div class="ask"><div class="ask-label">${escapeHtml(translate('exportYou'))}</div>` +
    (content ? `<div class="ask-text">${escapeHtml(message.content)}</div>` : '') +
    (await renderAttachments(message.files)) +
    '</div>'
  )
}

const renderSourceList = (sources: Source[]) => {
  if (!sources.length) {
    return ''
  }
  const items = sources
    .map(
      (source) =>
        `<li value="${source.index}">${escapeHtml(source.siteName)} · ` +
        `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">` +
        `${escapeHtml(source.title)}</a></li>`
    )
    .join('')
  return (
    `<div class="sources">${escapeHtml(translate('exportSources'))}` +
    `<ol start="${sources[0].index}">${items}</ol></div>`
  )
}

const renderReply = async (message: AssistantMessage) => {
  const view = buildReplyView(message, false)
  const markdown = view.answer?.markdown.trim() ?? ''
  const answer = markdown
    ? `<div class="answer ds-markdown">${await renderMarkdownHtml(markdown, view.sources)}</div>`
    : `<p class="note">${escapeHtml(translate('exportIncomplete'))}</p>`
  return answer + renderSourceList(view.sources)
}

type Turn = { ask: UserMessage | null; replies: AssistantMessage[] }

/** 按「提问 → 它的回答」分组；连续的追问各自成组，孤立回答也能导出 */
const groupTurns = (messages: Message[]) => {
  const turns: Turn[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ ask: message, replies: [] })
      continue
    }
    const last = turns.at(-1)
    if (last && last.ask) {
      last.replies.push(message)
    } else {
      turns.push({ ask: null, replies: [message] })
    }
  }
  return turns
}

export const buildSessionHtml = async (session: Session): Promise<string> => {
  const messages = getVisibleMessages(session)
  const turns = groupTurns(messages)
  const asked = turns.filter((turn) => turn.ask).length
  const title = session.title.trim() || translate('untitledChat')
  const locale = useSettings.getState().locale

  const body: string[] = []
  for (const turn of turns) {
    body.push('<section class="turn">')
    if (turn.ask) {
      body.push(await renderAsk(turn.ask))
    }
    for (const reply of turn.replies) {
      body.push(await renderReply(reply))
    }
    body.push('</section>')
  }

  const meta = [
    formatDate(session.createdAt),
    translate('exportTurns', { count: asked }),
    translate('exportGenerated'),
  ].join(' · ')

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_STYLES}</style>
</head>
<body>
<div class="page">
<header>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${escapeHtml(meta)}</div>
</header>
<main>
${body.join('\n')}
</main>
<footer>${escapeHtml(translate('contentCaveat'))}</footer>
</div>
</body>
</html>
`
}

/** 文件名：去掉文件系统不接受的字符，太长就截断（Windows 上限 255） */
export const sessionHtmlName = (title: string) => {
  const name = title
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${name || translate('untitledChat')}.html`
}

export const buildSessionFile = async (session: Session) => {
  const html = await buildSessionHtml(session)
  return {
    name: sessionHtmlName(session.title),
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
  }
}
