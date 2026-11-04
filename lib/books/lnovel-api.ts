import {z} from 'zod';
import {richText} from '../../services/content-bridge/richtext.mjs';
import {chineseKey} from './chinese';
import {cached,jsonRequest,requestImage} from './network';
import {SourceError} from './source-errors';
import type {Chapter,ContentBlock,ReadingContent,Work} from './model';

const BASE='https://lnovel.animes.garden';
const ID=z.union([z.string(),z.number()]).transform(String).pipe(z.string().regex(/^\d{1,12}$/));
const text=z.string().max(10000).nullish();
const volume=z.object({nid:ID,vid:ID,title:z.string().min(1).max(300)});
const bookEntry=z.object({
 nid:ID,name:z.string().min(1).max(300),authors:z.array(z.object({name:z.string().max(200),position:z.string()})).max(30),
 cover:text,description:text,labels:z.array(z.string().max(100)).max(30),updatedAt:text,
 isDeleted:z.boolean().optional(),
});
const book=bookEntry.extend({volumes:z.array(volume).max(40)});
const bookIndex=z.array(bookEntry).max(5000);
const directory=z.object({
 nid:ID,vid:ID,isDeleted:z.boolean().optional(),
 chapters:z.array(z.object({nid:ID,vid:ID,cid:ID,title:z.string().min(1).max(300)})).max(400),
});
const chapterBody=z.object({
 nid:ID,vid:ID,cid:ID,content:z.string().max(1000000),
 images:z.array(z.object({src:z.string().max(1000)})).max(500).default([]),
});
const rank=z.object({items:z.array(z.object({
 nid:ID,title:z.string().min(1).max(300),cover:text,author:text,library:text,description:text,updatedAt:text,
})).max(100)});
const restricted=/\bR[ -]?18\b|成人限定|限制級|限制级|未滿\s*18|未满\s*18|僅限成人|仅限成人/i;

