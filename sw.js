// Bài 13 – scoped PWA; never delete caches of other lessons on the same GitHub Pages origin.
const PREFIX = 'bai13-pwa-';
const SHELL = PREFIX + 'static-v1';
const MEDIA = PREFIX + 'media-v1';
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];
const VIDEO = new URL('./BAI_13_TIM_KIEM_VA_THAY_THE.mp4', self.location.href).href;
const ROOT = new URL('./', self.location.href).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL)
    .then(cache => cache.addAll(SHELL_FILES.map(path => new Request(path, {cache:'reload'}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names =>
    Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== SHELL && name !== MEDIA)
      .map(name => caches.delete(name)))
  ).then(() => self.clients.claim()));
});

async function cachedVideoOrNetwork(request) {
  const media = await caches.open(MEDIA);
  const full = await media.match(VIDEO);
  if (!full || !full.ok || full.status !== 200) return fetch(request);
  const range = request.headers.get('range');
  if (!range) return full;
  // Browsers request a 206-range stream even after the entire MP4 is cached.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) return fetch(request);
  const buffer = await full.arrayBuffer();
  const size = buffer.byteLength;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
    start = Math.max(0,size-suffix); end=size-1;
  } else {
    start=Number(match[1]); end=match[2] ? Number(match[2]) : size-1;
  }
  if (start>=size || start>end || !Number.isFinite(start) || !Number.isFinite(end)) {
    return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
  }
  end=Math.min(end,size-1);
  const slice=buffer.slice(start,end+1);
  const headers=new Headers();
  headers.set('Content-Type','video/mp4');
  headers.set('Accept-Ranges','bytes');
  headers.set('Content-Range','bytes '+start+'-'+end+'/'+size);
  headers.set('Content-Length',String(slice.byteLength));
  return new Response(slice,{status:206,statusText:'Partial Content',headers});
}
self.addEventListener('fetch',event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.href===VIDEO){event.respondWith(cachedVideoOrNetwork(request));return;}
  if(url.origin!==self.location.origin || !url.href.startsWith(ROOT))return;
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(resp => {
    if(resp && resp.ok && resp.status===200){
      event.waitUntil(caches.open(SHELL).then(cache=>cache.put(request,resp.clone())).catch(()=>{}));
    }
    return resp;
  }).catch(()=>request.mode==='navigate' ? caches.match('./index.html') : Response.error())));
});
