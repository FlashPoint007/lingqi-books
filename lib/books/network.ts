import {load} from 'cheerio/slim';
import {SourceError} from './source-errors';
const UA='LingqiBooks/0.3 (+https://github.com/FlashPoint007/lingqi-books)';
const memo=new Map<string,{data:unknown;until:number}>();const pending=new Map<string,Promise<unknown>>();const active=new Map<string,number>();
export async function limitedBytes(response:Response,max:number){const reader=response.body?.getReader();if(!reader)throw new Error('来源返回了空响应');let count=0;const chunks:Uint8Array[]=[];try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>max){await reader.cancel();throw new Error('来源响应超过大小限制');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
export async function cached<T>(key:string,job:()=>Promise<T>,ttl=180000):Promise<T>{const h=memo.get(key);if(h&&h.until>Date.now())return h.data as T;if(pending.has(key))return pending.get(key) as Promise<T>;const task=job().then(data=>{if(memo.size>=80)memo.delete(memo.keys().next().value!);memo.set(key,{data,until:Date.now()+ttl});return data;}).finally(()=>pending.delete(key));pending.set(key,task);return task;}
export function publicUrl(raw:string,base?:string){const u=new URL(raw,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw new Error('来源地址无效');return u;}
export async function request(url:URL,headers:Record<string,string>={}){const count=active.get(url.origin)||0;if(count>=3)throw new SourceError('rate_limited','来源请求较多','请稍后再试。',true);active.set(url.origin,count+1);try{return await fetch(url,{headers:{'User-Agent':UA,Accept:'text/html,application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new SourceError('connection_failed','来源连接失败或超时','当前服务器无法连接来源，可以稍后重试。',true);}finally{active.set(url.origin,Math.max(0,(active.get(url.origin)||1)-1));}}
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
 const bytes=await limitedBytes(r,3000000);let html=new TextDecoder(charset).decode(bytes);const declared=new TextDecoder().decode(bytes.slice(0,3000)).match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1];if(declared&&/^(gbk|gb2312|gb18030|utf-8|big5)$/i.test(declared))html=new TextDecoder(declared).decode(bytes);assertHtmlPage(html,current,r.status);return {html,url:current.href};}throw new SourceError('domain_changed','来源跳转次数过多','需要检查来源地址或登录状态。');};
 // Authenticated responses must never share the anonymous page cache.
 return Object.keys(headers).some(k=>/^(?:cookie|authorization)$/i.test(k))?job():cached('html:'+url.href,job);
}
export async function jsonRequest(url:URL,headers:Record<string,string>={}){return cached('json:'+url.href,async()=>{const r=await request(url,headers);if(r.status===401||r.status===403)throw new Error('服务鉴权失败，请检查服务端配置');if(!r.ok)throw new Error(`服务暂不可用（${r.status}）`);try{return JSON.parse(new TextDecoder().decode(await limitedBytes(r,4000000)));}catch{throw new Error('服务返回的数据无效');}},60000);}
export async function imageResponse(r:Response){const type=r.headers.get('content-type')||'';if(!r.ok||!/^image\/(jpeg|png|webp|gif|avif)(;|$)/i.test(type))throw new Error('图片暂不可用');const bytes=await limitedBytes(r,15000000);return new Response(bytes as BodyInit,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=600'}});}
