'use client';
import {imageRetryUrl} from '../lib/books/image-retry';
import {catalogRequest as api} from '../lib/books/catalog-client';
import {ReadingFrame,type DirectoryEntry} from '../components/reading-frame';
import {ReadingSourcePicker} from '../components/reading-source-picker';
import {correspondingChapter,preferredSources,preferredWork,rememberSource,type PreferredSources} from '../lib/books/source-selection';
import {DEFAULT_READING_PREFERENCES,READING_FONTS,readingPreferences,type ReadingPosition} from '../lib/books/reading-preferences';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,Search,Library,Compass,ArrowUpRight,ArrowRight,Plus,X,ChevronLeft,ChevronRight,SlidersHorizontal,Upload,Check,Sun,Moon,Heart,RotateCw,Layers,Bookmark,ExternalLink,Menu,Download} from 'lucide-react';
import {NovelIllustration} from '../components/novel-illustration';
import type {Work,Chapter,Catalog,ContentBlock} from '../lib/books/model';
import {splitText} from '../lib/books/model';
import type {ReadingCandidate} from '../lib/books/reading-discovery';
import {saveBook,getBook,type LocalBook} from '../lib/books/local';
const sourceNames:Record<string,string>={bangumi:'Bangumi',mangadex:'MangaDex',narou:'なろう',local:'本地书籍',bridge:'其他插件',wenku8:'轻小说文库',bilinovel:'哔哩轻小说·繁体',esj:'ESJ Zone',masiro:'真白萌',suwayomi:'Suwayomi',maki:'Maki',sfacg:'SF轻小说·中文原创',bh3:'崩坏3官方漫画',mangabz:'MangaBz 中文漫画',manhuagui:'漫画柜·中文日漫',lnovel:'轻小说百科·繁体日轻',n8novel:'无限轻小说·日轻繁中',komiic:'Komiic·繁中漫画',linovel:'轻之文库·中文原创',kakuyomu:'Kakuyomu·日文原文',dm5:'动漫屋·中文日漫'};
const onlineSources=['kakuyomu','linovel','dm5','n8novel','komiic','manhuagui','lnovel','mangabz','sfacg','bh3','bridge','wenku8','bilinovel','esj','masiro','suwayomi','maki'];
const novelSources=['kakuyomu','linovel','n8novel','lnovel','sfacg','wenku8','bilinovel','esj','masiro','bridge'];
const genreLabels=['全部','奇幻','恋爱','校园','冒险','悬疑','日常','科幻'];
const emptyCatalog:Catalog={items:[],total:0,statuses:[]};
type Progress={chapter:number;page:number;label:string;time:number;mangaChapter?:Chapter;position?:ReadingPosition};
function Cover(props:{work:Work;big?:boolean}){return <WorkCover key={props.work.cover} {...props}/>;}
function WorkCover({work,big=false}:{work:Work;big?:boolean}){const [bad,setBad]=useState(false),[attempt,setAttempt]=useState(0);return <div className={'cover '+(big?'cover-big':'')}>{work.cover&&!bad?<img src={imageRetryUrl(work.cover,attempt)} alt={work.title+' 封面'} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBad(true)}/>:<div className="paper-cover"><BookOpen size={30}/><strong>{work.title}</strong><small>{sourceNames[work.source]}</small>{big&&work.cover&&<button className="text-button" onClick={()=>{setBad(false);setAttempt(v=>v+1);}}><RotateCw size={14}/>重新加载封面</button>}</div>}</div>;}
function MangaImage(props:{src:string;fallbackSrc?:string;index:number}){return <MangaPage key={props.src+'|'+(props.fallbackSrc||'')} {...props}/>;}
function MangaPage({src,fallbackSrc,index}:{src:string;fallbackSrc?:string;index:number}){const [bad,setBad]=useState(false),[key,setKey]=useState(0),[fallback,setFallback]=useState(false);return bad?<button className="image-error" onClick={()=>{setBad(false);setFallback(false);setKey(x=>x+1);}}><RotateCw/>第 {index+1} 页加载失败，点击重试</button>:<img key={key} src={imageRetryUrl(fallback&&fallbackSrc?fallbackSrc:src,key)} alt={`漫画第 ${index+1} 页`} width={850} height={1200} decoding="async" loading={index<2?'eager':'lazy'} referrerPolicy="no-referrer" onError={()=>{if(!fallback&&fallbackSrc)setFallback(true);else setBad(true);}}/>;}
export default function Home(){
 const [view,setView]=useState('discover'),[kind,setKind]=useState<'novel'|'manga'>('novel'),[source,setSource]=useState('readable'),[genre,setGenre]=useState('全部'),[sort,setSort]=useState('popular'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
 const [catalogResponse,setCatalogResponse]=useState<{key:string;data:Catalog}>({key:'',data:emptyCatalog}),[requestBusy,setBusy]=useState(true),[error,setError]=useState(''),[shelf,setShelf]=useState<Work[]>([]),[progress,setProgress]=useState<Record<string,Progress>>({}),[ready,setReady]=useState(false),[toast,setToast]=useState('');
 const catalogKey=JSON.stringify([kind,source,search,page,sort,genre,refresh]);
 const catalog=catalogResponse.key===catalogKey?catalogResponse.data:emptyCatalog;
 const busy=requestBusy||catalogResponse.key!==catalogKey;
 const [detail,setDetail]=useState<Work|null>(null),[chapters,setChapters]=useState<Chapter[]>([]),[chapterPage,setChapterPage]=useState(1),[chapterTotal,setChapterTotal]=useState(0),[chapterBusy,setChapterBusy]=useState(false),[chapterError,setChapterError]=useState(''),[matches,setMatches]=useState<Work[]>([]),[matchBusy,setMatchBusy]=useState(false),[matched,setMatched]=useState<Work|null>(null);
 const [detailAnchor,setDetailAnchor]=useState<Work|null>(null),[sourcePreferences,setSourcePreferences]=useState<PreferredSources>({});
 const [readerSourceOpen,setReaderSourceOpen]=useState(false),[sourceSwitchError,setSourceSwitchError]=useState(''),[sourceSwitchNotice,setSourceSwitchNotice]=useState('');
 const [reader,setReader]=useState<{work:Work;chapter?:Chapter;local?:LocalBook;online?:boolean}|null>(null),[reading,setReading]=useState(false),[readerError,setReaderError]=useState(''),[images,setImages]=useState<string[]>([]),[imagesChapterId,setImagesChapterId]=useState(''),[fallbackImages,setFallbackImages]=useState<string[]>([]),[imagePage,setImagePage]=useState(0),[localChapter,setLocalChapter]=useState(0),[groups,setGroups]=useState<{name:string;url:string}[]>([]),[external,setExternal]=useState('');
 const [readerPreferences,setReaderPreferences]=useState(DEFAULT_READING_PREFERENCES);const {fontSize,theme,layout}=readerPreferences;
 const [readerDirectory,setReaderDirectory]=useState<{workId:string;items:Chapter[];busy:boolean;error:string}>({workId:'',items:[],busy:false,error:''});const directoryCache=useRef(new Map<string,Chapter[]>()),progressRef=useRef(progress);progressRef.current=progress;
 const readerPositionKey=reader?(reader.work.id+':'+(reader.local?(reader.local.chapters[localChapter] as any)?.remoteId||localChapter:reader.chapter?.id)+(reader.chapter&&layout==='page'?':page:'+imagePage:'')):'';
 const [pasteOpen,setPasteOpen]=useState(false),[pasteTitle,setPasteTitle]=useState(''),[pasteContent,setPasteContent]=useState('');
 const [onlineBlocks,setOnlineBlocks]=useState<ContentBlock[]>([]),[onlineChapterId,setOnlineChapterId]=useState(''),[testingSource,setTestingSource]=useState('');
 const sourceTests=useRef<Record<string,{ok:boolean;message:string;hint?:string;retryable?:boolean;checkedAt:string}>>({});
 const sourceObservation=(s:any)=>sourceTests.current[s.id]||s.observation;
 const chapterCache=useRef(new Map<string,any>()),readingToken=useRef(0),openingAbort=useRef<AbortController|null>(null);const [openingWork,setOpeningWork]=useState('');
 const [onlineCredit,setOnlineCredit]=useState<{sourceUrl:string;attribution:string;rightsUrl:string;notice?:string}|null>(null),[bridgeState,setBridgeState]=useState<any>(null);
 const [sources,setSources]=useState<any[]>([]),[shelfFilter,setShelfFilter]=useState('all');const fileRef=useRef<HTMLInputElement>(null),modalRef=useRef<HTMLDialogElement>(null);const matchRequest=useRef(0);
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem('lq-shelf')||'[]'),p=JSON.parse(localStorage.getItem('lq-progress')||'{}');if(Array.isArray(s))setShelf(s.filter(w=>w&&typeof w.id==='string'&&typeof w.title==='string'));if(p&&typeof p==='object')setProgress(p);const prefs=JSON.parse(localStorage.getItem('lq-reader-prefs')||'{}');setReaderPreferences(readingPreferences(prefs));setSourcePreferences(preferredSources(JSON.parse(localStorage.getItem('lq-reading-sources')||'{}')));}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem('lq-shelf',JSON.stringify(shelf));localStorage.setItem('lq-progress',JSON.stringify(progress));}catch{setToast('浏览器存储空间不足，书架暂时无法保存');}},[shelf,progress,ready]);
 useEffect(()=>{if(ready)try{localStorage.setItem('lq-reader-prefs',JSON.stringify(readerPreferences));}catch{}},[ready,readerPreferences]);
 useEffect(()=>{if(ready)try{localStorage.setItem('lq-reading-sources',JSON.stringify(sourcePreferences));}catch{}},[ready,sourcePreferences]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);},[toast]);
 useEffect(()=>{api({action:'status'}).then(d=>setSources(d.sources)).catch(()=>{});},[]);
 useEffect(()=>{if(view==='sources'){api({action:'bridge-status'}).then(setBridgeState).catch(()=>setBridgeState({connected:false,message:'连接检查失败'}));api({action:'status'}).then(d=>setSources(d.sources)).catch(e=>setError(e.message));}},[view]);
 useEffect(()=>{if(view!=='discover')return;const c=new AbortController();setBusy(true);setError('');api({source,kind,q:search,page,sort,tag:source==='bangumi'&&genre!=='全部'?genre:''},c.signal).then(d=>{if(!c.signal.aborted)setCatalogResponse({key:catalogKey,data:d});}).catch(e=>{if(!c.signal.aborted){setError(e.message);setCatalogResponse({key:catalogKey,data:emptyCatalog});}}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[view,kind,source,search,page,sort,genre,refresh]);
 useEffect(()=>{if(detail&&!modalRef.current?.open)modalRef.current?.showModal();if(!detail)modalRef.current?.close();},[detail]);
 useEffect(()=>{if(!detail||!['mangadex',...onlineSources].includes(detail.source))return;const c=new AbortController();setChapterBusy(true);setChapterError('');api({action:'chapters',source:detail.source,id:detail.sourceId,page:chapterPage},c.signal).then(d=>{if(!c.signal.aborted){setChapters(d.items);setChapterTotal(d.total);}}).catch(e=>{if(!c.signal.aborted)setChapterError(e.message);}).finally(()=>{if(!c.signal.aborted)setChapterBusy(false);});return()=>c.abort();},[detail?.source,detail?.sourceId,chapterPage,refresh]);
 useEffect(()=>{if(!reader?.chapter||reader.online)return;setOnlineCredit(null);const c=new AbortController();setReading(true);setReaderError('');setImagesChapterId('');setImages([]);setExternal('');setGroups(reader.chapter.groups);Promise.resolve(chapterCache.current.get(reader.work.id+':'+reader.chapter.id)||api({action:reader.work.source==='mangadex'?'pages':'content',source:reader.work.source,id:reader.chapter.id,workId:reader.work.sourceId},c.signal)).then(d=>{if(c.signal.aborted)return;setImagesChapterId(reader.chapter!.id);setImagePage(x=>Math.min(x,Math.max(0,(d.images?.length||1)-1)));setImages(reader.work.source==='mangadex'?d.images.map((_:string,index:number)=>'/api/reader-image?'+new URLSearchParams({source:'mangadex',id:reader.chapter!.id,index:String(index)})):d.images);if(d.externalUrl)throw new Error('此章节没有站内图片，请选择其他章节');if(!d.images?.length)throw new Error('此章节暂无可读图片');if(reader.work.source!=='mangadex')setOnlineCredit(d);setFallbackImages(d.fallbackImages||[]);setGroups(d.groups?.length?d.groups:reader.chapter!.groups);setExternal(d.externalUrl||'');}).catch(e=>{if(!c.signal.aborted)setReaderError(e.message);}).finally(()=>{if(!c.signal.aborted)setReading(false);});return()=>c.abort();},[reader,refresh]);
 useEffect(()=>{if(!reader?.online||!reader.local)return;const c=new AbortController(),chapter=reader.local.chapters[localChapter];if(!chapter)return;const remoteId=(chapter as any).remoteId;const cacheKey=reader.work.id+':'+remoteId;setOnlineCredit(null);setReaderError('');setOnlineChapterId('');setReading(true);const fetchChapter=async(id:string)=>api({action:'content',source:reader.work.source,id,workId:reader.work.sourceId},c.signal);const run=async()=>{try{const d=chapterCache.current.get(cacheKey)||await fetchChapter(remoteId);const blocks:ContentBlock[]=d.blocks||[{type:'text',text:d.text||''}];if(!blocks.length||!blocks.some(b=>b.type==='image'||b.text.trim()))throw new Error('本章没有可读图文');if(c.signal.aborted)return;setOnlineBlocks(blocks);setOnlineText(d.text||'');setOnlineCredit(d);setOnlineChapterId(remoteId);if(chapterCache.current.size>=12)chapterCache.current.delete(chapterCache.current.keys().next().value!);chapterCache.current.set(cacheKey,d);const nextChapter=reader.local!.chapters[localChapter+1] as any;const next=nextChapter?.locked?undefined:nextChapter?.remoteId;if(next&&!chapterCache.current.has(reader.work.id+':'+next))void fetchChapter(next).then(v=>{if(!c.signal.aborted)chapterCache.current.set(reader.work.id+':'+next,v);}).catch(()=>{});}catch(e){if(!c.signal.aborted)setReaderError(e instanceof Error?e.message:'正文读取失败');}finally{if(!c.signal.aborted)setReading(false);}};void run();return()=>c.abort();},[reader,localChapter,refresh]);
 const [onlineText,setOnlineText]=useState('');
 useEffect(()=>{if(!reader)return;document.body.style.overflow='hidden';return()=>{document.body.style.overflow='';};},[reader]);
 useEffect(()=>{if(reader?.local||reader?.chapter){const w=reader.work;setProgress(p=>({...p,[w.id]:{chapter:reader.local?localChapter:0,page:imagePage,label:reader.local?reader.local.chapters[localChapter]?.title:reader.chapter!.title,time:Date.now(),mangaChapter:reader.chapter,position:p[w.id]?.position?.key===readerPositionKey?p[w.id].position:undefined}}));}},[reader,localChapter,imagePage,readerPositionKey]);
 useEffect(()=>{
  if(!reader?.chapter)return;
  const work=reader.work,controller=new AbortController();
  setReaderDirectory({workId:work.id,items:[],busy:true,error:''});
  void loadWorkDirectory(work,controller.signal).then(items=>{
   if(!controller.signal.aborted)setReaderDirectory({workId:work.id,items,busy:false,error:''});
  }).catch(error=>{
   if(!controller.signal.aborted)setReaderDirectory({workId:work.id,items:[],busy:false,error:error instanceof Error?error.message:'目录加载失败'});
  });
  return()=>controller.abort();
 },[reader?.work.id,!!reader?.chapter,refresh]);
 function savePosition(position:ReadingPosition){if(!reader||position.key!==readerPositionKey)return;const w=reader.work,next={...progressRef.current,[w.id]:{chapter:reader.local?localChapter:0,page:imagePage,label:reader.local?reader.local.chapters[localChapter]?.title:reader.chapter!.title,time:Date.now(),mangaChapter:reader.chapter,position}};progressRef.current=next;try{localStorage.setItem('lq-progress',JSON.stringify(next));}catch{}setProgress(next);}

 function chooseKind(k:'novel'|'manga'){setKind(k);setSource('readable');setPage(1);setGenre('全部');setView('discover');}
 function closeDetail(){cancelOpening();setDetail(null);}
 function selectedWork(original:Work){
  const selected=preferredWork(original,sourcePreferences);
  return sources.length&&!sources.some(source=>source.id===selected.source&&source.readingEnabled)?original:selected;
 }
 function openDetail(original:Work,anchor=original,usePreferred=true){
  cancelOpening();
  const work=usePreferred?selectedWork(original):original;
  setDetailAnchor(anchor);
  setSourceSwitchNotice('');
  setChapterBusy(work.readable&&work.source!=='local');
  setChapterError('');
  setChapters([]);
  setChapterTotal(0);
  setChapterPage(1);
  setMatches([]);
  setMatched(null);
  matchRequest.current++;
  setMatchBusy(false);
  setDetail(work);
  if(['mangadex',...onlineSources].includes(work.source)&&work.source!=='bridge'){
   void api({action:'detail',source:work.source,id:work.sourceId})
    .then(next=>setDetail(current=>current?.id===work.id?next:current)).catch(()=>{});
  }
 }
 function selectDetailSource(candidate:ReadingCandidate){
  if(!detail)return;
  const anchor=detailAnchor||detail, target=candidate.work;
  setSourcePreferences(previous=>rememberSource(rememberSource(previous,detail,target),anchor,target));
  openDetail(target,anchor,false);
  setSourceSwitchNotice('已切换到所选阅读源，之后打开本作品时会优先使用。');
 }
 function add(w:Work){setShelf(s=>s.some(x=>x.id===w.id)?s.filter(x=>x.id!==w.id):[w,...s]);setToast(shelf.some(x=>x.id===w.id)?'已移出书架':'已加入书架');}
 async function importText(file?:File){if(!file)return;if(file.size>15*1024*1024){setToast('请选择 15 MB 以内的 TXT 文件');return;}try{const buf=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(buf);if(text.includes('\uFFFD'))text=new TextDecoder('gb18030').decode(buf);if(!text.trim())throw new Error('文件内容为空');const id=crypto.randomUUID(),title=file.name.replace(/\.txt$/i,'');const book={id,title,chapters:splitText(text)};await saveBook(book);const w:Work={id:'local:'+id,source:'local',sourceId:id,title,originalTitle:title,kind:'novel',cover:'',summary:`本地导入 · ${book.chapters.length} 个章节 · 文件仅保存在此浏览器`,author:'本地书籍',tags:['TXT'],url:'',language:'本地文本',readable:true};setShelf(s=>[w,...s]);setView('shelf');setToast('导入成功，点击书籍开始阅读');}catch(e){setToast(e instanceof Error?e.message:'导入失败');}if(fileRef.current)fileRef.current.value='';}
 function resume(original:Work){const w=selectedWork(original);if(novelSources.includes(w.source)&&w.kind==='novel')void readOnline(w);else if(w.source==='local')void readLocal(w);else if(progress[w.id]?.mangaChapter)readManga(w,progress[w.id].mangaChapter!);else openDetail(w,original,false);}
 async function readLocal(w:Work){cancelOpening();const token=++readingToken.current;try{const b=await getBook(w.sourceId);if(token!==readingToken.current)return;if(!b)throw new Error('本地文件不存在，请重新导入');setDetail(null);setLocalChapter(Math.min(progress[w.id]?.chapter||0,b.chapters.length-1));setImagePage(0);setReader({work:w,local:b});}catch(e){setToast(e instanceof Error?e.message:'读取失败');}}
 async function loadWorkDirectory(work:Work,signal:AbortSignal){
  const hit=directoryCache.current.get(work.id);
  if(hit)return hit;
  const chapters=new Map<string,Chapter>();
  let total=1,received=0;
  for(let page=1;received<total&&page<=100;page++){
   const data=await api({action:'chapters',source:work.source,id:work.sourceId,page},signal);
   if(!data.items?.length&&received<data.total)throw new Error('来源目录未完整返回');
   for(const chapter of data.items as Chapter[])chapters.set(chapter.id,chapter);
   total=data.total;
   received+=data.items.length;
  }
  if(received<total)throw new Error('目录超过当前加载上限，暂时无法完整读取');
  const list=[...chapters.values()];
  if(list.length&&!signal.aborted){
   if(directoryCache.current.size>=6)directoryCache.current.delete(directoryCache.current.keys().next().value!);
   directoryCache.current.set(work.id,list);
  }
  return list;
 }
 async function readOnline(w:Work,start=progress[w.id]?.chapter||0){
  openingAbort.current?.abort();
  const c=new AbortController();
  openingAbort.current=c;
  const token=++readingToken.current;
  setOpeningWork(w.title);
  try{
   const list=await loadWorkDirectory(w,c.signal);
   if(!list.length)throw new Error('暂无可读章节');
   start=Math.max(0,Math.min(start,list.length-1));
   if(list[start].locked||list[start].externalUrl)start=list.findIndex(chapter=>!chapter.locked&&!chapter.externalUrl);
   if(start<0)throw new Error('此作品暂无公开章节');
   if(token!==readingToken.current||c.signal.aborted)return;
   setDetail(null);
   setLocalChapter(start);
   setOnlineText('');
   setOnlineBlocks([]);
   setOnlineCredit(null);
   setReaderSourceOpen(false);
   setReader({work:w,online:true,local:{id:w.sourceId,title:w.title,chapters:list.map(chapter=>{
    const locked=!!(chapter.locked||chapter.externalUrl);
    return {title:chapter.title+(locked?' · 暂不可读':''),text:'',remoteId:chapter.id,locked};
   })}});
   setShelf(s=>s.some(x=>x.id===w.id)?s:[w,...s]);
  }catch(error){
   if(token===readingToken.current&&!c.signal.aborted)setToast(error instanceof Error?error.message:'在线目录读取失败');
  }finally{
   if(token===readingToken.current){setOpeningWork('');openingAbort.current=null;}
  }
 }
 async function switchReaderSource({work}:ReadingCandidate){
  if(!reader||openingAbort.current)return;
  const origin=reader.work, title=reader.local?.chapters[localChapter]?.title||reader.chapter?.title||'';
  const controller=new AbortController();
  openingAbort.current=controller;
  const token=++readingToken.current;
  setSourceSwitchError('');
  setOpeningWork(work.title);
  try{
   const list=await loadWorkDirectory(work,controller.signal);
   const stillOpening=()=>token===readingToken.current&&!controller.signal.aborted;
   if(!stillOpening())return;
   if(!list.some(chapter=>!chapter.locked&&!chapter.externalUrl))throw new Error('此来源暂时没有可读章节');
   const matching=correspondingChapter(title,list,work.kind);
   const saved=progressRef.current[work.id];
   const savedIndex=list.findIndex(chapter=>!chapter.locked&&!chapter.externalUrl&&(
    work.kind==='manga'?chapter.id===saved?.mangaChapter?.id:
    saved?.position?.key===work.id+':'+chapter.id
   ));
   const resumeIndex=savedIndex<0&&saved?.label&&work.kind==='novel'
    ?correspondingChapter(saved.label,list,work.kind):savedIndex;
   const next=matching>=0?matching:resumeIndex;
   if(next<0){
    setSourcePreferences(previous=>rememberSource(previous,origin,work));
    setReader(null);
    setReaderSourceOpen(false);
    openDetail(work,origin,false);
    setSourceSwitchNotice('各源章节编排不同，请从所选来源的目录挑选章节。原有阅读进度已保存。');
    return;
   }
   const chapter=list[next],key=work.id+':'+chapter.id;
   const data=chapterCache.current.get(key)||await api({
    action:work.source==='mangadex'?'pages':'content',source:work.source,id:chapter.id,workId:work.sourceId,
   },controller.signal);
   if(!stillOpening())return;
   const hasContent=work.kind==='manga'?data.images?.length:!!data.text?.trim()
    ||data.blocks?.some((block:ContentBlock)=>block.type==='image'||block.text.trim());
   if(data.externalUrl||!hasContent)throw new Error('所选来源的章节暂时无法在站内阅读');
   if(chapterCache.current.size>=12)chapterCache.current.delete(chapterCache.current.keys().next().value!);
   chapterCache.current.set(key,data);
   setSourcePreferences(previous=>rememberSource(previous,origin,work));
   setReaderSourceOpen(false);
   if(work.kind==='manga')readManga(work,chapter);
   else await readOnline(work,next);
   setToast(matching>=0?'已切换到对应章节':'已继续此来源的上次进度');
  }catch(error){
   if(token===readingToken.current&&!controller.signal.aborted){
    setSourceSwitchError(error instanceof Error?error.message:'换源失败，请稍后重试');
   }
  }finally{
   if(token===readingToken.current){setOpeningWork('');openingAbort.current=null;}
  }
 }
 function cancelOpening(){readingToken.current++;openingAbort.current?.abort();openingAbort.current=null;setOpeningWork('');}

 function readManga(w:Work,c:Chapter){cancelOpening();if(c.locked){setToast('章节需要来源阅读权限');return;}if(c.externalUrl){setToast('此章节没有站内图片，请选择其他章节');return;}setReaderSourceOpen(false);setDetail(null);setImagePage(progress[w.id]?.mangaChapter?.id===c.id?progress[w.id].page:0);setReader({work:w,chapter:c});setShelf(s=>s.some(x=>x.id===w.id)?s:[w,...s]);}
 function browseReadable(k:'novel'|'manga'){closeDetail();setKind(k);setSource('readable');setSearch('');setQuery('');setPage(1);setView('discover');}
 function startDetail(){if(!detail)return;if(detail.source==='local'){void readLocal(detail);return;}if(!detail.readable){modalRef.current?.querySelector('.reading-source-picker')?.scrollIntoView({behavior:'smooth',block:'start'});return;}const first=chapters.findIndex(c=>!c.locked&&!c.externalUrl);if(first<0)return;if(detail.kind==='novel'){void readOnline(detail,progress[detail.id]?.chapter??((chapterPage-1)*100+first));return;}const saved=progress[detail.id]?.mangaChapter;readManga(detail,saved&&chapters.some(c=>c.id===saved.id&&!c.locked&&!c.externalUrl)?saved:chapters[first]);}
 async function testSource(id:string,k:string){setTestingSource(id);try{const d=await api({action:['n8novel','komiic','kakuyomu','linovel','dm5'].includes(id)?'verify-reading':'test',source:id,kind:k,page:1});const status=d.statuses?.[0];setToast(status?.ok?status.message||`连接正常，读取到 ${d.items.length} 部作品`:status?.message||'检测失败');const observation={ok:!!status?.ok,message:status?.message||'检测未返回结果',hint:status?.hint,retryable:status?.retryable,checkedAt:new Date().toISOString()};sourceTests.current[id]=observation;setSources(current=>current.map(s=>s.id===id?{...s,observation}:s));}catch(e){const message=e instanceof Error?e.message:'检测失败';setToast(message);const observation={ok:false,message,checkedAt:new Date().toISOString()};sourceTests.current[id]=observation;setSources(current=>current.map(s=>s.id===id?{...s,observation}:s));}finally{setTestingSource('');}}
 function adjacentManga(direction:number){if(!reader?.chapter||readerDirectory.workId!==reader.work.id)return;const all=readerDirectory.items,at=all.findIndex(c=>c.id===reader.chapter!.id),next=all[at+direction];if(at<0||!next){setToast(direction<0?'已经是第一章':'没有下一章');return;}readManga(reader.work,next);}

 async function match(){if(!detail)return;const request=++matchRequest.current;setMatchBusy(true);setMatches([]);try{const d=await api({source:'bangumi',kind:detail.kind,q:detail.title,page:1});if(request===matchRequest.current){setMatches(d.items.slice(0,5));if(!d.items.length)setToast(d.statuses?.find((s:any)=>!s.ok)?.message||'暂无匹配候选，可尝试日文原名搜索');}}catch(e){if(request===matchRequest.current)setToast('匹配失败，请稍后重试');}finally{if(request===matchRequest.current)setMatchBusy(false);}}
 function exportShelf(){const blob=new Blob([JSON.stringify({version:1,shelf,progress},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lingqi-books-shelf.json';a.click();URL.revokeObjectURL(url);setToast('已导出书架与进度（不含本地正文）');}
 const items=view==='shelf'?shelf.filter(w=>shelfFilter==='all'||(shelfFilter==='reading'?progress[w.id]:w.kind===shelfFilter)):catalog.items;
 const readableChoices=sources.filter(s=>s.readingEnabled&&s.kind===kind);const detailCanRead=!!detail?.readable&&(detail.source==='local'||(!chapterBusy&&!chapterError&&chapters.some(c=>!c.locked&&!c.externalUrl)));const hero=catalog.items.slice(0,3);const shelfIds=new Set(shelf.map(w=>w.id));const activeProgress=shelf.filter(w=>progress[w.id]).sort((a,b)=>(progress[b.id]?.time||0)-(progress[a.id]?.time||0));
 const readerEntries:DirectoryEntry[]=reader?.local?reader.local.chapters.map((c,i)=>({id:String(i),title:c.title,locked:!!(c as any).locked})):readerDirectory.workId===reader?.work.id?readerDirectory.items.map(c=>({id:c.id,title:c.title,locked:c.locked,external:!!c.externalUrl})):[];
 const activeReaderId=reader?.local?String(localChapter):reader?.chapter?.id||'',readerIndex=readerEntries.findIndex(c=>c.id===activeReaderId);
 const readerReady=!!reader&&(reader.online?!reading&&!readerError&&onlineChapterId===(reader.local?.chapters[localChapter] as any)?.remoteId:reader.local?true:!reading&&!readerError&&imagesChapterId===reader.chapter?.id);
 function selectReaderChapter(id:string){if(!reader)return;if(reader.local)setLocalChapter(Number(id));else {const c=readerDirectory.items.find(c=>c.id===id);if(c)readManga(reader.work,c);}}
 return <div className="app-shell">
 <input type="file" accept=".txt,text/plain" ref={fileRef} hidden onChange={e=>importText(e.target.files?.[0])}/>
 <aside className="sidebar"><a href="/" className="brand"><span className="brand-symbol"><BookOpen size={23}/></span><span>零柒书境<small>LINGQI BOOKS</small></span></a><div className="side-label">你的阅读空间</div><nav><button className={view==='discover'?'active':''} onClick={()=>setView('discover')}><Compass/>发现好故事<span>01</span></button><button className={view==='shelf'?'active':''} onClick={()=>setView('shelf')}><Library/>我的书架<span>{shelf.length.toString().padStart(2,'0')}</span></button><button className={view==='sources'?'active':''} onClick={()=>setView('sources')}><Layers/>内容来源<ArrowUpRight size={14}/></button></nav><div className="sidebar-note"><div className="tiny-line"/><p>故事的下一页，<br/>总有新的风景。</p><small>ONE MORE CHAPTER.</small></div><button className="side-import" onClick={()=>fileRef.current?.click()}><Upload size={16}/> 导入本地 TXT</button><div className="local-note"><span/>私人书架 · 保存在此浏览器</div></aside>
 <main className="main"><header className="topbar"><div className="crumb">书页之间 <span>/</span> {view==='discover'?'发现':view==='shelf'?'书架':'来源'}</div><form className="search" onSubmit={e=>{e.preventDefault();setSearch(query.trim());setPage(1);setView('discover');}}><Search size={17}/><input aria-label="搜索作品" placeholder="搜索作品名、日文原名…" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit">搜索</button></form><button className="top-book" aria-label="打开我的书架" onClick={()=>setView('shelf')}><Bookmark size={20}/></button></header>
 {view==='discover'&&<>
 {!search&&page===1&&<section className="hero"><div className="hero-copy"><div className="eyebrow"><span/> A LITTLE ESCAPE, A NEW WORLD</div><h1>把日常，<br/>留在书页之外。</h1><p>从一段文字，到一格画面。<br/>在这里，找到下一部舍不得放下的故事。</p><button onClick={()=>{document.getElementById('catalog')?.scrollIntoView({behavior:'smooth'});}}>翻开新的故事 <ArrowRight size={17}/></button><span className="hero-foot">日系轻小说 <i>·</i> 中文漫画 <i>·</i> 你的阅读时光</span></div><div className="hero-art" aria-hidden="true"><div className="orbit"/><div className="hero-seal">物語の<br/>つづき</div><div className="hero-books">{hero.length?hero.map((w,i)=><div key={w.id} className={'hero-book book-'+i}><Cover work={w}/></div>):[0,1,2].map(i=><div key={i} className={'hero-book book-'+i}><div className="art-book"><span>零柒文库</span><strong>{['此刻，出发','书页之外','未完的故事'][i]}</strong><BookOpen size={38}/></div></div>)}</div><span className="art-caption">THE STORY CONTINUES ↗</span></div></section>}
 <section id="catalog" className="catalog-section"><div className="section-title"><div><div className="eyebrow">EXPLORE THE SHELVES</div><h2>{search?`“${search}” 的搜索结果`:'总有一个故事，正合你意'}<span className="small-dot">✦</span></h2></div>{search&&<button className="text-button" onClick={()=>{setSearch('');setQuery('');setPage(1);}}>清除搜索 <X size={15}/></button>}</div>
 <div className="category-row"><div className="kind-tabs"><button onClick={()=>chooseKind('novel')} className={kind==='novel'?'selected':''}><BookOpen size={17}/>轻小说</button><button onClick={()=>chooseKind('manga')} className={kind==='manga'?'selected':''}><Layers size={17}/>漫画</button></div><div className="selects"><select aria-label="内容来源" value={source} onChange={e=>{setSource(e.target.value);setPage(1);setGenre('全部');}}><option value="readable">站内可读来源</option>{readableChoices.map(s=><option key={s.id} value={s.id}>{sourceNames[s.id]||s.name}</option>)}<option value="bangumi">Bangumi 作品资料（无正文）</option>{!['readable','bangumi',...readableChoices.map(s=>s.id)].includes(source)&&<option value={source}>{sourceNames[source]||source}（未通过阅读验证）</option>}</select><select aria-label="排序方式" value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="popular">{source==='bh3'?'官方篇章顺序':source==='sfacg'?'源站更新顺序':['readable','n8novel'].includes(source)?'来源推荐':'热度优先'}</option>{source==='bangumi'&&<option value="score">评分优先</option>}{source==='mangadex'&&<option value="updated">最近更新</option>}</select></div></div>
 <div className="reading-mode-tabs" role="group" aria-label="浏览范围"><button className={source!=='bangumi'?'chosen':''} onClick={()=>{setSource('readable');setPage(1);}}>站内阅读</button><button className={source==='bangumi'?'chosen':''} onClick={()=>{setSource('bangumi');setPage(1);}}>作品资料（无正文）</button></div>
 {kind==='novel'&&source!=='bangumi'&&sources.length>0&&!readableChoices.some(s=>s.id!=='sfacg')&&<div className="reading-coverage"><strong>中文日轻正文源尚未接通</strong><p>当前可在线阅读的是 SF 中文原创小说补充源。日本轻小说的评分与简介可在“作品资料”中查看，暂不代表本站已有正文。</p></div>}
 {source==='bangumi'&&<div className="genres">{genreLabels.map(t=><button key={t} className={genre===t?'chosen':''} onClick={()=>{setGenre(t);setPage(1);}}>{t}</button>)}</div>}
 <div className="catalog-hint"><span><span className="status-dot"/>{source==='readable'?'只检索已启用的站内阅读来源':source==='bangumi'?'资料模式 · 本页作品仅提供简介和评分，正文可用性另行核验':source==='mangadex'?'简体 / 繁体中文 · 日本原创 · 全年龄作品':source==='narou'?'日文作品资料，不提供中文译文':source==='lnovel'?'日轻繁体中文译文 · 分卷目录 · 站内图文阅读':source==='manhuagui'?'中文日漫 · 站内图片阅读 · 保留来源署名':source==='sfacg'?'中文原创轻小说补充 · 公开章节站内阅读 · VIP 锁定':source==='bh3'?'官方中文原创漫画 · 站内整章阅读':onlineSources.includes(source)?source==='dm5'?'站内漫画阅读 · 按作品名搜索 · 以实际目录和页图为准':'站内图文阅读 · 可输入作品数字 ID · 以实际目录和正文为准':'保留来源差异，匹配后再关联同一作品'}</span><small>{busy?'正在寻找好故事…':`当前 ${catalog.items.length} 部`}</small></div>
 {!busy&&error&&<div className="notice error">{error}<button onClick={()=>setRefresh(x=>x+1)}>重新加载</button></div>}
 {!busy&&catalog.statuses.filter(s=>!s.ok).map(s=><div className="notice" key={s.source}><div><strong>{sourceNames[s.source]}：{s.message}</strong>{s.hint&&<p>{s.hint}</p>}</div>{s.retryable!==false?<button onClick={()=>setRefresh(x=>x+1)}>重试</button>:<div className="notice-actions"><button onClick={()=>{setSource('readable');setPage(1);}}>切换到可读来源</button><button onClick={()=>setView('sources')}>查看连接状态</button></div>}</div>)}
 {busy?<div className="book-grid">{Array.from({length:6},(_,i)=><div key={i} className="skeleton-card"><div/><p/><small/></div>)}</div>:<><div className="book-grid">{items.map(w=><article className="book-card" key={w.id}><button className="book-cover-button" onClick={()=>openDetail(w)}><Cover work={w}/>{w.score&&<span className="rating">★ {w.score.toFixed(1)}</span>}<span className="cover-open">{w.readable?'查看可读章节':'查看作品资料'} <ArrowRight size={16}/></span></button><div className="book-meta"><span>{w.readable?'站内章节':'仅作品资料'}</span><span>{w.provider||sourceNames[w.source]}</span></div><button className="book-title" onClick={()=>openDetail(w)}>{w.title}</button><div className="book-bottom"><p>{w.author}</p><button aria-label={(shelfIds.has(w.id)?'移出书架 ':'收藏 ')+w.title} className={shelfIds.has(w.id)?'saved':''} onClick={()=>add(w)}>{shelfIds.has(w.id)?<Check size={16}/>:<Plus size={16}/>}</button></div></article>)}</div>{!items.length&&<div className="empty"><Search/><h3>{catalog.statuses.length>0&&catalog.statuses.every(s=>!s.ok)?'此来源暂时无法读取':'这一页还没有故事'}</h3><p>{catalog.statuses.length>0&&catalog.statuses.every(s=>!s.ok)?'请按上方提示检查连接，或切换可用来源。':'试试日文原名，或切换其他内容来源。'}</p></div>}<div className="pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/>上一页</button><span>第 {page} 页</span><button disabled={page>=100||!(catalog.hasMore??page*18<catalog.total)} onClick={()=>{setPage(p=>p+1);document.getElementById('catalog')?.scrollIntoView({behavior:'smooth'});}}>下一页<ChevronRight size={16}/></button></div></>}
 </section><section className="reading-note"><div className="reading-note-icon"><BookOpen size={31}/></div><div><h3>好故事，也可以从你的书架开始。</h3><p>导入自己的中文 TXT，调好字号，接着上次的位置读下去。</p></div><button onClick={()=>fileRef.current?.click()}>导入一本书 <Upload size={16}/></button></section></>}
 {view==='shelf'&&<section className="catalog-section shelf-section"><div className="section-title"><div><div className="eyebrow">YOUR PERSONAL LIBRARY</div><h1>我的书架 <span className="shelf-count">{shelf.length}</span></h1><p className="muted">收好喜欢的故事。书架、进度与本地正文保存在此浏览器。</p></div><div className="shelf-actions"><button className="outline-button" onClick={()=>setPasteOpen(true)}>粘贴文本</button><button className="outline-button" onClick={exportShelf}><Download size={16}/>导出书架</button></div></div>{activeProgress.length>0&&<div className="continue-card"><Bookmark/><div><small>上次读到</small><h3>{activeProgress[0].title}</h3><p>{progress[activeProgress[0].id].label}</p></div><button onClick={()=>resume(activeProgress[0])}>继续阅读<ArrowRight size={17}/></button></div>}<div className="genres">{[['all','全部收藏'],['novel','轻小说'],['manga','漫画'],['reading','正在阅读']].map(([v,t])=><button key={v} className={shelfFilter===v?'chosen':''} onClick={()=>setShelfFilter(v)}>{t}</button>)}</div><div className="book-grid">{items.map(w=><article className="book-card" key={w.id}><button className="book-cover-button" onClick={()=>resume(w)}><Cover work={w}/><span className="cover-open">{w.source==='local'?'继续阅读':'查看作品'} <ArrowRight size={16}/></span></button><div className="book-meta"><span>{w.provider||sourceNames[w.source]}</span><span>{progress[w.id]?'阅读中':'想读'}</span></div><button className="book-title" onClick={()=>resume(w)}>{w.title}</button><div className="book-bottom"><p>{progress[w.id]?.label||w.author}</p><button aria-label={'移出书架 '+w.title} onClick={()=>add(w)}><X size={15}/></button></div></article>)}</div>{!items.length&&<div className="empty"><Library/><h3>留一个位置，给你的下一本好书</h3><p>在发现页收藏作品，或导入本地 TXT 开始阅读。</p><button className="primary" onClick={()=>fileRef.current?.click()}>导入本地 TXT <Plus size={17}/></button></div>}</section>}
 {view==='sources'&&<section className="catalog-section source-section"><div className="eyebrow">SOURCES & AVAILABILITY</div><h1>每个故事，都有来处。</h1><p className="muted">点击检测查看真实连接状态。需要登录、解析服务或个人书库实例的来源，完成对应连接后才能站内阅读。</p><div className="source-list">{sources.map(s=><article key={s.id}><div className={'source-icon '+s.state}><Layers/></div><div><h3>{s.name}</h3><p>{s.description}</p>{sourceObservation(s)&&<p className={sourceObservation(s).ok?'source-ok':'source-failed'}>{sourceObservation(s).ok?'最近检测成功':'最近检测未通过'} · {sourceObservation(s).message}{sourceObservation(s).hint&&<><br/>{sourceObservation(s).hint}</>}</p>}</div><div className="source-controls"><button disabled={!!testingSource} onClick={()=>void testSource(s.id,s.kind)}>{testingSource===s.id?'检测中…':'检测'}</button><button onClick={()=>{if(!s.readingEnabled&&s.id!=='bangumi'){setToast(s.description);return;}setKind(s.kind==='manga'?'manga':'novel');setSource(s.id);setSearch('');setQuery('');setPage(1);setView('discover');}}>{s.readingEnabled||s.id==='bangumi'?'打开':'未就绪'}</button></div><span className={'source-badge '+s.state}>{s.id==='bangumi'?'作品资料':s.state==='enabled'?'已接入':s.state==='configured'?'待检测':s.state==='added'?'需验证':s.state==='blocked'?'受阻暂停':'待配置'}</span></article>)}</div><div className="source-policy"><h3>内容服务连接</h3><p>{bridgeState===null?'正在检查连接…':bridgeState.connected?`连接正常 · ${bridgeState.sources.length} 个核准来源`:bridgeState.message||'服务尚未连接'}</p>{bridgeState?.sources?.map((s:any)=><p key={s.id}><strong>{s.name}</strong> · {s.language} · {s.attribution} <a href={s.rightsUrl} target="_blank" rel="noreferrer">授权说明 ↗</a></p>)}</div><div className="source-policy"><h3>来源与使用说明</h3><p>作品资料与评分来自 <a href="https://bgm.tv" target="_blank" rel="noreferrer">Bangumi</a>；漫画资料与章节来自 <a href="https://mangadex.org" target="_blank" rel="noreferrer">MangaDex</a>，阅读时保留汉化组署名。本站不设置广告或付费服务，尊重汉化组的内容移除请求。</p><p>なろう仅用于符合其条件的作品发现，不抓取正文、不自动翻译。在线阅读包括内置网页源与可选扩展服务，作品正文和插图保留来源署名；登录、私密或付费章节依来源权限提供。本地导入的文本不会上传服务器。</p><a href="https://github.com/FlashPoint007/lingqi-books/issues" target="_blank" rel="noreferrer">来源反馈 / 内容移除申请 <ArrowUpRight size={14}/></a></div></section>}
 <footer><span>零柒书境 <i>·</i> 故事未完，下一页见。</span><div><button onClick={()=>setView('sources')}>来源与使用说明</button><a href="https://github.com/FlashPoint007/lingqi-books" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12}/></a></div></footer></main>
 <dialog ref={modalRef} className="detail-modal" onCancel={closeDetail} onClick={e=>{if(e.target===e.currentTarget)closeDetail();}}>{detail&&<><button className="modal-close" aria-label="关闭作品详情" onClick={closeDetail}><X/></button><div className="detail-top"><Cover work={detail} big/><div><div className="eyebrow">{detail.provider||sourceNames[detail.source]} · {detail.kind==='novel'?'轻小说':'漫画'}</div><h2>{detail.title}</h2>{detail.originalTitle!==detail.title&&<p className="original-title">{detail.originalTitle}</p>}<p className="muted">{detail.author} · {detail.language}</p>{detail.score&&<p className="detail-score">★ {detail.score.toFixed(1)} <small>Bangumi · {detail.votes} 人评分</small></p>}<div className="tags">{detail.tags.slice(0,4).map(t=><span key={t}>{t}</span>)}</div><div className={'detail-reading-state '+(detail.readable?'':'metadata-only')}>{detail.readable?'站内阅读 · 章节加载后即可开始':detail.source==='narou'?'日文原作资料':'仅作品资料 · 可查找站内阅读源'}</div><div className="detail-actions"><button className="primary" disabled={!!openingWork||(detail.readable&&!detailCanRead)||detail.source==='narou'} onClick={startDetail}><BookOpen size={16}/>{openingWork?'正在读取目录…':!detail.readable?(detail.source==='narou'?'仅作品资料':'选择阅读源'):chapterBusy?'正在读取章节…':detailCanRead?(progress[detail.id]?'继续阅读':'开始阅读'):'暂无可读章节'}</button><button className="outline-button" onClick={()=>add(detail)}>{shelfIds.has(detail.id)?<Check size={16}/>:<Plus size={16}/>} {shelfIds.has(detail.id)?'已在书架':'加入书架'}</button></div>{detail.url&&<a className="source-info-link" href={detail.url} target="_blank" rel="noreferrer">来源资料与署名 <ArrowUpRight size={12}/></a>}</div></div><div className="detail-body"><h3>故事简介</h3><p className="synopsis">{detail.summary}</p>
 {detail.source!=='local'&&detail.source!=='narou'&&<ReadingSourcePicker work={detailAnchor||detail} current={detail} providers={sources} currentCount={chapterTotal} onSelect={selectDetailSource} notice={sourceSwitchNotice}/>}
 {['mangadex',...onlineSources].includes(detail.source)?<><div className="chapter-header"><h3>章节目录 <small>{detail.provider||sourceNames[detail.source]}</small></h3><button className="text-button" disabled={matchBusy} onClick={match}>{matchBusy?'正在匹配…':'查找 Bangumi 评分'} <Search size={14}/></button></div>{matches.length>0&&!matched&&<div className="match-list"><p>请选择同一作品；小说与改编漫画分别关联。</p>{matches.map(w=><button key={w.id} onClick={()=>setMatched(w)}>{w.title}<span>{w.score?`★ ${w.score}`:'暂无评分'} · 确认关联</span></button>)}</div>}{matched&&<div className="notice">本次选定：<a href={matched.url} target="_blank" rel="noreferrer">{matched.title} · Bangumi {matched.score||'暂无'} 分</a></div>}{chapterBusy?<p className="muted">正在读取章节目录…</p>:chapterError?<div className="notice error">{chapterError}<button onClick={()=>setRefresh(x=>x+1)}>重新读取目录</button></div>:<><div className="chapters">{chapters.map(c=><button key={c.id} disabled={c.locked||!!c.externalUrl} onClick={()=>detail.kind==='novel'?void readOnline(detail,(chapterPage-1)*100+chapters.indexOf(c)):readManga(detail,c)}><span>第 {c.number} {detail.kind==='novel'?'章':'话'}<small>{c.title}{c.externalUrl?' · 无站内图片':c.locked?' · 需要权限或未下载':''}</small></span><span className="chapter-credit">{c.language==='ja'?'日文':c.language==='zh'?'中文':'繁中'} · {c.groups.map(g=>g.name).join(' / ')||'未标注汉化组'}<ChevronRight size={16}/></span></button>)}</div>{!chapters.length&&<div className="notice">暂无可读目录，请检测来源连接状态或稍后重试。</div>}{chapterTotal>100&&<div className="pagination"><button disabled={chapterPage===1} onClick={()=>setChapterPage(x=>x-1)}>上一页</button><span>目录第 {chapterPage} 页</span><button disabled={chapterPage*100>=chapterTotal} onClick={()=>setChapterPage(x=>x+1)}>下一页</button></div>}</>}</> :detail.source==='local'?null:<button className="text-button" onClick={()=>browseReadable(detail.kind)}>浏览当前可读{detail.kind==='novel'?'小说':'漫画'}</button>}</div></>}</dialog>
 {reader&&<ReadingFrame key={reader.work.id} title={reader.work.title} chapterTitle={reader.local?reader.local.chapters[localChapter]?.title||'':reader.chapter?.title||''} positionKey={readerPositionKey} initialPosition={progress[reader.work.id]?.position} ready={readerReady} manga={!reader.local} entries={readerEntries} activeId={activeReaderId} directoryBusy={!reader.local&&(readerDirectory.workId!==reader.work.id||readerDirectory.busy)} directoryError={!reader.local?readerDirectory.error:''} onDirectoryRetry={()=>{directoryCache.current.delete(reader.work.id);setRefresh(x=>x+1);}} onSelect={selectReaderChapter} onPrevious={()=>reader.local?setLocalChapter(x=>x-1):adjacentManga(-1)} onNext={()=>reader.local?setLocalChapter(x=>x+1):adjacentManga(1)} previousDisabled={reading||readerIndex<=0||!!readerEntries[readerIndex-1]?.locked||!!readerEntries[readerIndex-1]?.external} nextDisabled={reading||readerIndex<0||readerIndex>=readerEntries.length-1||!!readerEntries[readerIndex+1]?.locked||!!readerEntries[readerIndex+1]?.external} onExit={()=>{cancelOpening();setReaderSourceOpen(false);setReader(null);}} onPosition={savePosition} preferences={readerPreferences} onPreferences={setReaderPreferences}
 notice={toast} sourceBusy={!!openingWork}
 onSourceOpenChange={open=>{setReaderSourceOpen(open);if(open)setSourceSwitchError('');}}
 sourcePanel={reader.work.source==='local'?undefined:<ReadingSourcePicker work={reader.work} current={reader.work} providers={sources}
  currentCount={readerEntries.length} active={readerSourceOpen} busy={!!openingWork} error={sourceSwitchError}
  onSelect={candidate=>void switchReaderSource(candidate)} onCancel={cancelOpening}/>}>

 {reader.online&&<><div className="reader-attribution">{onlineCredit&&<><a href={onlineCredit.sourceUrl} target="_blank" rel="noreferrer">{onlineCredit.attribution}</a> · <a href={onlineCredit.rightsUrl} target="_blank" rel="noreferrer">作品与来源说明</a></>}</div>{onlineCredit?.notice&&<p className="notice" role="status">{onlineCredit.notice}</p>}{reading&&<p className="notice" role="status">正在读取正文…</p>}{readerError&&<div className="notice error">{readerError}<button onClick={()=>setRefresh(x=>x+1)}>重试</button></div>}</>}
 {reader.local?<article className="novel-text" lang={reader.work.language==='日文原文'?'ja':'zh'} style={{fontSize,lineHeight:readerPreferences.lineHeight,maxWidth:readerPreferences.width,fontFamily:READING_FONTS[readerPreferences.fontFamily].css}}><div className="eyebrow">{String(localChapter+1).padStart(2,'0')} / {reader.local.chapters.length.toString().padStart(2,'0')}</div><h1 data-reader-anchor="title-0">{reader.local.chapters[localChapter]?.title}</h1>{reader.online?(readerReady?onlineBlocks.map((block,i)=>block.type==='image'?<div key={onlineChapterId+':'+i} data-reader-anchor={'image-'+i}><NovelIllustration src={block.url} alt={block.alt||`插图 ${i+1}`}/></div>:<p key={i} data-reader-anchor={'paragraph-'+i} className="reader-block">{block.text}</p>):null):reader.local.chapters[localChapter]?.text.split('\n').filter(Boolean).map((p,i)=><p key={i} data-reader-anchor={'paragraph-'+i}>{p}</p>)}{readerReady&&<div className="reading-chapter-end">—— 本章完 ——</div>}</article>:<div className="manga-pages"><div className="reader-attribution">{reader.work.title} · {reader.chapter?.title} · {groups.map(g=>g.name).join(' / ')}{images.length>0&&` · 共 ${images.length} 页`}</div>{onlineCredit?.notice&&<p className="notice" role="status">{onlineCredit.notice}</p>}{reading&&<div className="empty" role="status">正在加载章节…</div>}{readerError&&<div className="empty"><p>{readerError}</p><button onClick={()=>setRefresh(x=>x+1)}>重试</button></div>}{external&&<div className="empty"><p>此章节没有站内图片，请返回目录选择其他章节。</p></div>}{(imagesChapterId===reader.chapter?.id?(layout==='scroll'?images:images.slice(imagePage,imagePage+1)):[]).map((src,i)=><div className="manga-page-frame" data-reader-anchor={'image-'+(layout==='scroll'?i:imagePage)} key={src}><MangaImage src={src} fallbackSrc={fallbackImages[layout==='scroll'?i:imagePage]} index={layout==='scroll'?i:imagePage}/></div>)}{images.length>0&&layout==='page'&&<div className="pagination manga-page-controls"><button disabled={imagePage===0} onClick={()=>setImagePage(x=>x-1)}>上一页</button><span>{imagePage+1} / {images.length}</span><button disabled={imagePage>=images.length-1} onClick={()=>setImagePage(x=>x+1)}>下一页</button></div>}<p className="reader-attribution"><a href={reader.work.source!=='mangadex'?onlineCredit?.sourceUrl||reader.work.url:`https://mangadex.org/chapter/${reader.chapter?.id}`} target="_blank" rel="noreferrer">{reader.work.source!=='mangadex'?onlineCredit?.attribution||sourceNames[reader.work.source]:'MangaDex · '+groups.map(g=>g.name).join(' / ')}</a></p></div>}
 </ReadingFrame>}

 {openingWork&&<div className="reading-opening" role="status"><RotateCw size={18} className="reading-spinner"/><div><strong>正在打开阅读器</strong><small>{openingWork} · 正在读取完整目录，请稍候…</small></div><button onClick={cancelOpening}>取消</button></div>}
 {pasteOpen&&<div className="paste-overlay"><section role="dialog" aria-modal="true" aria-labelledby="paste-heading" className="paste-dialog"><button className="modal-close" aria-label="关闭粘贴文本" onClick={()=>setPasteOpen(false)}><X/></button><h2 id="paste-heading">把故事放进书架</h2><p className="muted">粘贴自己持有的文本。内容只保存在当前浏览器，不上传服务器。</p><label>书名<input autoFocus maxLength={100} value={pasteTitle} onChange={e=>setPasteTitle(e.target.value)} placeholder="给这本书起个名字"/></label><label>正文<textarea maxLength={1000000} value={pasteContent} onChange={e=>setPasteContent(e.target.value)} placeholder="在这里粘贴正文，支持自动识别章节…"/></label><button className="primary" disabled={!pasteTitle.trim()||!pasteContent.trim()} onClick={()=>{void importText(new File([pasteContent],pasteTitle.trim()+'.txt',{type:'text/plain'}));setPasteOpen(false);setPasteTitle('');setPasteContent('');}}>保存到书架 <Plus size={16}/></button></section></div>}
 {toast&&<div role="status" className="toast"><Check size={16}/>{toast}</div>}
 </div>;
}
