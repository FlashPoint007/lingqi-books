import {sourceRequestSignal} from './source-health';
import {load} from 'cheerio/slim';
import {SourceError,retryAfterSeconds} from './source-errors';
import {BoundedDataCache} from './bounded-cache';
const hasCredentials=(headers:Record<string,string>)=>Object.keys(headers).some(key=>/^(cookie|authorization|proxy-authorization|x-api-key|x-image-ticket)$/i.test(key));
const UA='LingqiBooks/0.3 (+https://github.com/FlashPoint007/lingqi-books)';
const memo=new BoundedDataCache<unknown>();const active=new Map<string,number>();
const queues=new Map<string,Array<()=>void>>();
async function acquire(origin:string){
 if((active.get(origin)||0)<3)active.set(origin,(active.get(origin)||0)+1);
 else {const queue=queues.get(origin)||[];if(queue.length>=24)throw new SourceError('rate_limited','来源请求较多','请稍后再试。',true);queues.set(origin,queue);await new Promise<void>((resolve,reject)=>{const grant=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{const at=queue.indexOf(grant);if(at>=0)queue.splice(at,1);if(!queue.length)queues.delete(origin);reject(new SourceError('rate_limited','来源请求排队超时','请稍后再试。',true));},12000);queue.push(grant);});}
 let released=false;return ()=>{if(released)return;released=true;const queue=queues.get(origin);const next=queue?.shift();if(!queue?.length)queues.delete(origin);if(next)next();else {const remaining=(active.get(origin)||1)-1;if(remaining)active.set(origin,remaining);else active.delete(origin);}};
}
export async function limitedBytes(response:Response,max:number){const reader=response.body?.getReader();if(!reader)throw new Error('来源返回了空响应');let count=0;const chunks:Uint8Array[]=[];try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>max){await reader.cancel();throw new Error('来源响应超过大小限制');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
// Only completed data can cross Worker requests. An in-flight promise belongs to
// its request and can be abandoned when that request is canceled by the client.
export async function cached<T>(key:string,job:()=>Promise<T>,ttl=180000):Promise<T>{const h=memo.get(key);if(h!==undefined)return h as T;sourceRequestSignal()?.throwIfAborted();const data=await job();sourceRequestSignal()?.throwIfAborted();memo.set(key,data,ttl);return data;}
export function publicUrl(raw:string,base?:string){const u=new URL(raw,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw new Error('来源地址无效');return u;}
export async function request(url:URL,headers:Record<string,string>={}){
 const release=await acquire(url.origin),controller=new AbortController();
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,sink:ReadableStreamDefaultController<Uint8Array>|undefined,finished=false;
 const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);release();};
 const timer=setTimeout(()=>{controller.abort();sink?.error(new SourceError('connection_failed','来源读取超时','请稍后重试。',true));void reader?.cancel().catch(()=>{}).finally(()=>{try{reader?.releaseLock();}catch{}});finish();},15000);
 try{
  const response=await fetch(url,{headers:{'User-Agent':UA,Accept:'text/html,application/json',...headers},redirect:'manual',signal:sourceRequestSignal()?AbortSignal.any([controller.signal,sourceRequestSignal()!]):controller.signal});
  if(!response.body){finish();return response;}
  reader=response.body.getReader();
  const body=new ReadableStream<Uint8Array>({
   start(controller){sink=controller;},
   async pull(sink){try{const chunk=await reader!.read();if(finished)return;if(chunk.done){finish();sink.close();reader!.releaseLock();}else sink.enqueue(chunk.value);}catch(error){if(!finished){finish();reader!.releaseLock();sink.error(error);}}},
   async cancel(reason){try{await reader!.cancel(reason);}finally{finish();reader!.releaseLock();}},
  });
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch{finish();throw new SourceError('connection_failed','来源连接失败或超时','当前服务器无法连接来源，可以稍后重试。',true);}
}
export function assertHtmlPage(html:string,url:URL,status:number){
 // Read error bodies too: verified challenges can arrive as HTTP 403 or 503.
 if(/(?:cf-chl-|challenge-platform|<title[^>]*>\s*Just a moment|正在进行安全验证|verify (?:that )?you are human|checking your browser)/i.test(html))throw new SourceError('verification_required','来源要求人机验证，当前无法读取','需要来源认可的访问会话；反复重试不会完成验证。',false,status);
 const $=load(html);const title=$('title').text().trim();
 const loginPath=/(?:^|\/)(?:login|signin|sign-in)(?:\/|$|\.)/i.test(url.pathname);
 const loginTitle=/^(?:用户|會員|会员|账户|帳戶)?\s*(?:登录|登入|登錄|Login|Sign in)(?:\s|$|[-_|])/i.test(title);
 const passwordForm=$('form input[type="password"]').length>0;
 const loginNotice=/请先登[录入]|請先登[入錄]|登录后(?:阅读|查看)|登入後(?:閱讀|查看)|please (?:log|sign) in to (?:read|view)/i.test($('main,.alert,.login-box,.message,body').first().text());
 if(status===401||loginPath||loginTitle||(passwordForm&&loginNotice))throw new SourceError('login_required','此来源需要登录后读取','请连接具有该作品阅读权限的已登录内容服务。',false,status);
 if(status===429)throw new SourceError('rate_limited','来源限制了请求频率','请稍后重试，避免连续检测或刷新。',true,status);
 if(status===403)throw new SourceError('access_denied','来源拒绝了当前请求（403）','该响应未说明具体原因；需要检查来源权限或内容服务。',false,status);
 if(status===404)throw new SourceError('not_found','来源未找到此页面（404）','作品地址可能已变更，需要更新来源或作品 ID。',false,status);
 if(status<200||status>=300)throw new SourceError('upstream_unavailable',`来源暂不可用（${status}）`,'来源服务返回错误，可以稍后重试。',status>=500,status);
}
export async function htmlPage(url:URL,headers:Record<string,string>={},charset='utf-8',allowedOrigins=[url.origin]){
 const job=async()=>{let current=url;for(let i=0;i<4;i++){const r=await request(current,headers);if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();const location=r.headers.get('location');if(!location)throw new SourceError('invalid_response','来源跳转缺少目标地址','需要更新来源适配。');const next=publicUrl(location,current.href);if(!allowedOrigins.includes(next.origin))throw new SourceError('domain_changed','来源已跳转到其他域名','需要确认来源的新地址及对应解析器，或配置兼容内容服务。');current=next;continue;}
 const bytes=await limitedBytes(r,3000000);let html=new TextDecoder(charset).decode(bytes);const declared=new TextDecoder().decode(bytes.slice(0,3000)).match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1];if(declared&&/^(gbk|gb2312|gb18030|utf-8|big5)$/i.test(declared))html=new TextDecoder(declared).decode(bytes);try{assertHtmlPage(html,current,r.status);}catch(error){if(error instanceof SourceError&&r.status===429)error.retryAfter=retryAfterSeconds(r.headers.get('Retry-After'));throw error;}return {html,url:current.href};}throw new SourceError('domain_changed','来源跳转次数过多','需要检查来源地址或登录状态。');};
 // Authenticated responses must never share the anonymous page cache.
 return hasCredentials(headers)?job():cached('html:'+url.href,job);
}
export async function jsonRequest(url:URL,headers:Record<string,string>={}){
 const load=async()=>{const r=await request(url,headers);if(!r.ok){await r.body?.cancel();if(r.status===429)throw new SourceError('rate_limited','来源限制了请求频率','请等待来源额度恢复。',true,429,retryAfterSeconds(r.headers.get('Retry-After')));throw new Error(r.status===401||r.status===403?'服务鉴权失败，请检查服务端配置':`服务暂不可用（${r.status}）`);}try{return JSON.parse(new TextDecoder().decode(await limitedBytes(r,4000000)));}catch{throw new Error('服务返回的数据无效');}};
 return hasCredentials(headers)?load():cached('json:'+url.href,load,60000);
}
export function imageMimeType(b:Uint8Array){if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return 'image/png';const h=new TextDecoder('latin1').decode(b.slice(0,16));if(/^GIF8[79]a/.test(h))return 'image/gif';if(h.startsWith('RIFF')&&h.slice(8,12)==='WEBP')return 'image/webp';if(h.slice(4,8)==='ftyp'&&/^avi[fs]/.test(h.slice(8,12)))return 'image/avif';throw new SourceError('invalid_response','来源未返回有效图片','请检测图片来源，或选择其他阅读版本。');}
export async function imageResponse(r:Response){
 const declared=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase().replace(/^image\/jpg$/,'image/jpeg').replace(/^image\/x-png$/,'image/png');
 const supported=/^image\/(jpeg|png|webp|gif|avif)$/.test(declared);
 if(!r.ok||!supported&&!['','application/octet-stream','binary/octet-stream'].includes(declared)){
  const bytes=await limitedBytes(r,64000),text=new TextDecoder().decode(bytes);
  assertHtmlPage(text,new URL(r.url||'https://source.invalid/image'),r.status);
  if(/<title[^>]*>\s*404[.\s]|<h1[^>]*>\s*404\b/i.test(text))throw new SourceError('not_found','来源图片文件不存在','此图片链接已失效，可以切换同作品的其他版本。',false,404);
  throw new SourceError('invalid_response','图片暂不可用：来源未返回图片','需要检查来源图片格式或图片地址。',false,r.status);
 }
 const max=15000000,reader=r.body?.getReader();
 if(!reader)throw new SourceError('invalid_response','来源返回了空图片','请稍后重试。',true);
 let count=0;const prefix:Uint8Array[]=[];
 try{
  if(Number(r.headers.get('content-length'))>max)throw new Error('图片超过大小限制');
  while(count<16){const chunk=await reader.read();if(chunk.done)break;count+=chunk.value.length;if(count>max)throw new Error('图片超过大小限制');prefix.push(chunk.value);}
  if(!count)throw new SourceError('invalid_response','来源返回了空图片','请稍后重试。',true);
  const first=new Uint8Array(Math.min(count,64000));let offset=0;
  for(const bytes of prefix){const piece=bytes.subarray(0,first.length-offset);first.set(piece,offset);offset+=piece.length;if(offset===first.length)break;}
  let type:string;
  try{type=imageMimeType(first);}catch(error){assertHtmlPage(new TextDecoder().decode(first),new URL(r.url||'https://source.invalid/image'),r.status);throw error;}
  let released=false;const unlock=()=>{if(!released){released=true;reader.releaseLock();}};
  const body=new ReadableStream<Uint8Array>({
   start(sink){for(const bytes of prefix)sink.enqueue(bytes);},
   async pull(sink){try{const chunk=await reader.read();if(chunk.done){unlock();sink.close();return;}count+=chunk.value.length;if(count>max){await reader.cancel();throw new Error('图片超过大小限制');}sink.enqueue(chunk.value);}catch(error){unlock();sink.error(error);}},
   async cancel(reason){try{await reader.cancel(reason);}finally{unlock();}},
  });
  return new Response(body,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=600'}});
 }catch(error){await reader.cancel().catch(()=>{});reader.releaseLock();throw error;}
}
/** Images use image negotiation, bounded redirects and the same source queue.
 * Callers still validate work membership and pin the image origin/path. */
export async function requestImage(url:URL,headers:Record<string,string>={}){
 let current=url;for(let i=0;i<4;i++){
  const r=await request(current,{Accept:'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',...headers});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();const location=r.headers.get('location');if(!location)throw new SourceError('invalid_response','图片跳转缺少地址','需要更新图片来源。');const next=publicUrl(location,current.href);if(next.origin!==url.origin)throw new SourceError('domain_changed','来源图片跳转到其他图床','需要核对新的图片节点后更新适配。');current=next;continue;}
  return imageResponse(r);
 }throw new SourceError('domain_changed','来源图片跳转次数过多','需要核对图片地址。');
}
