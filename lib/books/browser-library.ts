import type {Chapter,Work} from './model';
import type {ReadingPosition} from './reading-preferences';

export type Progress={
 chapter:number;page:number;label:string;time:number;
 mangaChapter?:Chapter;novelChapterId?:string;position?:ReadingPosition;
};

const SHELF='lq-shelf', PROGRESS='lq-progress';
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
 const recent=[...overrides.values()].sort((a,b)=>b.time-a.time).flatMap(entry=>entry.work?[entry.work]:[]);
 return [...recent,...(Array.isArray(legacy)?legacy.filter(isWork).filter(work=>!overrides.has(work.id)):[])];
}
export function storeShelfItem(work:Work,remove:boolean){
 // A tombstone also hides items loaded from an earlier version's shelf.
 localStorage.setItem(SHELF_ITEM+work.id,JSON.stringify({work:remove?null:work,time:Date.now()}));
}
export function loadProgress():Record<string,Progress>{
 const legacy=read(PROGRESS);
 const progress=legacy&&typeof legacy==='object'&&!Array.isArray(legacy)?legacy:{};
 const current=items(PROGRESS_ITEM).filter((entry):entry is [string,Progress]=>{
  const value=entry[1];
  return !!value&&typeof value==='object'&&'time' in value&&typeof value.time==='number'
   &&'chapter' in value&&typeof value.chapter==='number'&&'page' in value&&typeof value.page==='number';
 });
 return {...progress,...Object.fromEntries(current)};
}
export function storeProgress(id:string,entry:Progress){
 localStorage.setItem(PROGRESS_ITEM+id,JSON.stringify(entry));
}
export function libraryStorageKey(key:string|null){
 if(key===null)return 'both';
 if(key===SHELF||key.startsWith(SHELF_ITEM))return 'shelf';
 if(key===PROGRESS||key.startsWith(PROGRESS_ITEM))return 'progress';
}
