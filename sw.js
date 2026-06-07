// Service Worker for 工单管理系统 - offline support
const CACHE_NAME = 'work-orders-v1';
const ASSETS = [
  '/',
  '/工单管理-总表.html',
  '/工单管理-本周.html',
  '/config.js',
  '/data-service.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
