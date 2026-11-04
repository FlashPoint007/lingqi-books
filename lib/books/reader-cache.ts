/** Browser-only reading data. Consumers can leave a chapter without aborting a
 * prefetch that the next chapter is about to use. Changing works cancels it. */
export class ReaderCache<T> {
 private entries=new Map<string,{value:T;until:number;size:number}>();
 private pending=new Map<string,{controller:AbortController;promise:Promise<T>}>();
 constructor(private maxEntries=12,private maxCharacters=4000000,private ttlMs=300000){}
 get(key:string):T|undefined{
  const hit=this.entries.get(key);
  if(!hit)return;
  if(hit.until<=Date.now()){this.entries.delete(key);return;}
  this.entries.delete(key);this.entries.set(key,hit);
  return hit.value;
 }
 set(key:string,value:T){
  const size=JSON.stringify(value)?.length||0;
  this.entries.delete(key);
  if(size>this.maxCharacters)return;
  this.entries.set(key,{value,until:Date.now()+this.ttlMs,size});
  let used=[...this.entries.values()].reduce((sum,entry)=>sum+entry.size,0);
  while(this.entries.size>this.maxEntries||used>this.maxCharacters){
   const first=this.entries.keys().next().value!;
   used-=this.entries.get(first)!.size;this.entries.delete(first);
  }
 }
 read(key:string,load:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));
  const hit=this.get(key);
  if(hit!==undefined)return Promise.resolve(hit);
  let job=this.pending.get(key);
  if(!job){
   const controller=new AbortController();
   const promise=Promise.resolve().then(()=>load(controller.signal)).then(value=>{
    if(controller.signal.aborted)throw controller.signal.reason;
    this.set(key,value);return value;
   }).finally(()=>{if(this.pending.get(key)?.controller===controller)this.pending.delete(key);});
   job={controller,promise};this.pending.set(key,job);
  }
  if(!signal)return job.promise;
  const promise=job.promise;
  return new Promise<T>((resolve,reject)=>{
   const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));
   signal.addEventListener('abort',abort,{once:true});
   void promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
 }
 warm(key:string,load:(signal:AbortSignal)=>Promise<T>){
  if(this.pending.size>=3&&!this.pending.has(key))return;
  void this.read(key,load).catch(()=>{});
 }
 invalidate(key:string){
  this.entries.delete(key);this.pending.get(key)?.controller.abort();this.pending.delete(key);
 }
 cancelPending(){
  for(const job of this.pending.values())job.controller.abort();
  this.pending.clear();
 }
}

export function mayPreload(connection?:{saveData?:boolean;effectiveType?:string},visible=true){
 return visible&&!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType||'');
}
