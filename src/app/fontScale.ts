import { useSettings, type FontScale } from '../services/settings.js'

/** 档位写在 body 上，样式表按 body[data-font-scale] 覆盖字号 token */
const applyFontScale = (fontScale: FontScale) => {
  document.body.dataset.fontScale = fontScale
}

let appliedFontScale: FontScale | null = null

const syncFontScale = () => {
  const fontScale = useSettings.getState().fontScale
  if (fontScale !== appliedFontScale) {
    appliedFontScale = fontScale
    applyFontScale(fontScale)
  }
}

/** 首屏渲染前同步应用一次，之后随设置变化更新 */
export const setupFontScale = () => {
  syncFontScale()
  useSettings.subscribe(syncFontScale)
}
