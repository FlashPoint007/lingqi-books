import {z} from 'zod';
import type {Chapter,Work} from './model';
import type {ReadingPosition} from './reading-preferences';

export type Progress={
 chapter:number;page:number;label:string;time:number;
 mangaChapter?:Chapter;novelChapterId?:string;position?:ReadingPosition;
 work?:Work;
};
export type HistoryItem={work:Work;progress:Progress};

const SHELF='lq-shelf', PROGRESS='lq-progress', IMPORT='lq-library-import';
const SHELF_ITEM=SHELF+':work:', PROGRESS_ITEM=PROGRESS+':work:';

function read(key:string):unknown{
 const value=localStorage.getItem(key);
 try{return JSON.parse(value||'null');}catch{return null;}
}
function isWork(value:unknown):value is Work{
 return !!value&&typeof value==='object'&&'id' in value&&typeof value.id==='string'
  &&'title' in value&&typeof value.title==='string';
}
function items(prefix:string){
 const results:Array<[string,unknown]>=[];
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);
  if(key?.startsWith(prefix))results.push([key.slice(prefix.length),read(key)]);
 }
 return results;
}
type ShelfItem={work:Work|null;time:number};
function isShelfItem(id:string,value:unknown):value is ShelfItem{
 return !!value&&typeof value==='object'&&'work' in value&&(value.work===null||isWork(value.work)&&value.work.id===id)
  &&'time' in value&&typeof value.time==='number';
}
export function loadShelf():Work[]{
 const legacy=read(SHELF),overrides=new Map<string,ShelfItem>();
 for(const [id,value] of items(SHELF_ITEM))if(isShelfItem(id,value))overrides.set(id,value);
 const imported=readImport();
 for(const entry of imported.shelf)if(entry.time>(overrides.get(entry.work.id)?.time??-1))overrides.set(entry.work.id,entry);
 const recent=[...overrides.values()].sort((a,b)=>b.time-a.time).flatMap(entry=>entry.work?[entry.work]:[]);
 return [...recent,...(Array.isArray(legacy)?legacy.filter(isWork).filter(work=>!overrides.has(work.id)):[])];
}
export function storeShelfItem(work:Work,remove:boolean){
 // A tombstone also hides items loaded from an earlier version's shelf.
 localStorage.setItem(SHELF_ITEM+work.id,JSON.stringify({work:remove?null:work,lastWork:work,time:Date.now()}));
}
function isProgress(value:unknown):value is Progress{
 if(!value||typeof value!=='object')return false;
 const entry=value as Progress;
 return Number.isFinite(entry.time)&&Number.isFinite(new Date(entry.time).getTime())
  &&Number.isInteger(entry.chapter)&&entry.chapter>=0&&Number.isInteger(entry.page)&&entry.page>=0
  &&typeof entry.label==='string';
}
export function loadProgress():Record<string,Progress>{
 const legacy=read(PROGRESS);
 const previous=legacy&&typeof legacy==='object'&&!Array.isArray(legacy)?Object.entries(legacy):[];
 // Invalid records must not replace a valid legacy entry or reach resume logic.
 const entries=[...previous,...Object.entries(readImport().progress),...items(PROGRESS_ITEM)].filter((entry):entry is [string,Progress]=>isProgress(entry[1]));
 return Object.fromEntries(entries.sort((a,b)=>a[1].time-b[1].time));
}
/** Scroll readers track their visible image anchor, not the page-mode cursor. */
export function mangaReadingPage(position:ReadingPosition|undefined,count:number,fallback:number){
 const match=position?.anchor?.match(/^image-(\d+)$/);
 const index=match?Number(match[1]):fallback;
 return Math.max(0,Math.min(Math.max(0,count-1),Number.isSafeInteger(index)?index:0));
}
export function storeProgress(id:string,entry:Progress){
 localStorage.setItem(PROGRESS_ITEM+id,JSON.stringify(entry));
}
export function readingHistory(progress:Record<string,Progress>,known:Work[]=[]):HistoryItem[]{
 const works=new Map(known.filter(isWork).map(work=>[work.id,work]));
 return Object.entries(progress).flatMap(([id,entry])=>{
  if(!entry||!Number.isFinite(new Date(entry.time).getTime())||!Number.isFinite(entry.chapter)||entry.chapter<0
   ||!Number.isFinite(entry.page)||entry.page<0)return [];
  const work=isWork(entry.work)&&entry.work.id===id?entry.work:works.get(id);
  return work?[{work,progress:entry}]:[];
 }).sort((a,b)=>b.progress.time-a.progress.time);
}
export function loadHistory(progress=loadProgress()):HistoryItem[]{
 const legacy=read(SHELF);
 const known:Work[]=Array.isArray(legacy)?legacy.filter(isWork):[];
 for(const [,value] of items(SHELF_ITEM)){
  if(!value||typeof value!=='object')continue;
  for(const field of ['work','lastWork']){
   const work=(value as Record<string,unknown>)[field];
   if(isWork(work))known.push(work);
  }
 }
 return readingHistory(progress,known);
}
export function libraryStorageKey(key:string|null){
 if(key===null||key===IMPORT)return 'both';
 if(key===SHELF||key.startsWith(SHELF_ITEM))return 'shelf';
 if(key===PROGRESS||key.startsWith(PROGRESS_ITEM))return 'progress';
}

