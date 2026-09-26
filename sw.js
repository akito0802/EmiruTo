const CACHE="emiruto-v8";
const ASSETS=[
  "./",
  "./index.html",
  "./styles.css?v=20260926-8",
  "./app.js?v=20260926-8",
  "./manifest.webmanifest",
  "./icon.svg",
  "./assets/oshi/normal.webp?v=20260926-8",
  "./assets/oshi/morning.webp?v=20260926-8",
  "./assets/oshi/cheer.webp?v=20260926-8",
  "./assets/oshi/happy.webp?v=20260926-8",
  "./assets/oshi/sad.webp?v=20260926-8",
  "./assets/oshi/gentle.webp?v=20260926-8",
  "./assets/oshi/rare.webp?v=20260926-8",
  "./assets/oshi/rain.webp?v=20260926-8",
  "./assets/oshi/spring.webp?v=20260926-8",
  "./assets/oshi/summer.webp?v=20260926-8",
  "./assets/oshi/halloween.webp?v=20260926-8",
  "./assets/oshi/christmas.webp?v=20260926-8",
  "./assets/oshi/newyear.webp?v=20260926-8",
  "./assets/oshi/apr22.webp?v=20260926-8"
];
self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener("activate",e=>e.waitUntil(
  Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ])
));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match("./index.html"))));
});