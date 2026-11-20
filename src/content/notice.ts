/**
 * 公告栏正文。改内容只动这个文件：小红点的版本号是正文算出来的指纹，
 * 改完一个字就会对所有读过旧版的人重新出现；NOTICE_UPDATED 只是面板底部显示的日期。
 * 面向普通用户写：术语后面都跟一句大白话。
 */

/** 面板底部显示的「最后更新」日期 */
export const NOTICE_UPDATED = '2026-11-20'

export type NoticeBlock =
  /** 一段正文 */
  | { kind: 'text'; text: string }
  /** 带小标题的条目（功能、待修问题、不做的功能都走这个） */
  | { kind: 'item'; title: string; text: string }
  /** 原样引用的报错或代码，等宽显示、可选中复制 */
  | { kind: 'quote'; text: string }
  /** 联系方式：一行一个，带 href 的渲染成外链 */
  | { kind: 'contact'; items: { label: string; value: string; href?: string }[] }
  /** 段末的补充提醒，浅色小字 */
  | { kind: 'hint'; text: string }
  /** 浅色小字 + 紧跟一个可点外链（如官方价目表） */
  | { kind: 'link'; text: string; label: string; href: string }

export type NoticeSection = { title: string; blocks: NoticeBlock[] }

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    title: '这个网页是怎么来的',
    blocks: [
      {
        kind: 'text',
        text: '它是在 DeepSeek 官方开源的对话界面基础上改的。打个比方：官方给了一套“样板房”的图纸，我把墙刷了、家具换了、又添了几样顺手的小东西，但水电管线——也就是和服务器对话的规矩——一根都没动。所以它不是官方产品，也不代表官方。',
      },
      {
        kind: 'text',
        text: '它没有服务器。整个网站就是几个文件，放在 GitHub 的免费托管上，像一本印好的说明书：谁拿到都能翻开看，但它不记录谁翻过、看了第几页。你不用注册，它也存不下你任何东西。',
      },
      {
        kind: 'item',
        title: 'PWA 是什么',
        text: '就是“把网页钉到手机桌面上”。它不用去应用商店下载，桌面上会多一个图标，点开就像 App；但骨子里还是网页——我改了它，你下次打开就是新的，不用升级。',
      },
    ],
  },
  {
    title: '你的东西存在哪，谁能看到',
    blocks: [
      {
        kind: 'text',
        text: '你的对话存在你自己手机/电脑的浏览器里，就是浏览器自己的一本记事本。API Key 是同一本记事本的扉页。这个网页没有后台，读不到它们，也没有别的地方存着副本。',
      },
      {
        kind: 'text',
        text: '唯一会离开你设备的，是你主动发出去的东西：消息、附件、语音，以及你在设置里选的地区（用来回答天气这类和地点有关的问题）。它们由浏览器直接发给 DeepSeek 官方的接口（api.deepseek.com），不经过我，也不经过任何第三方。',
      },
      {
        kind: 'text',
        text: '页面里没有统计代码、没有广告、没有第三方 CDN——公式、图表、代码高亮这些零件都打包在页面里，不会向别处要东西。',
      },
      {
        kind: 'item',
        title: '真正要当心的一件事',
        text: 'API Key 就是一张能刷钱的卡。如果你打开的网址不是 hongshuxifan321.github.io/ds-chat/，那可能是别人改过的仿站，会把你的 Key 偷走。请核对地址栏；别把 Key 发给任何人；别用主账号的 Key。',
      },
    ],
  },
  {
    title: '关于钱',
    blocks: [
      {
        kind: 'text',
        text: '这个网页不收钱、不代充，也碰不到你的账号。侧边栏的余额卡只干两件事：读一下余额、把你送到官方充值页。所有扣费都发生在 DeepSeek 官方账户里，按用量算，和我无关。',
      },
      {
        kind: 'item',
        title: '钱是怎么算的',
        text: '官方按 token 计费，一个汉字大约 0.6 个 token，写一万字约三分钱——这是晚上和周末的价，工作日白天翻倍。发出去的字（提问、历史对话、网页正文、图片）算输入，读一万字不到一分钱；模型写回来的字（包括「深度思考」那段）算输出。旧对话每次都会重发，但重复的部分按缓存价算，只有原价的五十分之一，所以越聊越贵、涨得慢。',
      },
      {
        kind: 'text',
        text: '量级感：随口问一百次约一毛；一条三十轮的对话一两毛；几十块钱够用很久。',
      },
      {
        kind: 'link',
        text: '按 2026-11-20 官方牌价折算（deepseek-flash，元/百万 token：输入命中缓存 0.02、未命中 1、输出 4，高峰翻倍）。官方调价后这页可能滞后，实时价格见',
        label: '官方价目表（api-docs.deepseek.com）',
        href: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
      },
    ],
  },
  {
    title: '现在有的功能',
    blocks: [
      {
        kind: 'item',
        title: '上下文进度条',
        text: '像油箱表。这次对话还能装多少内容，一眼就能看出来；快满了就新开一个，不然新内容加不进去。',
      },
      {
        kind: 'item',
        title: '标题搜索',
        text: '侧边栏的搜索框只搜对话标题。记得大概叫什么，就能把它找回来。',
      },
      {
        kind: 'item',
        title: '对话置顶',
        text: '重要的对话钉在最上面，不会随着新对话越排越靠下。',
      },
      {
        kind: 'item',
        title: '余额卡片',
        text: '侧边栏底部显示余额和赠金，随时知道还能用多久。',
      },
      {
        kind: 'item',
        title: '目录胶囊',
        text: '输入框上方那个写着「目录」的小胶囊。点开就是这条对话问过的所有问题，想翻回哪一句点一下就到；问得越多越有用，省得一路往上滚。',
      },
      {
        kind: 'item',
        title: '导出为网页',
        text: '在对话列表里点某条对话右边的「⋯」，选「导出为网页」，会下载一个 .html 文件。打开它看到的和现在这个界面一模一样——同样的气泡、字号、代码块和公式，只是省略了按钮，也不联网、不用装软件。想发给别人，可以打开后按 Ctrl+P 存成 PDF（手机上是分享 → 打印）。',
      },
      {
        kind: 'item',
        title: '裁剪图片',
        text: '发图之前想裁掉多余的部分，点输入框上方那张缩略图就行：在图上拖一个框，只留框里的内容。裁完会重新存成一张普通图片，体积通常比原图小得多，也不容易碰上“格式不被支持”的毛病。',
      },
    ],
  },
  {
    title: '有些毛病暂时治不好',
    blocks: [
      {
        kind: 'item',
        title: '图片是主要来源',
        text: '很多报错与问题都是由历史对话中的图片引起，恕难一一修复。',
      },
      {
        kind: 'item',
        title: '本地数据可能被清掉',
        text: '手机空间紧张的时候，浏览器可能自己把本地数据清掉，清掉的内容找不回来。重要对话请定期在「设置 → 数据管理」里导出。',
      },
    ],
  },
  {
    title: '暂时不打算加的功能',
    blocks: [
      {
        kind: 'item',
        title: '多设备同步',
        text: '手机和电脑的对话自动同步。要同步，就必须有一台服务器替你保管对话，那等于把现在“谁都看不到”的东西交出去。替代办法：导出 zip，在另一台设备上导入。',
      },
      {
        kind: 'item',
        title: '正文级搜索',
        text: '搜索对话内容里的字。要搜内容，就得在本机给所有消息建一份索引，手机上会明显变慢、更占空间。所以现在只搜标题。',
      },
    ],
  },
  {
    title: '关于作者',
    blocks: [
      {
        kind: 'text',
        text: '这个网页是一个人业余在做的，不是公司项目，也没有客服。遇到问题可以在小红书留言，共性的问题我会顺手修；好用的小建议也会采纳。',
      },
      {
        kind: 'contact',
        items: [
          {
            label: 'GitHub',
            value: 'hongshuxifan321',
            href: 'https://github.com/hongshuxifan321',
          },
          { label: '小红书号', value: '9640221630' },
        ],
      },
    ],
  },
]

/** 教程 PDF 的地址与下载后的文件名；换教程直接替换 public/notice/tutorial.pdf */
export const TUTORIAL_PDF = 'notice/tutorial.pdf'

/** 内容指纹（FNV-1a）：正文改一个字就变 */
const fingerprint = (text: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}

/**
 * 未读标记的版本号：由正文算出来，改一个字就变，读过旧版的人会重新看到小红点。
 * 所以改文案只改这个文件，不用记得同步版本号；NOTICE_UPDATED 只负责面板底部显示日期。
 */
export const NOTICE_VERSION = fingerprint(JSON.stringify(NOTICE_SECTIONS))
