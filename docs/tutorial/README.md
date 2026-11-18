# 教程 PDF 的源文件

| 文件 | 作用 |
|---|---|
| `DS-Chat使用教程.docx` | 教程正文与 9 张手机截图，以后只改这一份 |
| `../../public/notice/tutorial.pdf` | 线上那份，公告栏底部「下载教程 PDF」指向它 |

PDF 只存一份（在 `public/notice/`），不在本目录再放一份，免得两份二进制对不上。

## 更新流程

1. 改 `DS-Chat使用教程.docx`，在 Word 里「另存为 → PDF」
2. 用新 PDF 覆盖 `public/notice/tutorial.pdf`
3. 顺手把 `src/content/notice.ts` 的 `NOTICE_UPDATED` 改成当天日期（只影响面板底部显示；未读小红点由正文指纹 `NOTICE_VERSION` 自动重新出现，改文案就会亮）
4. 构建、本地验证、推送

`public/sw.js` 给 `/notice/` 设了 network-first（请求带 `cache: 'no-cache'`），同名 PDF 换掉后用户刷新即拿到新的，断网时回落到上一次缓存的版本。

## 注意

- 这份 PDF 会公开可下载（GitHub 公开仓库 + Pages），别往里放没打码的 Key、手机号、身份信息
- 教程只有中文；公告面板里的 UI 标签是中英两份
