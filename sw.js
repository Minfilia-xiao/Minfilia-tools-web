// Service Worker for 工单管理系统 - offline support v3
// 合并本周视图和总表视图为单一页面
const CACHE_NAME = 'work-orders-v3';
const ASSETS = [
  '/',
  '/工单管理-总表.html',
  '/工单管理-本周.html',
  '/config.js',
  '/data-service.js'
];

// ========== Install: 缓存静态资源 ==========
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ========== Activate: 清理旧缓存 ==========
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ========== Fetch: 智能缓存策略 ==========
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isHtml = url.pathname.endsWith('.html') || url.pathname === '/';
  const isSameOrigin = url.origin === self.location.origin;

  if (isHtml && isSameOrigin) {
    // HTML文件：始终先网络（绕过浏览器缓存），失败才回退缓存
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(response => {
          // 网络请求成功，更新缓存
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => {
          // 网络失败，回退缓存
          return caches.match(e.request);
        })
    );
  } else {
    // 其他资源（JS/CSS/图片）：网络优先，失败回退缓存
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
