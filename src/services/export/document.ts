import listStyles from '../../components/messages/MessageList.module.css'
import sessionStyles from '../../components/session/SessionView.module.css'
import { translate } from '../../i18n/index.js'
import { useSettings } from '../settings.js'
import { SHELL_STYLES } from './shellStyles.js'

/**
 * 把页面正在用的整份样式表读出来内联。这些规则就是界面上生效的那些，
 * 所以导出的网页不需要另写一套「看起来像」的样式。
 */
const collectStyles = () => {
  const parts: string[] = []
  const hasFontFace = typeof CSSFontFaceRule !== 'undefined'
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // 跨域样式表读不到规则；本项目的样式都是同源的，正常情况下走不到这里
      continue
    }
    for (const rule of Array.from(rules)) {
      /*
       * KaTeX 的 @font-face 指向包里的 woff2 文件。单文件导出里没有这些字体，
       * 留着只会在打开时报 404，还会拖慢首屏；去掉之后公式回退到 font-family
       * 列表里的下一个字体（位置与上下标由 CSS 定位，仍然对得上）。
       */
      if (hasFontFace && rule instanceof CSSFontFaceRule) {
        if (/katex/i.test(rule.style.getPropertyValue('font-family'))) {
          continue
        }
      }
      parts.push(rule.cssText)
    }
  }
  return parts.join('\n')
}

/** 命中的样式表里是否已经有 KaTeX 的规则（公式渲染完成前那 23KB 还没加载） */
const hasKatexStyles = () =>
  Array.from(document.styleSheets).some((sheet) => {
    try {
      return Array.from(sheet.cssRules).some((rule) => rule.cssText.includes('.katex'))
    } catch {
      return false
    }
  })

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const buildDocumentHtml = async ({
  column,
  title,
  dark,
}: {
  column: HTMLElement
  title: string
  dark: boolean
}) => {
  // 有公式就把 KaTeX 那份样式等进来（它的 CSS 是随公式按需加载的）
  if (column.querySelector('.katex')) {
    const deadline = Date.now() + 2000
    while (!hasKatexStyles() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  const styles = collectStyles()
  const locale = useSettings.getState().locale
  const displayTitle = title.trim() || translate('untitledChat')
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(displayTitle)}</title>
<style>${styles}${SHELL_STYLES}</style>
</head>
<body class="${dark ? 'dark' : 'light'}"${dark ? ' data-ds-dark-theme="dark"' : ''}>
<div class="export-page">
<div class="${sessionStyles.header}"><div class="${sessionStyles.title}">${escapeHtml(displayTitle)}</div></div>
<div class="export-body"><div class="${listStyles.column}">${column.innerHTML}</div></div>
<div class="${listStyles.column} export-caveat"><div class="${sessionStyles.caveat}">${escapeHtml(translate('contentCaveat'))}</div></div>
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
