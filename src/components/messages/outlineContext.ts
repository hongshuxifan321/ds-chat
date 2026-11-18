import { createContext, useContext } from 'react'
import type { Message } from '../../services/chat/types.js'

/** 目录里的一行：id 用来定位消息元素，text 是显示文字（提问原文） */
export type OutlineEntry = {
  id: string
  text: string
}

export type OutlineValue = {
  entries: OutlineEntry[]
  /** 消息列表的滚动层：桌面端是列表本身，移动端是内层滚动层 */
  scroller: HTMLElement | null
  /** 滚到某条提问，并停掉「跟随底部」 */
  jump: (messageId: string) => void
}

export const MessageOutlineContext = createContext<OutlineValue | null>(null)

export const useMessageOutline = () => useContext(MessageOutlineContext)

/** 目录里显示的文字：提问原文压成一行；只有附件时显示文件名 */
const outlineText = (message: Extract<Message, { role: 'user' }>) => {
  const text = message.content.replace(/\s+/g, ' ').trim()
  if (text) {
    return text
  }
  return message.files.map((file) => file.name).join('、')
}

/**
 * 只取提问。提示文字按消息对象缓存：流式输出时列表每帧都重建，
 * 但只要消息对象没变就复用同一条，目录数组的身份也就不变（不会每帧重绘）。
 */
export const buildOutlineEntries = (cache: Map<Message, OutlineEntry>, messages: Message[]) => {
  const entries: OutlineEntry[] = []
  for (const message of messages) {
    if (message.role !== 'user') {
      continue
    }
    let entry = cache.get(message)
    if (!entry) {
      entry = { id: message.id, text: outlineText(message) }
      cache.set(message, entry)
    }
    entries.push(entry)
  }
  return entries
}

/** 数组内容没变就沿用旧的，作为渲染缓存 */
export const sameOutlineEntries = (previous: OutlineEntry[], next: OutlineEntry[]) =>
  previous.length === next.length && previous.every((entry, index) => entry === next[index])
