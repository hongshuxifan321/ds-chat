import listStyles from '../../components/messages/MessageList.module.css'
import { getVisibleMessages } from '../chat/branches.js'
import { loadSession } from '../chat/db.js'
import type { Session } from '../chat/types.js'
import { newChat, selectSession, useChatStore } from '../chat/store.js'
import { buildDocumentHtml, sessionHtmlName } from './document.js'
import { captureColumn } from './domCapture.js'

/**
 * 导出单条对话为网页：先在界面里把这条会话打开、等它渲染稳定，再抓下真实的消息列
 * 与整份样式表拼成单文件 HTML，最后把界面切回原来的位置。
 * 之所以要切会话，是因为只有界面里真实渲染出来的那一份才和用户看到的完全一致。
 */

/** 失败原因：`empty` 没有内容，`missing` 本机找不到，`render` 界面没渲染出来 */
export type SessionExportReason = 'empty' | 'missing' | 'render'

const exportError = (reason: SessionExportReason) => new Error(reason)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const triggerDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 等这条会话真正渲染到页面上：等待条件里带上「渲染出的消息数对得上」，避免抓到上一个会话 */
const waitForColumn = async (session: Session) => {
  const expected = getVisibleMessages(session).filter((message) => message.role === 'user').length
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const state = useChatStore.getState()
    const column = document.querySelector<HTMLElement>(`.${listStyles.column}`)
    const rendered = column?.querySelectorAll('[data-message-id]').length ?? 0
    if (
      state.activeId === session.id &&
      Object.hasOwn(state.sessionCache, session.id) &&
      column &&
      rendered > 0 &&
      rendered === expected
    ) {
      // Mermaid 画完之前是占位块，占位还在就再等等（最多 4 秒）
      const mermaidDeadline = Date.now() + 4000
      while (document.querySelector('.md-mermaid-status') && Date.now() < mermaidDeadline) {
        await sleep(80)
      }
      // 附件图从 IndexedDB 读出来之后才有 <img>，多给一点时间
      await sleep(150)
      return column
    }
    await sleep(60)
  }
  throw exportError('render')
}

export const downloadSessionHtml = async (id: string) => {
  const session = await loadSession(id)
  if (!session) {
    throw exportError('missing')
  }
  if (session.messages.length === 0) {
    throw exportError('empty')
  }

  const before = useChatStore.getState().activeId
  const switched = before !== id
  if (switched) {
    selectSession(id)
  }
  try {
    const column = await waitForColumn(session)
    const clone = await captureColumn(column)
    // 深浅色跟着导出时界面上的主题走
    const dark = document.body.classList.contains('dark')
    const html = await buildDocumentHtml({ column: clone, title: session.title, dark })
    const name = sessionHtmlName(session.title)
    triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), name)
    return { name }
  } finally {
    if (switched) {
      if (before) {
        selectSession(before)
      } else {
        newChat()
      }
    }
  }
}
