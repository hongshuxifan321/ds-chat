import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { FallbackImage } from './FallbackImage.js'
import { IconLinkOutline14 } from '../base/icons.js'
import type { Source } from '../../services/chat/view.js'
import styles from './SiteLogo.module.css'

/**
 * 站点图标只渲染本站资源。搜索结果的 `site_icon` 是第三方 https 地址，
 * 直接塞进 <img> 等于每次搜索都向那些站点发请求（泄露 IP 与来源），
 * 而页面 CSP 的 img-src 也不放行外链图，硬试只会每次都报一条拦截错误。
 * 所以远程图标一律直接走兜底的链接图标。
 */
const isLocalImage = (url: string) =>
  url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')

/** 站点图标：本站图片正常加载，没有图标、远程图标或加载失败都显示链接图标 */
export const SiteLogo = ({
  url,
  className,
  style,
}: {
  url: string | null
  className?: string
  style?: CSSProperties
}) => (
  <FallbackImage
    key={url ?? ''}
    src={url && isLocalImage(url) ? url : ''}
    fallback={<IconLinkOutline14 />}
    className={clsx(styles.logo, className)}
    imgClassName={styles.img}
    skeletonClassName={styles.placeholder}
    fallbackClassName={clsx(styles.placeholder, styles.fallback)}
    style={style}
  />
)

/** 搜索结果前 4 个站点的重叠缩略图 */
export const SiteThumbnails = ({ sources }: { sources: Source[] }) => (
  <span className={styles.group}>
    {sources.slice(0, 4).map((source) => (
      <SiteLogo key={source.url} url={source.siteIcon} className={styles.thumbnail} />
    ))}
  </span>
)
