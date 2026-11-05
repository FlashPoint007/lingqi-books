/** Completed data only: request-owned promises must never cross Worker requests. */
export class BoundedDataCache<T> {
 private entries=new Map<string,{value:T;until:number;bytes:number}>();
 private used=0;
 constructor(private maxEntries=80,private maxBytes=12*1024*1024,private maxEntryBytes=3*1024*1024){}
 get(key:string):T|undefined{
  const entry=this.entries.get(key);if(!entry)return;
  if(entry.until<=Date.now()){this.delete(key);return;}
  this.entries.delete(key);this.entries.set(key,entry);return entry.value;
 }
 delete(key:string){const entry=this.entries.get(key);if(entry)this.used-=entry.bytes;this.entries.delete(key);}
 set(key:string,value:T,ttl:number){
  this.delete(key);
  let bytes:number;
  try{bytes=2*(key.length+(JSON.stringify(value)?.length||0));}catch{return;}
  if(bytes>this.maxEntryBytes||bytes>this.maxBytes)return;
  for(const [old,entry] of this.entries)if(entry.until<=Date.now())this.delete(old);
  while(this.entries.size>=this.maxEntries||this.used+bytes>this.maxBytes)this.delete(this.entries.keys().next().value!);
  this.entries.set(key,{value,bytes,until:Date.now()+ttl});this.used+=bytes;
 }
}
