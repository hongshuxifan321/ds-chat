import Prism from 'prismjs'
import type { BlockContent, DefinitionContent, List as ListNode, PhrasingContent } from 'mdast'
import type { Source } from '../chat/view.js'
import { getHighlightLang, loadHighlight } from '../markdown/highlight.js'
import { ensureKatex } from '../markdown/katex.js'
import { renderMermaid } from '../markdown/mermaid.js'
import { toMdAst } from '../markdown/parse.js'

/**
 * 把一条回答的 markdown 渲染成静态 HTML，供导出的单文件网页使用。
 * 和界面上的渲染链走同一个解析器（`toMdAst`），所以引用角标、公式、Mermaid、
 * 代码高亮的表现和页面上一致；区别是产出字符串而不是 React 节点。
 */

export const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 正文里的软换行在界面上就是视觉换行，导出时保持一致 */
const textHtml = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>')

/**
 * 公式输出 MathML（KaTeX 的 `output: 'mathml'`）：浏览器原生排版，
 * 不依赖 KaTeX 的那套 woff2 字体文件——单文件里塞几 MB 字体会让导出失去意义。
 */
const mathHtml = async (value: string, display: boolean) => {
  try {
    const katex = await ensureKatex()
    const html = katex.renderToString(value, {
      throwOnError: false,
      strict: false,
      displayMode: display,
      output: 'mathml',
    })
    return display ? `<div class="math-block">${html}</div>` : html
  } catch {
    return `<code>${escapeHtml(value)}</code>`
  }
}

const codeHtml = async (code: string, language: string) => {
  const lang = language.toLowerCase()
  if (lang === 'mermaid') {
    try {
      const svg = await renderMermaid(code, false, () => false)
      if (svg) {
        return `<div class="diagram">${svg}</div>`
      }
    } catch {
      // 画不出来就退回源码，别让整篇导出失败
    }
  }
  const name = getHighlightLang(lang)
  let inner = escapeHtml(code)
  if (name) {
    try {
      await loadHighlight(name)
      inner = Prism.highlight(code, Prism.languages[name], name)
    } catch {
      inner = escapeHtml(code)
    }
  }
  return `<div class="code"><div class="code-head">${escapeHtml(language || 'text')}</div><pre><code class="language-${escapeHtml(lang)}">${inner}</code></pre></div>`
}

const linkHtml = (url: string, label: string) =>
  `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>`

const citationHtml = (source: Source) =>
  `<sup class="cite">${linkHtml(source.url, String(source.index))
    .replace('<a ', `<a title="${escapeHtml(`${source.title} — ${source.siteName}`)}" `)}</sup>`

const renderInline = async (nodes: PhrasingContent[]): Promise<string> => {
  let html = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        html += textHtml(node.value)
        break
      case 'emphasis':
        html += `<em>${await renderInline(node.children)}</em>`
        break
      case 'strong':
        html += `<strong>${await renderInline(node.children)}</strong>`
        break
      case 'inlineCode':
        html += `<code>${escapeHtml(node.value)}</code>`
        break
      case 'link':
        html += linkHtml(node.url, await renderInline(node.children))
        break
      case 'image':
        html += `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt ?? '')}">`
        break
      case 'html':
        html += node.value
        break
      case 'break':
        html += '<br>'
        break
      case 'inlineMath':
        html += await mathHtml(node.value, false)
        break
      case 'citation':
        html += citationHtml(node.source)
        break
      default:
        // 删除线、脚注等已在解析阶段换成文字
        break
    }
  }
  return html
}

const renderList = async (node: ListNode): Promise<string> => {
  const tag = node.ordered ? 'ol' : 'ul'
  const start = node.ordered && node.start && node.start !== 1 ? ` start="${node.start}"` : ''
  let inner = ''
  for (const item of node.children) {
    const checked = item.checked
    const box = typeof checked === 'boolean' ? `<span class="checkbox">${checked ? '☑' : '□'}</span>` : ''
    inner += `<li${box ? ' class="task"' : ''}>${box}${await renderBlocks(item.children)}</li>`
  }
  return `<${tag}${start}>${inner}</${tag}>`
}

const renderTable = async (node: Extract<BlockContent, { type: 'table' }>): Promise<string> => {
  const [head, ...body] = node.children
  const columns = head ? head.children.length : 0
  let html = '<div class="table-wrap"><table>'
  if (head) {
    html += '<thead><tr>'
    for (const cell of head.children) {
      html += `<th>${await renderInline(cell.children)}</th>`
    }
    html += '</tr></thead>'
  }
  if (body.length) {
    html += '<tbody>'
    for (const row of body) {
      html += '<tr>'
      for (const cell of row.children) {
        html += `<td>${await renderInline(cell.children)}</td>`
      }
      // 补齐到表头列数，和界面上的表格一致
      for (let index = row.children.length; index < columns; index += 1) {
        html += '<td></td>'
      }
      html += '</tr>'
    }
    html += '</tbody>'
  }
  return `${html}</table></div>`
}

const renderBlock = async (node: BlockContent | DefinitionContent): Promise<string> => {
  switch (node.type) {
    case 'paragraph':
      return `<p>${await renderInline(node.children)}</p>`
    case 'heading':
      return node.children.length
        ? `<h${node.depth}>${await renderInline(node.children)}</h${node.depth}>`
        : ''
    case 'code':
      return codeHtml(node.value, node.lang || 'text')
    case 'table':
      return renderTable(node)
    case 'list':
      return renderList(node)
    case 'blockquote':
      return `<blockquote>${await renderBlocks(node.children)}</blockquote>`
    case 'thematicBreak':
      return '<hr>'
    case 'math':
      return mathHtml(node.value, true)
    case 'html':
      return node.value
    default:
      return ''
  }
}

export const renderBlocks = async (nodes: Array<BlockContent | DefinitionContent>) => {
  let html = ''
  for (const node of nodes) {
    html += await renderBlock(node)
  }
  return html
}

/** 一条回答的 markdown → HTML；`sources` 用来把 [citation:N] 换成带链接的角标 */
export const renderMarkdownHtml = async (markdown: string, sources: Source[]) => {
  const ast = toMdAst(markdown, { sources, disableLink: false })
  return renderBlocks(ast.children as Array<BlockContent | DefinitionContent>)
}
