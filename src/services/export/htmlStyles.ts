/**
 * 导出网页内联的样式：一份独立的阅读版式，不依赖应用的设计变量，
 * 也不引任何外部资源（没有 CDN、没有字体文件），断网打开和页面上一样。
 */
export const DOCUMENT_STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #ffffff;
  color: #1f2329;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 16px;
  line-height: 1.75;
  -webkit-text-size-adjust: 100%;
  word-break: break-word;
}
.page { max-width: 760px; margin: 0 auto; padding: 44px 24px 64px; }
header { margin-bottom: 8px; }
h1 { margin: 0 0 10px; font-size: 26px; line-height: 1.35; }
.meta { color: #8a8f99; font-size: 13px; }
main { margin-top: 34px; }
.turn { margin-bottom: 38px; }
.ask { padding: 14px 18px; border-radius: 12px; background: #f4f6f9; }
.ask-label { margin-bottom: 6px; color: #8a8f99; font-size: 12px; }
.ask-text { white-space: pre-wrap; }
.answer { margin-top: 18px; }
.note { color: #8a8f99; font-size: 14px; }
.shots { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.shots figure { margin: 0; max-width: 240px; }
.shots img { display: block; max-width: 100%; height: auto; border-radius: 10px; border: 1px solid #e6e9ee; }
.shots figcaption { margin-top: 4px; color: #8a8f99; font-size: 12px; }
.files { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.file {
  padding: 3px 8px;
  border: 1px solid #e6e9ee;
  border-radius: 8px;
  color: #5b6068;
  font-size: 12px;
}
.sources {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px dashed #e6e9ee;
  color: #5b6068;
  font-size: 13px;
}
.sources ol { margin: 6px 0 0; padding-left: 22px; }
.sources li { margin-top: 2px; }
a { color: #4d6bfe; }
.cite a { font-size: 11px; text-decoration: none; }

/* 正文排版 */
.ds-markdown > :first-child { margin-top: 0; }
.ds-markdown p { margin: 0 0 14px; }
.ds-markdown h1, .ds-markdown h2, .ds-markdown h3, .ds-markdown h4,
.ds-markdown h5, .ds-markdown h6 { margin: 26px 0 12px; line-height: 1.4; }
.ds-markdown h1 { font-size: 24px; }
.ds-markdown h2 { font-size: 21px; }
.ds-markdown h3 { font-size: 18px; }
.ds-markdown h4 { font-size: 16px; }
.ds-markdown h5, .ds-markdown h6 { font-size: 15px; }
.ds-markdown ul, .ds-markdown ol { margin: 0 0 14px; padding-left: 24px; }
.ds-markdown li { margin-top: 4px; }
.ds-markdown li > p { margin: 0; }
.ds-markdown .checkbox { margin-right: 4px; color: #5b6068; }
.ds-markdown blockquote {
  margin: 0 0 14px;
  padding: 2px 0 2px 14px;
  border-left: 3px solid #e6e9ee;
  color: #5b6068;
}
.ds-markdown hr { margin: 24px 0; border: 0; border-top: 1px solid #e6e9ee; }
.ds-markdown code {
  padding: 2px 5px;
  border-radius: 5px;
  background: #f2f4f7;
  font-family: Menlo, Consolas, 'Cascadia Mono', 'Courier New', monospace;
  font-size: 0.88em;
}
.ds-markdown .code { margin: 0 0 16px; }
.code-head { margin-bottom: 6px; color: #8a8f99; font-size: 12px; }
.ds-markdown pre {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  border: 1px solid #e6e9ee;
  border-radius: 10px;
  background: #f7f8fa;
  font-size: 13px;
  line-height: 1.6;
}
.ds-markdown pre code { padding: 0; background: none; font-size: inherit; }
.table-wrap { margin: 0 0 16px; overflow-x: auto; }
.ds-markdown table { border-collapse: collapse; width: 100%; font-size: 14px; }
.ds-markdown th, .ds-markdown td { padding: 6px 10px; border: 1px solid #e6e9ee; text-align: left; }
.ds-markdown th { background: #f7f8fa; font-weight: 600; }
.ds-markdown img { max-width: 100%; }
.math-block { margin: 16px 0; overflow-x: auto; text-align: center; }
math { font-size: 1.05em; }
.diagram { margin: 0 0 16px; overflow-x: auto; text-align: center; }
.diagram svg { max-width: 100%; height: auto; }

/* 代码高亮的浅色配色 */
.token.comment, .token.prolog, .token.doctype, .token.cdata { color: #8a8f99; }
.token.punctuation { color: #5b6068; }
.token.keyword, .token.tag, .token.selector, .token.builtin { color: #a626a4; }
.token.string, .token.attr-value, .token.inserted, .token.char { color: #50a14f; }
.token.number, .token.boolean, .token.constant, .token.symbol { color: #986801; }
.token.function, .token.class-name { color: #4078f2; }
.token.property, .token.variable, .token.attr-name, .token.deleted { color: #e45649; }
.token.operator, .token.entity, .token.url { color: #0184bc; }
.token.important, .token.bold { font-weight: 600; }
.token.italic { font-style: italic; }

footer {
  margin-top: 48px;
  padding-top: 16px;
  border-top: 1px solid #e6e9ee;
  color: #8a8f99;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 640px) {
  .page { padding: 24px 16px 48px; }
  h1 { font-size: 22px; }
  body { font-size: 15px; }
}

@media print {
  body { background: #fff; }
  .turn, .ds-markdown pre { break-inside: avoid; }
}
`