async function load<S extends z.ZodTypeAny>(path:string,schema:S):Promise<z.output<S>>{
 const data=await jsonRequest(new URL('/api/bili/'+path,BASE));
 if(data?.ok!==true||data.provider!=='bilinovel')throw new SourceError('invalid_response','lnovel 未返回公开作品数据','可稍后重试或选择其他阅读源。',false);
 const result=schema.safeParse(data.data);
 if(!result.success)throw new SourceError('parse_changed','lnovel 数据格式或目录大小超出支持范围','可尝试其他阅读源。',false);
 return result.data;
}
function imagePath(workId:string,id?:string,index?:number){
 return '/api/reader-image?'+new URLSearchParams({source:'lnovelapi',workId,...(id?{id,index:String(index)}:{kind:'cover'})});
}
function imageUrl(raw:string|null|undefined,nid:string,cid?:string){
 if(!raw)return;
 let u:URL;
 try{u=new URL(raw,BASE);}catch{return;}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)return;
 const file='[\\w.-]+\\.(?:jpe?g|png|webp|gif|avif)';
 const path=cid
  ?new RegExp('^/bili/img\\d+/\\d+/'+nid+'/'+cid+'/'+file+'$','i')
  :new RegExp('^/bili/(?:files/article/image/\\d+/'+nid+'/'+nid+'[a-z]?\\.(?:jpe?g|png|webp)|img\\d+/cover/'+nid+'/'+file+')$','i');
 // The API sometimes serializes its internal host. Treat the scoped resource
 // path as the identifier; every image request still goes to our fixed origin.
 if(path.test(u.pathname))return new URL(u.pathname+u.search,BASE).href;
}
function toWork(id:string,title:string,author:string,summary:string,cover:string|undefined,tags:string[],updated?:string):Work{
 return {
  id:'lnovelapi:'+id,source:'lnovelapi',sourceId:id,title,originalTitle:title,kind:'novel',
  cover:cover?imagePath(id):'',summary:richText(summary,BASE,()=>false)
   .flatMap(block=>block.type==='text'?[block.text]:[]).join('\n\n'),author,tags,url:BASE+'/bili/novel/'+id+'/feed.xml',
  language:'中文译文',readable:true,updated,
 };
}
async function novel(id:string){
 const nid=ID.parse(id);
 const data=await load('novel/'+nid,book);
 if(data.nid!==nid||data.isDeleted||data.volumes.some(v=>v.nid!==nid))throw new Error('作品与 lnovel 目录不匹配');
 if(restricted.test(data.labels.join(' ')))throw new SourceError('access_denied','此作品有年龄或阅读限制','仅接入匿名公开章节。',false);
 const cover=imageUrl(data.cover,nid);
 return {data,cover,work:toWork(nid,data.name,data.authors.filter(a=>a.position==='author').map(a=>a.name).join(' / '),
  data.description||'',cover,['日轻译文',...data.labels].slice(0,8),data.updatedAt||undefined)};
}
async function volumeChapters(nid:string,vid:string){
 const result=await load('novel/'+nid+'/vol/'+vid,directory);
 if(result.nid!==nid||result.vid!==vid||result.chapters.some(c=>c.nid!==nid||c.vid!==vid))throw new Error('分卷与作品不匹配');
 return result.isDeleted?[]:result.chapters;
}
export async function lnovelApiSearch(q:string,page:number,sort='popular'){
 if(/^\d{1,12}$/.test(q))return {items:page===1?[(await novel(q)).work]:[],total:1,hasMore:false};
 let indexUnavailable=false;
 if(q||['library','updated'].includes(sort)){
  try{
   const entries=await cached('lnovelapi:search-index',async()=>{
    const data=await load('novels',bookIndex);
    return data.filter(entry=>!entry.isDeleted&&!restricted.test(entry.name+' '+entry.labels.join(' '))).map(entry=>{
     const work=toWork(entry.nid,entry.name,entry.authors.filter(a=>a.position==='author').map(a=>a.name).join(' / '),
      entry.description||'',imageUrl(entry.cover,entry.nid),['日轻译文',...entry.labels].slice(0,8),entry.updatedAt||undefined);
     return {work,title:chineseKey(work.title),author:chineseKey(work.author)};
    });
   },300000);
   const query=chineseKey(q);
   const score=(entry:typeof entries[number])=>entry.title===query?0:entry.title.startsWith(query)?1:entry.title.includes(query)?2:3;
   const matching=q?(query?entries.filter(entry=>entry.title.includes(query)||entry.author.includes(query)):[]):[...entries];
   const items=matching.sort((a,b)=>q?score(a)-score(b):sort==='updated'
    ?(Date.parse(b.work.updated||'')||0)-(Date.parse(a.work.updated||'')||0):Number(a.work.sourceId)-Number(b.work.sourceId))
    .map(entry=>entry.work);
   return {items:items.slice((page-1)*18,page*18),total:items.length,hasMore:page*18<items.length};
  }catch{indexUnavailable=true;}
 }
 const rankings=q?['weekvisit','monthvisit']:['weekvisit'];
 const responses=await Promise.allSettled(rankings.map(name=>load('top/'+name,rank)));
 const items=new Map<string,Work>(),query=chineseKey(q);
 for(const response of responses){
  if(response.status==='rejected')continue;
  for(const entry of response.value.items){
   if(restricted.test(entry.title+' '+(entry.library||'')))continue;
   if(query&&!chineseKey(entry.title).includes(query)&&!chineseKey(entry.author||'').includes(query))continue;
   items.set(entry.nid,toWork(entry.nid,entry.title,entry.author||'',entry.description||'',
    imageUrl(entry.cover,entry.nid),['日轻译文',...(entry.library?[entry.library]:[])],entry.updatedAt||undefined));
  }
 }
 if(responses.every(r=>r.status==='rejected'))throw responses[0].reason;
 const all=[...items.values()];
 return {items:all.slice((page-1)*18,page*18),total:all.length,hasMore:page*18<all.length,partial:indexUnavailable||responses.some(r=>r.status==='rejected')};
}
export async function lnovelApiWork(id:string){return (await novel(id)).work;}
export async function lnovelApiChapters(id:string,page:number){
 const {data,work}=await novel(id);
 const all=await cached('lnovelapi:directory:'+id,async()=>{
  const items=new Map<string,Chapter>();
  for(let i=0;i<data.volumes.length;i+=3){
   const volumes=data.volumes.slice(i,i+3);
   const chapters=await Promise.all(volumes.map(v=>volumeChapters(id,v.vid)));
   chapters.forEach((entries,index)=>{
    for(const c of entries){
     const v=volumes[index],chapterId=id+'~'+v.vid+'~'+c.cid;
     if(items.has(chapterId))continue;
     items.set(chapterId,{id:chapterId,title:v.title+' · '+c.title,number:String(items.size+1),
      language:'zh',groups:[{name:'lnovel · 译者见正文',url:work.url}],pages:0});
    }
   });
  }
  return [...items.values()];
 },60000);
 return {items:all.slice((page-1)*100,page*100),total:all.length};
}
async function rawContent(id:string,workId:string):Promise<ReadingContent>{
 const [nid,vid,cid,...extra]=id.split('~');
 if(nid!==workId||extra.length)throw new Error('章节与作品不匹配');
 ID.parse(nid);ID.parse(vid);ID.parse(cid);
 const {data,work}=await novel(nid);
 if(!data.volumes.some(v=>v.vid===vid)||(await volumeChapters(nid,vid)).every(c=>c.cid!==cid))throw new Error('章节不在作品目录中');
 return cached('lnovelapi:content:'+id,async()=>{
  const result=await load('novel/'+nid+'/chapter/'+cid,chapterBody);
  if(result.nid!==nid||result.vid!==vid||result.cid!==cid)throw new Error('正文与目录不匹配');
  const images=new Set(result.images.flatMap(image=>{const url=imageUrl(image.src,nid,cid);return url?[url]:[];}));
  const blocks=(richText(result.content,BASE,u=>{
   const canonical=imageUrl(u.href,nid,cid);
   return !!canonical&&images.has(canonical);
  }) as ContentBlock[]).map(block=>block.type==='image'?{...block,url:imageUrl(block.url,nid,cid)!}:block);
  if(!blocks.length)throw new SourceError('invalid_response','来源没有返回可读图文','可以切换到其他阅读源。');
  return {blocks,text:blocks.flatMap(b=>b.type==='text'?[b.text]:[]).join('\n\n'),
   images:blocks.flatMap(b=>b.type==='image'?[b.url]:[]),
   sourceUrl:'https://www.linovelib.com/novel/'+nid+'/'+cid+'.html',
   attribution:'lnovel 开放接口 · 哔哩轻小说 · '+work.author+' · 译者见正文',rightsUrl:work.url};
 },60000);
}
export async function lnovelApiContent(id:string,workId:string){
 const d=await rawContent(id,workId);
 let index=0;
 const blocks=d.blocks.map(block=>block.type==='image'?{...block,url:imagePath(workId,id,index++)}:block);
 return {...d,blocks,images:blocks.flatMap(block=>block.type==='image'?[block.url]:[])};
}
export async function lnovelApiImage(params:URLSearchParams){
 const workId=ID.parse(params.get('workId'));
 const cover=params.get('kind')==='cover';
 const index=params.get('index');
 if(!cover&&(!index||!/^\d{1,3}$/.test(index)))throw new Error('插图索引无效');
 const url=cover?(await novel(workId)).cover:(await rawContent(params.get('id')||'',workId)).images[Number(index)];
 if(!url)throw new SourceError('not_found','来源图片不存在','请核对所选作品或章节。',false);
 return requestImage(new URL(url));
}
