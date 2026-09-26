const CACHE="emiruto-v20";
const ASSETS=[
  "./",
  "./index.html",
  "./styles.css?v=20260926-20",
  "./app.js?v=20260926-20",
  "./push-config.js?v=20260926-20",
  "./manifest.webmanifest",
  "./icon.svg",
  "./assets/oshi/normal.jpg?v=20260926-9",
  "./assets/oshi/morning.jpg?v=20260926-9",
  "./assets/oshi/cheer.jpg?v=20260926-9",
  "./assets/oshi/happy.jpg?v=20260926-9",
  "./assets/oshi/sad.jpg?v=20260926-9",
  "./assets/oshi/gentle.jpg?v=20260926-9",
  "./assets/oshi/rare.jpg?v=20260926-9",
  "./assets/oshi/rain.jpg?v=20260926-9",
  "./assets/oshi/spring.jpg?v=20260926-9",
  "./assets/oshi/summer.jpg?v=20260926-9",
  "./assets/oshi/halloween.jpg?v=20260926-9",
  "./assets/oshi/christmas.jpg?v=20260926-9",
  "./assets/oshi/newyear.jpg?v=20260926-9",
  "./assets/oshi/apr22.jpg?v=20260926-9"
,
  "./assets/oshi/adopted/v1.jpg?v=20260926-14"
,
  "./assets/oshi/adopted/v2.jpg?v=20260926-14"
,
  "./assets/oshi/adopted/v3.jpg?v=20260926-14"
,
  "./assets/oshi/adopted/v4.jpg?v=20260926-14"
,
  "./assets/oshi/adopted/v5.jpg?v=20260926-14"
,
  "./assets/oshi/adopted/v6.jpg?v=20260926-14",
  "./assets/oshi/adopted/v7.jpg?v=20260926-14",
  "./assets/oshi/adopted/v8.jpg?v=20260926-14",
  "./assets/oshi/adopted/v9.jpg?v=20260926-14",
  "./assets/oshi/adopted/v10.jpg?v=20260926-14",
  "./assets/oshi/adopted/v11.jpg?v=20260926-14",
  "./assets/oshi/adopted/v12.jpg?v=20260926-14",
  "./assets/oshi/adopted/v13.jpg?v=20260926-14",
  "./assets/oshi/adopted/v14.jpg?v=20260926-14",
  "./assets/oshi/adopted/v15.jpg?v=20260926-14",
  "./assets/oshi/adopted/v16.jpg?v=20260926-14",
  "./assets/oshi/adopted/v17.jpg?v=20260926-14",
  "./assets/oshi/adopted/v18.jpg?v=20260926-14",
  "./assets/oshi/adopted/v19.jpg?v=20260926-14",
  "./assets/oshi/adopted/v20.jpg?v=20260926-14",
  "./assets/oshi/adopted/v21.jpg?v=20260926-14",
  "./assets/oshi/adopted/v22.jpg?v=20260926-14",
  "./assets/oshi/adopted/v23.jpg?v=20260926-14",
  "./assets/oshi/adopted/v24.jpg?v=20260926-14",
  "./assets/oshi/adopted/v25.jpg?v=20260926-14",
  "./assets/oshi/adopted/v26.jpg?v=20260926-14",
  "./assets/oshi/adopted/v27.jpg?v=20260926-14",
  "./assets/oshi/adopted/v28.jpg?v=20260926-14",
  "./assets/oshi/adopted/v29.jpg?v=20260926-14",
  "./assets/oshi/adopted/v30.jpg?v=20260926-14"
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
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin) return;

  const needsFresh =
    e.request.mode==="navigate" ||
    e.request.destination==="script" ||
    e.request.destination==="style";

  if(needsFresh){
    e.respondWith(
      fetch(e.request,{cache:"no-store"})
        .then(r=>{
          if(r&&r.ok){
            const copy=r.clone();
            caches.open(CACHE).then(c=>c.put(e.request,copy));
          }
          return r;
        })
        .catch(()=>caches.match(e.request).then(hit=>hit||caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit=>
      hit||fetch(e.request).then(r=>{
        if(r&&r.ok){
          const copy=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
        }
        return r;
      }).catch(()=>caches.match("./index.html"))
    )
  );
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification?.data?.url||"./";
  event.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of list){
      try{
        if("focus" in client){await client.focus();return;}
      }catch{}
    }
    if(self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{
    try{data={body:event.data?.text()||""};}catch{}
  }
  const title=data.title||"EmiruTo";
  const options={
    body:data.body||"",
    tag:data.tag||"emiruto-background",
    icon:"./icon.svg",
    badge:"./icon.svg",
    data:{url:data.url||"./"}
  };
  event.waitUntil((async()=>{
    await self.registration.showNotification(title,options);
    try{
      const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      if(!clients.length&&"setAppBadge" in self.navigator&&data.badge) await self.navigator.setAppBadge(Number(data.badge)||1);
    }catch{}
  })());
});
