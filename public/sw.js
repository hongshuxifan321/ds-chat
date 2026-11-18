/* BYOK Chat service worker：只缓存同源静态资源，对话请求一律直连 API。 */
const CACHE = 'byok-shell-v2'
const SHELL = ['./', './index.html', './manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  // 跨域请求（api.deepseek.com）不拦截，避免把对话写进缓存
  if (url.origin !== self.location.origin) {
    return
  }
  // 公告与教程：网络优先，换了同名文件立刻生效，离线时退回上次缓存。
  // 必须排在 navigate 分支前面——点下载、在新标签页打开 PDF 都算 navigate 请求，
  // 落到下面会把 PDF 当成 index.html 存进缓存，离线就再也打不开页面了。
  // cache: 'no-cache' 让浏览器带上校验头再去问一次，绕开 HTTP 缓存里那份旧的
  if (url.pathname.includes('/notice/')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy))
          return response
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    )
    return
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
    )
  )
})
