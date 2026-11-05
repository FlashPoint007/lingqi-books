import {AsyncLocalStorage} from 'node:async_hooks';
import {SourceError,sourceFailure,type SourceFailure} from './source-errors';

const signals=new AsyncLocalStorage<AbortSignal>();
export function sourceRequestSignal(){return signals.getStore();}
type Health={failures:number;openUntil:number;probeUntil:number;generation:number;last?:SourceFailure;touched:number};
/** Completed health metadata only; never share request-owned promises. */
export function createSourceHealth(now=Date.now,random=Math.random){
 const states=new Map<string,Health>();
 const cooldown=(state:Health)=>{
  const seconds=Math.max(1,Math.ceil((Math.max(state.openUntil,state.probeUntil)-now())/1000));
  return new SourceError('source_cooling_down','此来源正在冷却',`上次错误：${state.last?.message||'来源连接失败'}。请等待 ${seconds} 秒后再试，其他来源仍可使用。`,true,503,seconds);
 };
 function status(source:string){
  const state=states.get(source);if(!state)return;
  const until=Math.max(state.openUntil,state.probeUntil);
  if(!until)return;
  return {state:state.probeUntil>now()?'probing':state.openUntil>now()?'cooling':'ready',retryAfter:Math.max(0,Math.ceil((until-now())/1000)),nextAttemptAt:new Date(until).toISOString(),code:state.last?.code};
 }
 async function run<T>(source:string,load:()=>Promise<T>,timeoutMs=12000):Promise<T>{
  const time=now();let state=states.get(source);
  if(state&&(state.openUntil>time||state.probeUntil>time))throw cooldown(state);
  // At most one recovery request after cooldown, with an expiring lease in case
  // its owning Worker request is abandoned. An ordinary reader never waits on it.
  if(!state){
   for(const [key,value] of states)if(value.touched<time-1800000)states.delete(key);
   if(states.size>=128)states.delete(states.keys().next().value!);
   state={failures:0,openUntil:0,probeUntil:0,generation:0,touched:time};states.set(source,state);
  }
  const probing=!!state.openUntil;
  if(probing){state!.probeUntil=time+timeoutMs+5000;state!.generation++;}
  const generation=state?.generation||0,controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{const error=new SourceError('connection_failed','来源检索超时','已停止等待此来源，其他来源仍可阅读。',true);controller.abort(error);reject(error);},timeoutMs);});
  try{
   const data=await Promise.race([signals.run(controller.signal,load),timeout]);
   if(!state||states.get(source)===state&&state.generation===generation)states.delete(source);
   return data;
  }catch(error){
   const failure=sourceFailure(error);
   const sourceFault=['connection_failed','upstream_unavailable','rate_limited','parse_changed','verification_required','access_denied','domain_changed'].includes(failure.code);
   if(states.get(source)!==state||state.generation!==generation)throw error;
   if(!sourceFault){if(probing)states.delete(source);throw error;}
   state.failures++;state.last=failure;state.touched=now();state.probeUntil=0;
   const structural=['parse_changed','verification_required','access_denied','domain_changed'].includes(failure.code);
   if(structural||failure.code==='rate_limited'||state.failures>=2){
    const base=structural?300000:Math.min(300000,30000*2**Math.min(4,Math.max(0,state.failures-2)));
    state.openUntil=now()+Math.min(1800000,Math.max(failure.retryAfter?failure.retryAfter*1000:0,Math.round(base*(1+random()*0.1))));state.generation++;
   }
   throw error;
  }finally{clearTimeout(timer);}
 }
 return {run,status};
}
export const sourceHealth=createSourceHealth();
