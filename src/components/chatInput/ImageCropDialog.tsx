import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { cropImage, type CropRect } from '../../utils/imageCrop.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './ImageCropDialog.module.css'

type Box = { x: number; y: number; width: number; height: number }
/** 四角 + 四条边：角改两条边，边只改一条 */
type Corner = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
type Drag = {
  mode: 'new' | 'resize'
  corner?: Corner
  startX: number
  startY: number
  origin: Box
}
type Size = { width: number; height: number }

/** 选框最小尺寸（显示像素）：再小就没法用手拖了，也没意义 */
const MIN_BOX = 24

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const fitBox = (box: Box, size: Size): Box => {
  const width = clamp(box.width, MIN_BOX, size.width)
  const height = clamp(box.height, MIN_BOX, size.height)
  return {
    x: clamp(box.x, 0, size.width - width),
    y: clamp(box.y, 0, size.height - height),
    width,
    height,
  }
}

/**
 * 裁剪弹层：在图上拖出一块矩形，确定后交给 `cropImage` 重编码。
 * 只做矩形框选——旋转、比例、批量都不在这里做，用户要那些请在系统里处理。
 */
export const ImageCropDialog = ({
  file,
  previewUrl,
  onCancel,
  onConfirm,
}: {
  file: File
  previewUrl: string
  onCancel: () => void
  onConfirm: (cropped: File) => void
}) => {
  const t = useTranslate()
  const imageRef = useRef<HTMLImageElement>(null)
  const drag = useRef<Drag | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [busy, setBusy] = useState(false)

  const measure = useCallback(() => {
    const image = imageRef.current
    if (!image) {
      return
    }
    const { width, height } = { width: image.clientWidth, height: image.clientHeight }
    if (width < 1 || height < 1) {
      return
    }
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
  }, [])

  // 图装好之前量不到尺寸，所以在 load 事件后再量一次
  useEffect(() => {
    measure()
  }, [measure])

  // 默认铺满整张图：不选就是原图，确定按钮不会让用户踩空
  useEffect(() => {
    if (size && !box) {
      setBox({ x: 0, y: 0, width: size.width, height: size.height })
    }
  }, [size, box])

  const pointOf = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || !size || !box) {
      return
    }
    const { x, y } = pointOf(event)
    const handle = (event.target as HTMLElement).dataset.handle as Corner | undefined
    event.currentTarget.setPointerCapture(event.pointerId)
    if (handle) {
      drag.current = { mode: 'resize', corner: handle, startX: x, startY: y, origin: box }
    } else {
      // 任何位置落下都是「重新框选」：默认选框铺满整张图，如果这里做「移动选框」，
      // 用户拖半天只会看到一个贴边的整图选框，等于没反应。移动交给重新框选。
      drag.current = { mode: 'new', startX: x, startY: y, origin: { x, y, width: MIN_BOX, height: MIN_BOX } }
      setBox(fitBox({ x, y, width: MIN_BOX, height: MIN_BOX }, size))
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || !size) {
      return
    }
    const { x, y } = pointOf(event)
    const dx = x - state.startX
    const dy = y - state.startY
    if (state.mode === 'new') {
      const left = Math.min(state.startX, clamp(x, 0, size.width))
      const top = Math.min(state.startY, clamp(y, 0, size.height))
      const width = Math.abs(clamp(x, 0, size.width) - state.startX)
      const height = Math.abs(clamp(y, 0, size.height) - state.startY)
      setBox(fitBox({ x: left, y: top, width, height }, size))
      return
    }
    // 拖角或拖边：按 handle 的字母判断哪几条边跟着动，另一侧保持不动
    const { origin } = state
    const right = origin.x + origin.width
    const bottom = origin.y + origin.height
    const handle = state.corner ?? 'se'
    const movesLeft = handle.includes('w')
    const movesRight = handle.includes('e')
    const movesTop = handle.includes('n')
    const movesBottom = handle.includes('s')
    const nextX = movesLeft ? clamp(origin.x + dx, 0, right - MIN_BOX) : origin.x
    const nextY = movesTop ? clamp(origin.y + dy, 0, bottom - MIN_BOX) : origin.y
    const nextRight = movesRight ? clamp(right + dx, nextX + MIN_BOX, size.width) : right
    const nextBottom = movesBottom ? clamp(bottom + dy, nextY + MIN_BOX, size.height) : bottom
    setBox({ x: nextX, y: nextY, width: nextRight - nextX, height: nextBottom - nextY })
  }

  const onPointerUp = () => {
    drag.current = null
  }

  const confirm = async () => {
    const image = imageRef.current
    if (!box || !size || !image || busy) {
      return
    }
    // 显示尺寸 → 原图像素：缩放系数按实际渲染尺寸算，避免设备像素比干扰
    const scaleX = image.naturalWidth / size.width
    const scaleY = image.naturalHeight / size.height
    const rect: CropRect = {
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    }
    setBusy(true)
    try {
      onConfirm(await cropImage(file, rect))
    } catch {
      showToast(t('cropFailed'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('cropTitle')}
      closable
      onClose={onCancel}
      className={styles.dialog}
      footer={
        <>
          <Button variant="outlined" size="s" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button size="s" disabled={busy} onClick={() => void confirm()}>
            {t('confirm')}
          </Button>
        </>
      }
    >
      <div className={styles.hint}>{t('cropHint')}</div>
      <div
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imageRef}
          className={styles.image}
          src={previewUrl}
          alt=""
          draggable={false}
          onLoad={measure}
        />
        {box ? (
          <div
            className={styles.shade}
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          >
            {/* 先画四条边、后画四角：靠边的交点上，角优先响应 */}
            {(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'] as const).map((corner) => (
              <span key={corner} className={clsx(styles.handle, styles[corner])} data-handle={corner} />
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
