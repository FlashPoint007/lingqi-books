/** Local admission control reduces upstream amplification. It is not a global WAF. */
type Lane='read'|'image'|'expensive';
const paths=new Set(['/api/catalog','/api/reader-image','/api/content-image']);
const sources=new Set('all readable bangumi mangadex mangadex-en narou bridge wenku8 bilinovel esj masiro suwayomi maki sfacg bh3 mangabz manhuagui lnovel n8novel komiic kakuyomu linovel lnovelapi dm5'.split(' '));
const actions=new Set('search status bridge-status test verify-reading reading-candidates detail chapters content pages'.split(' '));
const catalogKeys=new Set('action source id workId q page kind sort tag target lookup stream'.split(' '));
const imageKeys=new Set('source workId id index kind quality file _retry'.split(' '));
const contentKeys=new Set('workId id index _retry'.split(' '));
const policies={read:{burst:120,perMinute:240,active:20},image:{burst:120,perMinute:360,active:16},expensive:{burst:12,perMinute:36,active:6}};
function reject(status:number,code:string,error:string,seconds?:number){return Response.json({error,code,...(seconds?{hint:`请等待 ${seconds} 秒后重试`,retryAfter:seconds}:{} )},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(seconds?{'Retry-After':String(seconds)}:{}),...(status===405?{Allow:'GET'}:{})}});}
export function inspectReadRequest(request:Request):{lane:Lane;cost:number}|Response|undefined{
 const url=new URL(request.url);if(!paths.has(url.pathname))return;
 if(request.method!=='GET')return reject(405,'method_not_allowed','此接口仅支持读取');
 if(url.href.length>8192)return reject(414,'invalid_parameters','请求地址过长');
 if(request.headers.get('sec-fetch-site')==='cross-site')return reject(403,'cross_site_request','请从本站打开阅读内容');
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return reject(403,'cross_site_request','请求来源无效');
 const catalog=url.pathname==='/api/catalog',p=url.searchParams,keys=catalog?catalogKeys:url.pathname==='/api/reader-image'?imageKeys:contentKeys,seen=new Set<string>();
 for(const [key,value] of p){if(!keys.has(key)||seen.has(key)||value.length>(key==='workId'?1500:2000)||/[\u0000-\u001f\u007f]/.test(value))return reject(400,'invalid_parameters','请求参数无效');seen.add(key);}
 const source=p.get('source')||(catalog?'readable':'');
 if((catalog||url.pathname==='/api/reader-image')&&!sources.has(source))return reject(400,'invalid_parameters','不支持的来源');
 for(const [key,min,max] of [['page',1,100],['index',0,4999],['_retry',0,999999]] as const){const value=p.get(key);if(value!==null&&(!/^\d{1,6}$/.test(value)||Number(value)<min||Number(value)>max))return reject(400,'invalid_parameters','分页或图片序号无效');}
 if(!catalog){if(!p.get('workId')||p.has('file')&&(source!=='n8novel'||p.get('kind')!=='cover'||!/^[a-zA-Z0-9_.-]{1,160}$/.test(p.get('file')!)))return reject(400,'invalid_parameters','图片参数无效');if(p.has('kind')&&p.get('kind')!=='cover'||p.has('quality')&&!['original','saver'].includes(p.get('quality')!))return reject(400,'invalid_parameters','图片选项无效');return {lane:'image',cost:1};}
 const action=p.get('action')||'search';
 if(!actions.has(action)||(p.get('q')||'').length>100||(p.get('lookup')||'').length>100||(p.get('tag')||'').length>100||p.has('kind')&&!['novel','manga'].includes(p.get('kind')!)||p.has('stream')&&p.get('stream')!=='1'||p.has('target')&&!sources.has(p.get('target')!)||p.has('sort')&&!['popular','score','updated','library'].includes(p.get('sort')!))return reject(400,'invalid_parameters','目录选项无效');
 if(['detail','chapters','content','pages','reading-candidates'].includes(action)&&!p.get('id'))return reject(400,'invalid_parameters','缺少作品或章节 ID');
 if(['test','verify-reading','reading-candidates','bridge-status'].includes(action))return {lane:'expensive',cost:action==='test'&&['all','readable'].includes(source)||action==='reading-candidates'&&!p.get('target')?6:action==='verify-reading'?3:1};
 return {lane:'read',cost:action==='search'&&['all','readable'].includes(source)?8:1};
}
export function createReadProtection(now=Date.now){
 const buckets=new Map<string,{tokens:number;updated:number;expires:number}>(),active={read:0,image:0,expensive:0};
 let sweepAt=0;
 return async function protect(request:Request,dispatch:(request:Request)=>Promise<Response>|Response):Promise<Response>{
  const inspected=inspectReadRequest(request);if(inspected instanceof Response)return inspected;
  if(!inspected)return dispatch(request);
  const {lane,cost}=inspected,policy=policies[lane],time=now();
  // CF supplies this header at its ingress. Never trust X-Forwarded-For, cookies,
  // query IDs or an IP header supplied to a non-Cloudflare preview runtime.
  const cf=(request as Request & {cf?:unknown}).cf;
  const ip=cf?request.headers.get('cf-connecting-ip'):null;
  const identity=ip&&ip.length<=64&&/^[\da-f:.]+$/i.test(ip)?ip:'unknown';
  if(time>=sweepAt){for(const [key,bucket] of buckets)if(bucket.expires<=time)buckets.delete(key);sweepAt=time+10000;}
  const key=lane+':'+identity,previous=buckets.get(key);
  if(!previous&&buckets.size>=4096)return reject(429,'rate_limited','请求较多',60);
  const tokens=Math.min(policy.burst,(previous?.tokens??policy.burst)+Math.max(0,time-(previous?.updated??time))*policy.perMinute/60000);
  if(tokens<cost)return reject(429,'rate_limited','请求过于频繁',Math.max(1,Math.ceil((cost-tokens)*60/policy.perMinute)));
  buckets.set(key,{tokens:tokens-cost,updated:time,expires:time+120000});
  if(active[lane]>=policy.active||active.read+active.image+active.expensive>=32)return reject(503,'server_busy','阅读服务正忙，请稍后重试',3);
  active[lane]++;let done=false,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,sink:ReadableStreamDefaultController<Uint8Array>|undefined;
  const controller=new AbortController(),abort=()=>controller.abort(request.signal.reason);
  if(request.signal.aborted)abort();else request.signal.addEventListener('abort',abort,{once:true});
  const finish=()=>{if(done)return;done=true;active[lane]--;clearTimeout(timer);request.signal.removeEventListener('abort',abort);};
  let expire:((response:Response)=>void)|undefined;
  const deadline=new Promise<Response>(resolve=>{expire=resolve;});
  const timer=setTimeout(()=>{controller.abort();sink?.error(new Error('阅读响应超时'));void reader?.cancel().catch(()=>{}).finally(()=>{try{reader?.releaseLock();}catch{}});finish();expire!(reject(504,'read_timeout','阅读响应超时，请重试'));},60000);
  try{
   const response=await Promise.race([Promise.resolve(dispatch(new Request(request,{signal:controller.signal}))).then(response=>{if(done)void response.body?.cancel().catch(()=>{});return response;}),deadline]);
   if(done)return response;
   const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Cross-Origin-Resource-Policy','same-origin');
   if(response.status>=400||!headers.has('Cache-Control'))headers.set('Cache-Control','private, no-store');
   if(!response.body){finish();return new Response(null,{status:response.status,statusText:response.statusText,headers});}
   reader=response.body.getReader();
   const body=new ReadableStream<Uint8Array>({start(s){sink=s;},async pull(s){try{const chunk=await reader!.read();if(done)return;if(chunk.done){finish();reader!.releaseLock();s.close();}else s.enqueue(chunk.value);}catch(error){if(!done){finish();s.error(error);}}},async cancel(reason){controller.abort();try{await reader!.cancel(reason);}finally{finish();reader!.releaseLock();}}});
   return new Response(body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){finish();throw error;}
 };
}
export const protectReadRequest=createReadProtection();
