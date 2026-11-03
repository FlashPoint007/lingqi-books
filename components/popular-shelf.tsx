'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowRight,BookOpen,Layers,RotateCw} from 'lucide-react';
import {catalogRequest} from '../lib/books/catalog-client';
import {normalizeTitle,type Catalog,type Work} from '../lib/books/model';

type Kind=Work['kind'];
export type RecommendationSource='bangumi'|'readable';
type CatalogFeed={kind:Kind;source:string;data:Catalog;busy:boolean;error:string};
type Result={key:string;data?:Catalog;error?:string};
const SOURCE_KEY='lq-popular-source';

function recommendations(works:Work[],kind:Kind,source:RecommendationSource){
 const groups=new Map<string,Work[]>();
 for(const work of works){
  if(work.kind!==kind||(source==='readable'&&!work.readable))continue;
  const group=groups.get(work.source)||[];
  group.push(work);
  groups.set(work.source,group);
 }
 const selected:Work[]=[],seen=new Set<string>();
 const buckets=[...groups.values()];
 for(let row=0;buckets.some(bucket=>row<bucket.length)&&selected.length<6;row++){
  for(const bucket of buckets){
   const work=bucket[row];
   if(!work)continue;
   const title=normalizeTitle(work.originalTitle||work.title);
   const identity=title?title+'|'+(kind==='novel'?normalizeTitle(work.author):''):work.id;
   if(seen.has(identity))continue;
   seen.add(identity);
   selected.push(work);
   if(selected.length===6)break;
  }
 }
 return selected;
}

export function PopularShelf({feed,onOpen,onBrowse,onRetry,cover,sourceName}:{
 feed?:CatalogFeed;
 onOpen:(work:Work)=>void;
 onBrowse:(kind:Kind,source:RecommendationSource)=>void;
 onRetry:()=>void;
 cover:(work:Work)=>ReactNode;
 sourceName:(work:Work)=>string;
}){
 const [kind,setKind]=useState<Kind>('novel');
 const [preference,setPreference]=useState<RecommendationSource|null>(null);
 const [result,setResult]=useState<Result>();
 const [attempt,setAttempt]=useState(0);
 const cache=useRef(new Map<string,{data:Catalog;until:number}>());
 const source=preference||'bangumi';
 const key=kind+':'+source;
 const shared=feed?.kind===kind&&feed.source===source;
 useEffect(()=>{
  let saved:string|null=null;
  try{saved=localStorage.getItem(SOURCE_KEY);}catch{}
  setPreference(saved==='readable'?'readable':'bangumi');
 },[]);
 useEffect(()=>{
  if(!preference||shared)return;
  const hit=cache.current.get(key);
  if(hit&&hit.until>Date.now()){setResult({key,data:hit.data});return;}
  const controller=new AbortController();
  void catalogRequest({source,kind,sort:'popular',page:1},controller.signal,20000).then((data:Catalog)=>{
   if(controller.signal.aborted)return;
   if(data.items.length)cache.current.set(key,{data,until:Date.now()+300000});
   setResult({key,data});
  }).catch(error=>{if(!controller.signal.aborted)setResult({key,error:error.message});});
  return()=>controller.abort();
 },[attempt,key,kind,preference,shared,source]);
 const data=shared?feed.data:result?.key===key?result.data:undefined;
 const error=shared?feed.error:result?.key===key?result.error:undefined;
 const loading=shared?feed.busy:!data&&!error;
 const items=data?recommendations(data.items,kind,source):[];
 const failure=data?.statuses.find(status=>!status.ok);
 const changeSource=(value:RecommendationSource)=>{
  setPreference(value);
  try{localStorage.setItem(SOURCE_KEY,value);}catch{}
 };
 function retry(){
  if(shared){onRetry();return;}
  cache.current.delete(key);
  setResult(undefined);
  setAttempt(value=>value+1);
 }
 return <section id="popular" className="popular-shelf" aria-labelledby="popular-heading" aria-busy={loading}>
  <div className="popular-header">
   <div><div className="eyebrow">READER FAVORITES</div><h2 id="popular-heading">热门推荐<span className="small-dot">✦</span></h2></div>
   <label className="popular-source"><span>推荐来源</span><select aria-label="推荐来源" value={source} onChange={event=>changeSource(event.target.value as RecommendationSource)}>
    <option value="bangumi">Bangumi 热门</option><option value="readable">站内可读</option>
   </select></label>
  </div>
  <div className="popular-controls">
   <div className="popular-tabs" role="group" aria-label="推荐分类">
    <button aria-pressed={kind==='novel'} onClick={()=>setKind('novel')}><BookOpen size={15}/>轻小说</button>
    <button aria-pressed={kind==='manga'} onClick={()=>setKind('manga')}><Layers size={15}/>漫画</button>
   </div>
   <button className="text-button" onClick={()=>onBrowse(kind,source)}>查看更多 <ArrowRight size={15}/></button>
  </div>
  <p className="popular-note">{source==='bangumi'?'按 Bangumi 收藏热度排序。点开作品可查询本站的可读版本。':'从已启用的阅读源交错推荐。章节和版本以作品详情为准。'}</p>
  {loading?<div className="popular-rail" role="status" aria-label="正在加载推荐">{Array.from({length:6},(_,i)=><div key={i} className="skeleton-card" aria-hidden="true"><div/><p/><small/></div>)}</div>:
   items.length?<><ol className="popular-rail">{items.map((work,index)=><li key={work.id}>
    <button className="popular-card" onClick={()=>onOpen(work)} aria-label={'查看 '+work.title+' 推荐详情'}>
     <div className="popular-art">{cover(work)}<span className="popular-rank">{String(index+1).padStart(2,'0')}</span>
      {work.score!==undefined&&<span className="popular-score">★ {work.score.toFixed(1)}</span>}
     </div>
     <strong title={work.title}>{work.title}</strong>
     <small>{source==='bangumi'?'Bangumi · 作品资料':sourceName(work)}</small>
    </button>
   </li>)}</ol>{failure&&<p className="popular-note">部分阅读源暂时不可用，已展示成功返回的推荐。</p>}</>:
   <div className="popular-empty" role="status"><p>{error||failure?.message||'这组推荐暂时没有作品，可以切换来源。'}</p>
    <button className="outline-button" onClick={retry}><RotateCw size={14}/>重新加载</button>
   </div>}
 </section>;
}
