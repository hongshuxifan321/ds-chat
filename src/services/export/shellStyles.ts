/**
 * 导出网页的外壳样式。只处理「让静态页面能正常上下滚动、别被应用的外壳规则锁死」，
 * 排版一律交给页面自己那份样式表——那才是和界面一致的部分。
 */
export const SHELL_STYLES = `
/* 应用把 html/body 固定成视口大小、禁止滚动；静态页面必须能滚 */
html,
body {
  height: auto !important;
  overflow: visible !important;
}
body {
  margin: 0;
  background-color: var(--dsw-alias-bg-base);
}
.export-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 8px;
}
.export-body {
  flex: 1;
}
.export-page .export-caveat {
  padding-bottom: 20px;
}
`
