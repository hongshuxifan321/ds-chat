import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { AssistantMessage } from './AssistantMessage.js'
import {
  buildOutlineEntries,
  MessageOutlineContext,
  sameOutlineEntries,
  type OutlineEntry,
} from './outlineContext.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import type { Message } from '../../services/chat/types.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}
import styles from './MessageList.module.css'

/** 距底部小于该值时视为在底部，流式内容增长时跟随 */
const STICKY_THRESHOLD = 40
/** 从目录跳到某条提问时，在它上面留出的空隙 */
const JUMP_OFFSET = 12
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
}: {
  session: Session
  streaming: boolean
  footer: React.ReactNode
}) => {
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  const messages = getVisibleMessages(session)
  // 滚动层在两套布局里是不同元素：桌面端是列表本身，移动端是内层滚动层。
  // 通过回调 ref 交给目录，目录拿到的始终是当前生效的那个。
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const setScrollElement = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element
    setScroller(element)
  }, [])
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }

  // 提问目录：按消息对象缓存文字，流式输出时数组身份不变，目录不会跟着每帧重绘
  const outlineCacheRef = useRef(new Map<Message, OutlineEntry>())
  const outlineRef = useRef<OutlineEntry[]>([])
  const outlineSessionRef = useRef(session.id)
  if (outlineSessionRef.current !== session.id) {
    outlineSessionRef.current = session.id
    outlineCacheRef.current = new Map()
    outlineRef.current = []
  }
  const nextOutline = buildOutlineEntries(outlineCacheRef.current, messages)
  if (!sameOutlineEntries(outlineRef.current, nextOutline)) {
    outlineRef.current = nextOutline
  }
  const entries = outlineRef.current

  const jump = useCallback((messageId: string) => {
    const element = scrollRef.current
    const target = element?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`
    )
    if (!element || !target) {
      return
    }
    // 先停掉跟随底部，否则流式内容继续增长会把视口拉回末尾
    stickyRef.current = false
    const offset = target.getBoundingClientRect().top - element.getBoundingClientRect().top
    element.scrollTo({
      top: Math.max(0, element.scrollTop + offset - JUMP_OFFSET),
      behavior: 'smooth',
    })
  }, [])

  const outline = useMemo(() => ({ entries, jump, scroller }), [entries, jump, scroller])

  const lastMessageId = messages.at(-1)?.id
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el && stickyRef.current) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  // 内容、键盘和输入框高度变化时，继续遵循当前跟随状态。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const observer = new ResizeObserver(scrollToBottom)
    observer.observe(content)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, scrollToBottom])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
      }
      restoreScrollRef.current = null
      return
    }
    stickyRef.current = true
    scrollToBottom()
  }, [session.id, lastMessageId, scrollToBottom])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
      restoreScrollRef.current = { messageId, top: anchorTop }
      stickyRef.current = false
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
    },
    [session.id, streaming]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
    }
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD
      // 仅在用户向上滚动时停止跟随底部，布局或内容增高时保持跟随状态。
      if (nearBottom) {
        stickyRef.current = true
      } else if (el.scrollTop < scrollTopRef.current) {
        stickyRef.current = false
      }
      scrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollToBottom])

  const lastIndex = messages.length - 1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  return (
    <ScrollToBottomContext.Provider value={scrollToBottom}>
      <MessageOutlineContext.Provider value={outline}>
        <div className={styles.wrapper}>
          <div ref={isMobile ? undefined : setScrollElement} className={styles.container}>
            <div ref={isMobile ? setScrollElement : undefined} className={styles.scroll}>
              <div ref={contentRef} className={styles.column}>
                {messages.map((message, index) =>
                  message.role === 'user' ? (
                    <UserMessage
                      key={message.id}
                      sessionId={session.id}
                      message={message}
                      retryUploadId={uploadRetryId}
                      isFirst={index === 0}
                      isLast={index === lastIndex || index === lastIndex - 1}
                      busy={streaming}
                      versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                      onSelectVersion={selectVersion}
                    />
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      sessionId={session.id}
                      message={message}
                      isLast={index === lastIndex}
                      streaming={streaming && index === lastIndex}
                      busy={streaming}
                      versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                      onSelectVersion={selectVersion}
                    />
                  )
                )}
              </div>
            </div>
            {footer}
          </div>
        </div>
      </MessageOutlineContext.Provider>
    </ScrollToBottomContext.Provider>
  )
}
