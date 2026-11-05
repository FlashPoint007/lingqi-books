import {AsyncLocalStorage} from 'node:async_hooks';

type CacheStore={match:(request:Request)=>Promise<Response|undefined>;put:(request:Request,response:Response)=>Promise<unknown>};
type Lifetime={waitUntil:(promise:Promise<unknown>)=>void};
type Scope={origin:string;anonymous:boolean;cache?:CacheStore;lifetime:Lifetime};
const context=new AsyncLocalStorage<Scope>();
const revision='public-reading-v38-1';
const catalogSources=new Set('bangumi mangadex mangadex-en narou lnovelapi n8novel komiic manhuagui lnovel mangabz sfacg bh3 linovel kakuyomu dm5'.split(' '));
const imageSources=new Set(['bh3','lnovelapi']);
export function runWithPublicCache<T>(request:Request,lifetime:Lifetime,run:()=>T,cache?:CacheStore):T{
 const runtime=globalThis as typeof globalThis & {caches?:{default?:CacheStore}};
 return context.run({origin:new URL(request.url).origin,anonymous:!request.headers.has('Authorization')&&!request.headers.has('Cookie'),cache:cache??runtime.caches?.default,lifetime},run);
}
function usable(){const scope=context.getStore();return scope?.anonymous&&scope.cache&&typeof scope.lifetime.waitUntil==='function'?scope:undefined;}
function enabled(source:string){return source==='bangumi'||source==='mangadex'||source==='narou'&&process.env.NAROU_ENABLED==='true'||(process.env.PUBLIC_READING_SOURCES||'').split(',').map(s=>s.trim()).includes(source);}
async function cacheKey(scope:Scope,kind:string,parts:unknown){
 const policy=[revision,process.env.PUBLIC_READING_SOURCES||'',process.env.MANGADEX_BLOCKED_GROUPS||'',process.env.NAROU_ENABLED||''];
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([policy,parts])));
 return new Request(scope.origin+'/.lingqi-public-cache/'+kind+'/'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));
}
async function boundedBytes(response:Response,max:number){
 if(Number(response.headers.get('Content-Length'))>max)throw new Error('cache entry too large');
 const reader=response.body?.getReader();if(!reader)throw new Error('empty cache entry');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>max)throw new Error('cache entry too large');chunks.push(chunk.value);}}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
}
async function lookup(cache:CacheStore,key:Request){
 let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([cache.match(key).then(response=>{if(expired)void response?.body?.cancel().catch(()=>{});return response;}),new Promise<undefined>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(undefined);},250);})]);}
 finally{clearTimeout(timer);}
}
function schedule(scope:Scope,job:Promise<unknown>){const safe=job.catch(()=>{});try{scope.lifetime.waitUntil(safe);}catch{/* Background caching is optional. */}}
type CatalogData={items:unknown[];total:number;partial?:boolean;edgeCache?:string;cachedAt?:string};
function validCatalog(value:any):value is CatalogData{return value&&Array.isArray(value.items)&&value.items.length<=100&&Number.isFinite(value.total)&&value.total>=0&&!value.partial;}
/** Cache parsed public catalogs, including individual providers of an NDJSON search.
 * Never cache raw HTML, failed parses, aggregate failures or account services. */
export async function cachedPublicCatalog<T extends CatalogData>(source:string,params:unknown,load:()=>Promise<T>):Promise<T>{
 const scope=usable();if(!scope||!catalogSources.has(source)||!enabled(source))return load();
 const key=await cacheKey(scope,'catalog',[source,params]);
 try{
  const hit=await lookup(scope.cache!,key);
  if(hit){const record=JSON.parse(new TextDecoder().decode(await boundedBytes(hit,1200000)));if(record.expiresAt>Date.now()&&validCatalog(record.value))return {...record.value,edgeCache:'HIT',cachedAt:record.cachedAt};}
 }catch{/* Cache unavailability must not block reading. */}
 const value=await load();
 if(validCatalog(value)){
  const ttl=90,record={value,cachedAt:new Date().toISOString(),expiresAt:Date.now()+ttl*1000},body=JSON.stringify(record);
  if(new TextEncoder().encode(body).length<=1200000)schedule(scope,Promise.resolve().then(()=>scope.cache!.put(key,new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${ttl}`}}))));
  return {...value,edgeCache:'MISS',cachedAt:record.cachedAt};
 }
 return value;
}
/** Stable anonymous image gateways only. Ticket/quota based and private images
 * are excluded. The cache branch buffers at most 2 MB; the reader still streams. */
export async function cachedPublicImage(request:Request,load:()=>Promise<Response>):Promise<Response>{
 const scope=usable(),url=new URL(request.url),source=url.searchParams.get('source')||'';
 if(!scope||url.pathname!=='/api/reader-image'||!imageSources.has(source)||!enabled(source)||request.headers.has('Range'))return load();
 const parts=[...url.searchParams].filter(([key])=>key!=='_retry').sort(([a],[b])=>a.localeCompare(b));
 const key=await cacheKey(scope,'image',parts);
 const outgoing=(response:Response,state:string)=>{const headers=new Headers(response.headers);headers.set('Cache-Control','private, max-age=300');headers.set('X-Lingqi-Cache',state);return new Response(response.body,{status:response.status,headers});};
 try{if(!url.searchParams.has('_retry')){const hit=await lookup(scope.cache!,key);if(hit?.status===200)return outgoing(hit,'HIT');}}catch{/* Serve the validated gateway response instead. */}
 const response=await load();
 if(response.status!==200||response.headers.has('Set-Cookie')||!/^image\/(jpeg|png|webp|gif|avif)$/.test(response.headers.get('Content-Type')||''))return response;
 const copy=response.clone();
 schedule(scope,(async()=>{const bytes=await boundedBytes(copy,2000000);await scope.cache!.put(key,new Response(bytes,{headers:{'Content-Type':response.headers.get('Content-Type')!,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}}));})());
 return outgoing(response,'MISS');
}
