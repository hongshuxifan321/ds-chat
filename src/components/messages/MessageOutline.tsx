import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { useMessageTools } from './messageTools.js'
import type { OutlineEntry } from './messageTools.js'
import styles from './MessageOutline.module.css'

/** 内容区上沿往下这么多像素算「已经读到这条」 */
const ACTIVE_OFFSET = 16
/** 距底部小于该值时认为已经在末尾，高亮固定为最后一条（与列表的跟随阈值一致） */
const PIN_BOTTOM = 40
const EMPTY: OutlineEntry[] = []

/**
 * 输入框上方的「目录」小胶囊：点开向上弹出提问列表，当前读到的那条标蓝，
 * 点任意一条滚到对应位置。桌面和手机共用同一套点击交互（手机没有悬停）。
 */
export const MessageOutline = () => {
  const t = useTranslate()
  const tools = useMessageTools()
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const entries = tools?.entries ?? EMPTY
  const scroller = tools?.scroller ?? null
  /** 每次打开时按条目顺序量一次消息元素，滚动时只比坐标 */
  const nodesRef = useRef<{ id: string; element: HTMLElement }[]>([])

  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(open, { side: 'top', align: 'start', offset: 8 })
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false))

  /**
   * 当前读到的那条：已经在底部时固定为最后一条；否则取最后一条越过判定线、
   * 并且还没完全滑出屏幕的提问（短消息紧排在底部时，不能指到已经看不见的那条）。
   */
  const findActive = useCallback(() => {
    const nodes = nodesRef.current
    if (!nodes.length) {
      return null
    }
    const box = scroller?.getBoundingClientRect()
    if (!scroller || !box) {
      return nodes[0].id
    }
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < PIN_BOTTOM) {
      return nodes[nodes.length - 1].id
    }
    const line = box.top + ACTIVE_OFFSET
    let active: string | null = null
    for (const node of nodes) {
      const rect = node.element.getBoundingClientRect()
      if (rect.top > line) {
        break
      }
      if (rect.bottom > box.top) {
        active = node.id
      }
    }
    if (active === null) {
      const visible = nodes.find((node) => node.element.getBoundingClientRect().bottom > box.top)
      active = visible?.id ?? nodes[nodes.length - 1].id
    }
    return active
  }, [scroller])

  // 打开时（以及流式输出改动列表时）重新量一次，并定位当前读到的位置
  useLayoutEffect(() => {
    if (!open || !scroller) {
      return
    }
    nodesRef.current = entries.flatMap((entry) => {
      const element = scroller.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(entry.id)}"]`
      )
      return element ? [{ id: entry.id, element }] : []
    })
    setActiveId(findActive())
  }, [entries, findActive, open, scroller])

  // 只有打开期间才跟踪滚动，目录收起时不额外消耗
  useEffect(() => {
    if (!open || !scroller) {
      return
    }
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setActiveId(findActive()))
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [findActive, open, scroller])

  // 列表里跟着高亮走：高亮那条跑到视野外才滚，不打断用户自己翻列表
  useLayoutEffect(() => {
    const list = floatingRef.current
    if (!open || !list || !activeId) {
      return
    }
    const active = Array.from(list.querySelectorAll<HTMLElement>('[data-outline-id]')).find(
      (item) => item.dataset.outlineId === activeId
    )
    if (!active) {
      return
    }
    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    if (top < list.scrollTop) {
      list.scrollTop = top
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight
    }
  }, [activeId, floatingRef, open])

  // 两条提问以下没有跳转意义，不占位置；条数变少时顺手收起
  useEffect(() => {
    if (open && entries.length < 2) {
      setOpen(false)
    }
  }, [entries.length, open])

  if (!tools || entries.length < 2) {
    return null
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={styles.capsule}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('outlineTitle')}
      </button>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.list}
              role="menu"
              aria-label={t('outlineTitle')}
              // 测量出位置前先不显示：position: fixed 但没有偏移量时会停在左上角。
              style={position ?? { visibility: 'hidden' }}
            >
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  data-outline-id={entry.id}
                  className={clsx(styles.item, entry.id === activeId && styles.active)}
                  aria-current={entry.id === activeId ? 'true' : undefined}
                  title={entry.text}
                  onClick={() => {
                    setOpen(false)
                    tools.jump(entry.id)
                  }}
                >
                  {entry.text}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
