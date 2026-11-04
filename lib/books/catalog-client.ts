import type {Catalog} from './model';

/** Keep reads cancelable and bounded, including a stalled hosting connection. */
export async function catalogRequest(params:Record<string,string|number>,signal?:AbortSignal,timeoutMs=45000){
 const controller=new AbortController();let expired=false;
 const abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{expired=true;controller.abort();},timeoutMs);
 try{
  const r=await fetch('/api/catalog?'+new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)])),{signal:controller.signal,headers:{Accept:'application/json'}});
  let data:any;try{data=await r.json();}catch{throw new Error(`网站连接异常（${r.status}），请稍后重试`);}
  if(!r.ok)throw new Error([data.error||'请求失败',data.hint].filter(Boolean).join('。'));return data;
 }catch(e){if(expired&&!signal?.aborted)throw new Error('读取超时，请重试或选择其他来源');throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}


/** Multi-source searches reveal completed providers while slower ones finish. */
export async function searchCatalog(params:Record<string,string|number>,signal:AbortSignal,onUpdate:(data:Catalog)=>void):Promise<Catalog>{
 if(!['all','readable'].includes(String(params.source)))return catalogRequest(params,signal);
 const controller=new AbortController();
 const abort=()=>controller.abort(signal.reason);
 if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
 let expired=false;
 const timer=setTimeout(()=>{expired=true;controller.abort();},45000);
 try{
  const response=await fetch('/api/catalog?'+new URLSearchParams(Object.entries({...params,stream:1}).map(([key,value])=>[key,String(value)])),{
   signal:controller.signal,headers:{Accept:'application/x-ndjson'},
  });
  if(!response.ok){const error=await response.json() as {error?:string};throw new Error(error.error||'检索失败，请重试');}
  if(!response.body)throw new Error('来源未返回检索结果');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',latest:Catalog|undefined,total=0;
  const consume=(line:string)=>{
   if(!line.trim())return;
   const data=JSON.parse(line) as Catalog;
   if(!Array.isArray(data.items)||!Array.isArray(data.statuses)||!Array.isArray(data.pendingSources))throw new Error('检索数据不完整');
   latest=data;if(!controller.signal.aborted)onUpdate(data);
  };
  try{
   while(true){
    const part=await reader.read();if(part.done)break;
    total+=part.value.length;if(total>8000000)throw new Error('检索结果过大，请选择单个来源');
    buffer+=decoder.decode(part.value,{stream:true});
    let at:number;while((at=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,at));buffer=buffer.slice(at+1);}
   }
   buffer+=decoder.decode();if(buffer.trim())consume(buffer);
   if(!latest||latest.pendingSources?.length)throw new Error('部分来源尚未完成，请重试或选择单个来源');
   return latest;
  }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
 }catch(error){if(expired&&!signal.aborted)throw new Error('部分来源响应超时，已返回的作品仍可阅读');throw error;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
