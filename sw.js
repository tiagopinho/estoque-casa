'use strict';
const CACHE_NAME = 'estoque-casa-v2';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
});
self.addEventListener('push', event => {
  let data={title:'Estoque Casa',body:'Há produtos próximos do vencimento.',url:'/'};
  try{data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',data:{url:data.url}}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?list[0].focus():clients.openWindow(event.notification.data?.url||'/')));
});
