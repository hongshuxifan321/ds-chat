import { create } from 'zustand'
import { NOTICE_VERSION } from '../../content/notice.js'

/** 已读标记存本机；隐私模式等拿不到 localStorage 时按“没读过”处理，只多一点红点，不影响别的功能 */
const SEEN_KEY = 'noticeSeen'

const hasUnread = () => {
  try {
    return localStorage.getItem(SEEN_KEY) !== NOTICE_VERSION
  } catch {
    return true
  }
}

/** 公告面板：侧边栏卡片打开，unread 决定卡片上有没有未读小红点 */
export const useNoticeDialog = create(() => ({ open: false, unread: hasUnread() }))

/** 打开即视为已读：红点消失，并把读到的版本记在本机 */
export const openNotice = () => {
  try {
    localStorage.setItem(SEEN_KEY, NOTICE_VERSION)
  } catch {
    // 存不下就每次打开都有红点，功能本身不受影响
  }
  useNoticeDialog.setState({ open: true, unread: false })
}

export const closeNotice = () => useNoticeDialog.setState({ open: false })
