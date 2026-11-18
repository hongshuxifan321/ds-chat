import { useTranslate } from '../../i18n/index.js'
import {
  NOTICE_SECTIONS,
  NOTICE_UPDATED,
  TUTORIAL_PDF,
  type NoticeBlock as NoticeBlockData,
} from '../../content/notice.js'
import { Modal } from '../base/Modal.js'
import { closeNotice, useNoticeDialog } from './noticeState.js'
import styles from './Notice.module.css'

/** 公告面板：点侧边栏的公告卡打开，内容来自 content/notice.ts */
export const NoticeDialog = () => {
  const open = useNoticeDialog((state) => state.open)
  return open ? <NoticeContent /> : null
}

const Block = ({ block }: { block: NoticeBlockData }) => {
  switch (block.kind) {
    case 'item':
      return (
        <p className={styles.item}>
          <span className={styles.bullet} aria-hidden="true" />
          <span>
            <span className={styles.itemTitle}>{block.title}</span>：{block.text}
          </span>
        </p>
      )
    case 'quote':
      return <p className={styles.quote}>{block.text}</p>
    case 'contact':
      return (
        <ul className={styles.contact}>
          {block.items.map((item) => (
            <li key={item.label} className={styles.contactRow}>
              <span className={styles.contactLabel}>{item.label}</span>
              {item.href ? (
                <a
                  className={styles.contactLink}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.value}
                </a>
              ) : (
                <span className={styles.contactValue}>{item.value}</span>
              )}
            </li>
          ))}
        </ul>
      )
    case 'hint':
      return <p className={styles.hint}>{block.text}</p>
    case 'text':
      return <p className={styles.text}>{block.text}</p>
  }
}

const NoticeContent = () => {
  const t = useTranslate()
  return (
    <Modal
      title={t('noticeTitle')}
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={closeNotice}
      footer={
        <div className={styles.footer}>
          <span className={styles.updated}>
            {t('noticeUpdatedAt', { date: NOTICE_UPDATED })}
          </span>
          <a className={styles.download} href={TUTORIAL_PDF} download={t('noticeTutorialFileName')}>
            {t('noticeDownloadTutorial')}
          </a>
        </div>
      }
    >
      {NOTICE_SECTIONS.map((section) => (
        <section key={section.title} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}
    </Modal>
  )
}
