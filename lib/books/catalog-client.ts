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
