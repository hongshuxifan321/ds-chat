import { getVisibleMessages } from './branches.js'
import type { Message, Session } from './types.js'

/**
 * 上下文窗口容量：官方 `GET /models` 里 `deepseek-flash` 的 `context_window` 为 1048576，
 * 即输入与输出 token 合计的上限。本文件只用于界面提示，不影响请求内容。
 */
export const CONTEXT_WINDOW = 1_048_576

/** 接近上限的分档：80% 起提醒，95% 起按「随时会失败」提示 */
export const CONTEXT_WARN_RATIO = 0.8
export const CONTEXT_DANGER_RATIO = 0.95

/**
 * 粗略估算 token：中日韩字符约 1.5 字/token，其余约 4 字符/token。
 * 服务端只在回复里给回真实用量，尚未发送的内容（新提问、草稿）只能估算，误差约几个百分点。
 */
export const estimateTokens = (text: string): number => {
  let wide = 0
  let narrow = 0
  for (const char of text) {
    // 中日韩文字、全角标点按宽字符计
    if (/[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/u.test(char)) {
      wide++
    } else {
      narrow++
    }
  }
  return Math.ceil(wide / 1.5 + narrow / 4)
}

export type ContextUsage = {
  /** 估算的已用 token */
  used: number
  window: number
  ratio: number
  /** 是否有一轮服务端返回的真实用量作为基准；false 时全部为估算 */
  measured: boolean
}

const messageText = (message: Message): string =>
  message.role === 'user'
    ? message.content
    : message.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('')

/**
 * 计算当前会话下一轮请求的上下文占用：
 * 以最近一条完成的回答的 `usage`（input + 缓存创建 + 缓存读取）为基准，
 * 加上它之后新增的消息与输入框里的草稿估算值。历史思考块不回传，不计入。
 */
export const getContextUsage = (session: Session | undefined, draft = ''): ContextUsage => {
  const window = CONTEXT_WINDOW
  if (!session) {
    return { used: 0, window, ratio: 0, measured: false }
  }
  const messages = getVisibleMessages(session)
  let used = 0
  let base = -1
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (
      message.role === 'assistant' &&
      message.usage &&
      (message.status === 'done' || message.status === 'stopped')
    ) {
      const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens } = message.usage
      used = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
      base = index
      break
    }
  }
  const tail = base === -1 ? messages : messages.slice(base + 1)
  for (const message of tail) {
    used += estimateTokens(messageText(message))
  }
  used += estimateTokens(draft)
  return { used, window, ratio: used / window, measured: base !== -1 }
}

/** 12K / 860K / 1.02M 这类紧凑写法 */
export const formatTokens = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`
  }
  return String(value)
}

/** 窗口容量单独写：1048576 直接说 1M，免得显示成 1.05M 让人困惑 */
export const formatWindow = (value: number): string =>
  value === CONTEXT_WINDOW ? '1M' : formatTokens(value)

/** 百分比：非零但不足 1% 时显示 <1%，避免看起来像没用量 */
export const formatPercent = (ratio: number): string => {
  if (ratio > 0 && ratio < 0.01) {
    return '<1%'
  }
  return `${Math.min(100, Math.round(ratio * 100))}%`
}
