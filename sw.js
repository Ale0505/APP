/* TRAMA - recursos locales y funcionamiento con cobertura limitada */
const CACHE='trama-bandama-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.add('./index.html').catch(()=>{})));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('message',event=>{
 if(event.data?.type!=='PREPARE_OFFLINE')return;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE),essentialFailed=[],optionalFailed=[];
  for(const [list,failed] of [[event.data.essential||[],essentialFailed],[event.data.optional||[],optionalFailed]]){
   for(const url of list){try{const req=new Request(new URL(url,self.registration.scope).href,{mode:'cors',credentials:'same-origin'});const res=await fetch(req,{cache:'reload'});if(!res.ok)throw Error(String(res.status));await cache.put(req,res.clone())}catch(e){failed.push(url)}}
  }
  event.ports[0]?.postMessage({essentialFailed,optionalFailed});
 })())
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET')return;
 if(url.hostname.endsWith('supabase.co'))return; // datos dinámicos: la app usa copia local de configuración
 const local=url.origin===self.location.origin;
 const supported=local||['cdn.jsdelivr.net','unpkg.com','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname);
 if(!supported)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  // Los vídeos de Safari pueden solicitar bytes parciales (Range).
  if(req.headers.has('range')){
   const full=await cache.match(new Request(req.url));
   if(full&&full.type!=='opaque'){
    const bytes=await full.arrayBuffer(),match=/bytes=(\d+)-(\d*)/.exec(req.headers.get('range')||'');
    if(match){const start=Number(match[1]),end=Math.min(bytes.byteLength-1,match[2]?Number(match[2]):bytes.byteLength-1);
     if(start<=end&&start<bytes.byteLength)return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':full.headers.get('Content-Type')||'video/mp4','Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,'Accept-Ranges':'bytes','Content-Length':String(end-start+1)}});
    }
   }
   return fetch(req);
  }
  const cached=await cache.match(req,{ignoreSearch:local&&req.mode==='navigate'});
  if(cached)return cached;
  try{const response=await fetch(req);if(response.ok||response.type==='opaque')cache.put(req,response.clone()).catch(()=>{});return response}
  catch(e){if(req.mode==='navigate'){const fallback=await cache.match(new URL('./index.html',self.registration.scope).href);if(fallback)return fallback}throw e}
 })());
});