// Imports are committed with one atomic localStorage write. Existing records are
// never deleted; quota failures leave the previous library and import intact.
const short=z.string().max(1500),label=z.string().max(10000);
const safeUrl=z.string().max(4000).transform(value=>{
 if(!value)return '';
 if(/^\/api\/(?:reader-image|content-image)\?/.test(value))return value;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
});
const source=z.enum(['bangumi','mangadex','narou','local','bridge','wenku8','bilinovel','esj','masiro','suwayomi','maki','sfacg','bh3','mangabz','manhuagui','lnovel','n8novel','komiic','kakuyomu','linovel','lnovelapi','mangadex-en','dm5']);
const workSchema=z.object({id:short,source,sourceId:short,title:label.min(1),originalTitle:label.default(''),aliases:z.array(label).max(100).optional(),kind:z.enum(['novel','manga']),cover:safeUrl.default(''),coverFallback:safeUrl.optional(),summary:label.default(''),author:label.default(''),tags:z.array(short).max(100).default([]),score:z.number().finite().optional(),votes:z.number().finite().optional(),url:safeUrl.default(''),language:short.default(''),readable:z.boolean().default(false),provider:short.optional(),updated:short.optional()}).refine(work=>work.id===work.source+':'+work.sourceId,'作品来源 ID 不匹配');
const chapterSchema=z.object({id:short,title:label,number:short.default(''),language:short.default(''),groups:z.array(z.object({name:label,url:safeUrl})).max(100).default([]),externalUrl:safeUrl.optional(),pages:z.number().int().nonnegative().max(100000).default(0),locked:z.boolean().optional()});
const progressSchema=z.object({chapter:z.number().int().nonnegative().max(100000),page:z.number().int().nonnegative().max(100000),label,time:z.number().finite().nonnegative().refine(value=>Number.isFinite(new Date(value).getTime())&&value<=Date.now()+300000),work:workSchema.optional(),mangaChapter:chapterSchema.optional(),novelChapterId:short.optional(),position:z.object({key:short,ratio:z.number().min(0).max(1),anchor:short.regex(/^[a-z]+-\d+$/).optional(),offset:z.number().min(0).max(1).optional()}).optional()});
type Imported={shelf:Array<{work:Work;time:number}>;progress:Record<string,Progress>};
function readImport():Imported{
 const value=read(IMPORT) as Imported|null;
 return value&&Array.isArray(value.shelf)&&value.progress&&typeof value.progress==='object'?value:{shelf:[],progress:{}};
}
export function parseLibraryBackup(text:string){
 if(text.length>10*1024*1024)throw new Error('备份超过 10 MB 限制');
 let raw:unknown;try{raw=JSON.parse(text);}catch{throw new Error('不是有效的 JSON 备份');}
 if(raw&&typeof raw==='object'&&'progress' in raw&&raw.progress&&typeof raw.progress==='object'&&Object.keys(raw.progress).some(key=>['__proto__','constructor','prototype'].includes(key)))throw new Error('备份中含无效作品标识');
 const schema=z.object({version:z.literal(2),shelf:z.array(workSchema).max(2000),progress:z.record(progressSchema).refine(value=>Object.keys(value).length<=2000),history:z.array(z.object({work:workSchema,progress:progressSchema})).max(2000).default([])});
 const parsed=schema.safeParse(raw);
 if(!parsed.success)throw new Error('备份格式、版本或阅读记录无效，请选择本站导出的版本 2 备份');
 const data=parsed.data,known=new Map([...data.shelf,...data.history.map(item=>item.work)].map(work=>[work.id,work]));
 const progress:Record<string,Progress>=Object.create(null);
 for(const [id,entry] of [...data.history.map(item=>[item.work.id,{...item.progress,work:item.work}] as const),...Object.entries(data.progress)]){
  const work=entry.work||known.get(id);
  if(!work||work.id!==id||entry.position&&!entry.position.key.startsWith(id+':'))throw new Error('备份中的作品或进度身份不匹配');
  if(!progress[id]||progress[id].time<entry.time)progress[id]={...entry,work};
 }
 return {shelf:[...new Map(data.shelf.map(work=>[work.id,work])).values()],progress};
}
export function importLibraryBackup(backup:ReturnType<typeof parseLibraryBackup>){
 const previous=readImport(),shelf=new Map(previous.shelf.map(entry=>[entry.work.id,entry])),currentShelf=new Set(loadShelf().map(work=>work.id)),currentProgress=loadProgress();
 let added=0,updated=0;const time=Date.now();
 for(const work of backup.shelf)if(!currentShelf.has(work.id)){shelf.set(work.id,{work,time});added++;}
 const progress={...previous.progress};
 for(const [id,entry] of Object.entries(backup.progress))if(!currentProgress[id]||entry.time>currentProgress[id].time){progress[id]=entry;updated++;}
 localStorage.setItem(IMPORT,JSON.stringify({shelf:[...shelf.values()],progress}));
 return {added,updated};
}
export function exportLibraryBackup(){
 const shelf=loadShelf(),progress=loadProgress(),history=loadHistory(progress);
 return JSON.stringify({version:2,shelf,progress,history},null,2);
}
