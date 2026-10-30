import {PUBLIC_SOURCES,publicSourceEnabled} from './public-reading';
import {bridgeConfigured,novelBridgeSource} from './bridge';
import {serviceConfigured} from './reader-services';
import {normalizeTitle,type Work,type Chapter} from './model';

/** Discovery includes configured readers only; metadata and blocked adapters are
 * deliberately absent. Explicit source diagnostics remain available separately. */
export function readingSources(kind:'novel'|'manga'):string[]{
 const direct=Object.entries(PUBLIC_SOURCES).filter(([id,s])=>s.kind===kind&&publicSourceEnabled(id as keyof typeof PUBLIC_SOURCES)).map(([id])=>id);
 if(kind==='manga')return ['mangadex',...direct,...(['suwayomi','maki'] as const).filter(serviceConfigured)];
 return [...direct,...(bridgeConfigured()?['bridge',...['wenku8','bilinovel','esj','masiro'].filter(s=>!!novelBridgeSource(s))]:[])];
}

export type ReadingCandidate={work:Work;chapterCount:number;firstChapter:Chapter};
type Reader={id:string;search:(query:string)=>Promise<{items:Work[]}>;chapters:(id:string)=>Promise<{items:Chapter[];total:number}>};
/** Same-title matches are choices, never silent associations or body guarantees.
 * A catalog must contain an unlocked in-app chapter before a choice is offered. */
export async function findReadingCandidates(metadata:Work,readers:Reader[]){
 const aliases=[...new Set([metadata.title,metadata.originalTitle].map(s=>s.trim()).filter(s=>s.length>0&&s.length<=100))];
 const names=new Set(aliases.map(normalizeTitle));
 const results=await Promise.all(readers.map(async reader=>{
  try{
   const found=new Map<string,Work>();
   for(const query of aliases.slice(0,2)){
    const data=await reader.search(query);
    for(const w of data.items)if(w.kind===metadata.kind&&w.readable&&[w.title,w.originalTitle].some(t=>names.has(normalizeTitle(t))))found.set(w.id,w);
    if(found.size)break;
   }
   const items:ReadingCandidate[]=[];
   for(const w of [...found.values()].slice(0,3)){
    const d=await reader.chapters(w.sourceId),first=d.items.find(c=>!c.locked&&!c.externalUrl);
    if(first)items.push({work:w,chapterCount:d.total,firstChapter:first});
   }
   return {items,status:{source:reader.id,ok:true,message:items.length?'已找到同名作品目录':'未找到同名可读目录'}};
  }catch{return {items:[],status:{source:reader.id,ok:false,message:'此来源暂未能完成目录核验'}};}
 }));
 return {items:results.flatMap(r=>r.items),statuses:results.map(r=>r.status),checkedSources:readers.map(r=>r.id)};
}
