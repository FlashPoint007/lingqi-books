import {guiSearch,guiWork,guiChapters,guiContent,guiImage} from './manhuagui';
import {lnSearch,lnWork,lnChapters,lnContent,lnImage} from './lnovel';
import {load} from 'cheerio/slim';
import {cached,htmlPage,request,imageResponse} from './network';
import {SourceError} from './source-errors';
import type {Work,Chapter,ReadingContent} from './model';
import {bzSearch,bzWork,bzChapters,bzContent,bzImage} from './mangabz';
import {sfSearch,sfWork,sfChapters,sfContent,sfImage} from './sfacg';

export const PUBLIC_SOURCES={manhuagui:{name:'漫画柜·中文日漫',kind:'manga',description:'中文日漫公开目录与站内图片阅读；不读取受限作品'},lnovel:{name:'轻小说百科·繁体日轻',kind:'novel',description:'日轻繁体中文译文、分卷与图文阅读；保留正文署名'},mangabz:{name:'MangaBz 中文漫画',kind:'manga',description:'中文漫画目录及站内图片阅读；以实际来源可用性为准'},sfacg:{name:'SF轻小说·中文原创',kind:'novel',description:'中文原创轻小说补充源；公开章节与原位插图，VIP 章节锁定'},bh3:{name:'崩坏3官方漫画',kind:'manga',description:'米哈游官方中文原创漫画；公开目录、整章图片与站内阅读'}} as const;
export type PublicSource=keyof typeof PUBLIC_SOURCES;
export function isPublicSource(s:string):s is PublicSource{return Object.hasOwn(PUBLIC_SOURCES,s);}
export function publicSourceEnabled(s:PublicSource){return (process.env.PUBLIC_READING_SOURCES||'').split(',').map(v=>v.trim()).includes(s);}
function enabled(s:PublicSource){if(!publicSourceEnabled(s)&&s==='lnovel')throw new SourceError('verification_required','此来源在生产节点要求人机验证，暂未启用','图文适配已保留；需要来源认可的连接后再启用。',false);if(!publicSourceEnabled(s))throw new SourceError('service_not_configured','此公开阅读源尚未启用','在生产后台配置 PUBLIC_READING_SOURCES 后重新部署。');}
const BH='https://comic.bh3.com',CDN='https://act-webstatic.mihoyo.com';
function numeric(id:string){if(!/^\d{1,12}$/.test(id))throw new Error('作品 ID 无效');return id;}
export function parseBh3Books(html:string){
 const $=load(html),out=new Map<string,Work>();$('a[href*=book]').each((_,el)=>{const a=$(el),card=a.find('div.container[id]').first(),id=card.attr('id')||'',title=card.find('.container-title').text().trim();if(!/^\d{1,12}$/.test(id)||!title||out.has(id))return;
 out.set(id,{id:'bh3:'+id,source:'bh3',sourceId:id,title,originalTitle:title,kind:'manga',cover:'/api/reader-image?'+new URLSearchParams({source:'bh3',kind:'cover',workId:id}),summary:'《崩坏3》官方中文原创漫画，可在本站阅读公开章节。',author:'米哈游',tags:['官方漫画','中文原创'],url:`${BH}/book/${id}`,language:'中文',readable:true});});
 if(!out.size)throw new SourceError('parse_changed','官方漫画未返回有效作品列表','需要核对来源目录结构。');return [...out.values()];
}
async function bhBooks(){return cached('bh3:books',async()=>parseBh3Books((await htmlPage(new URL('/book',BH))).html));}
async function bhWork(id:string){numeric(id);const w=(await bhBooks()).find(w=>w.sourceId===id);if(!w)throw new Error('作品不在官方目录中');return w;}
export function parseBh3Chapters(workId:string,html:string){
 numeric(workId);let raw:unknown;try{raw=JSON.parse(html);}catch{throw new Error('官方漫画目录数据无效');}if(!Array.isArray(raw)||!raw.length||raw.length>20000)throw new Error('官方漫画目录为空或无效');
 const seen=new Set<string>();const out:Chapter[]=raw.map(c=>{const part=String(c.chapterid),title=String(c.title||'').trim();if(String(c.bookid)!==workId||!/^\d{1,12}$/.test(part)||!title||seen.has(part))throw new Error('章节与官方作品不匹配');seen.add(part);const count=Number(c.page);if(!Number.isInteger(count)||count<1||count>500)throw new Error('章节页数无效');return {id:workId+'~'+part,title,number:part,language:'zh',groups:[{name:'米哈游官方',url:BH}],pages:count};});return out.sort((a,b)=>Number(a.number)-Number(b.number));
}
async function bhChapters(id:string){numeric(id);return cached('bh3:chapters:'+id,async()=>{await bhWork(id);return parseBh3Chapters(id,(await htmlPage(new URL(`/book/${id}/get_chapter`,BH))).html);});}
export function parseBh3Images(workId:string,chapterId:string,html:string){
 numeric(workId);numeric(chapterId);const $=load(html);const images=$('img.lazy.comic_img').toArray().map(e=>{const raw=$(e).attr('data-original')||$(e).attr('src')||'';const u=new URL(raw,BH);if(u.origin!==CDN||!u.pathname.startsWith(`/new_static_v2/comic/book/${workId}/${chapterId}/`)||u.username||u.password)throw new Error('漫画图片与章节不匹配');return u.href;});if(!images.length||images.length>500)throw new Error('漫画图片列表无效');return images;
}
async function bhManifest(id:string,workId:string){
 numeric(workId);if(!id.startsWith(workId+'~'))throw new Error('章节与作品不匹配');const part=id.slice(workId.length+1);numeric(part);const chapter=(await bhChapters(workId)).find(c=>c.id===id);if(!chapter)throw new Error('章节不在官方目录中');
 return cached('bh3:pages:'+id,async()=>{const sourceUrl=`${BH}/book/${workId}/${part}`,images=parseBh3Images(workId,part,(await htmlPage(new URL(sourceUrl))).html);if(images.length!==chapter.pages)throw new Error('官方章节图片数量不完整');return {images,sourceUrl};},60000);
}
export async function publicSearch(s:PublicSource,q:string,page:number){enabled(s);if(s==='manhuagui')return guiSearch(q,page);if(s==='lnovel')return lnSearch(q,page);if(s==='mangabz')return bzSearch(q,page);if(s==='sfacg')return sfSearch(q,page);const all=(await bhBooks()).filter(w=>!q||w.title.toLowerCase().includes(q.toLowerCase())||w.sourceId===q);return {items:all.slice((page-1)*18,page*18),total:all.length,hasMore:page*18<all.length};}
export async function publicWork(s:PublicSource,id:string){enabled(s);if(s==='manhuagui')return guiWork(id);if(s==='lnovel')return lnWork(id);if(s==='mangabz')return bzWork(id);return s==='sfacg'?sfWork(id):bhWork(id);}
export async function publicChapters(s:PublicSource,id:string,page:number){enabled(s);if(s==='manhuagui')return guiChapters(id,page);if(s==='lnovel')return lnChapters(id,page);if(s==='mangabz')return bzChapters(id,page);if(s==='sfacg')return sfChapters(id,page);const all=await bhChapters(id);return {items:all.slice((page-1)*100,page*100),total:all.length};}
export async function publicContent(s:PublicSource,id:string,workId:string):Promise<ReadingContent>{enabled(s);if(s==='manhuagui')return guiContent(id,workId);if(s==='lnovel')return lnContent(id,workId);if(s==='mangabz')return bzContent(id,workId);if(s==='sfacg')return sfContent(id,workId);const d=await bhManifest(id,workId);return {blocks:[],images:d.images.map((_,index)=>'/api/reader-image?'+new URLSearchParams({source:s,id,workId,index:String(index)})),sourceUrl:d.sourceUrl,attribution:'崩坏3官方漫画 · 米哈游',rightsUrl:`${BH}/book/${workId}`};}
export async function publicImage(s:PublicSource,p:URLSearchParams){
 enabled(s);if(s==='manhuagui')return guiImage(p);if(s==='lnovel')return lnImage(p);if(s==='mangabz')return bzImage(p);if(s==='sfacg')return sfImage(p);const workId=numeric(p.get('workId')||'');let url:string,referer:string;
 if(p.get('kind')==='cover'){await bhWork(workId);url=`${CDN}/new_static_v2/comic/book_cover/${workId}.jpg`;referer=`${BH}/book/${workId}`;}
 else {const index=Number(p.get('index'));if(!p.has('index')||!Number.isInteger(index)||index<0)throw new Error('图片索引无效');const d=await bhManifest(p.get('id')||'',workId);url=d.images[index];referer=d.sourceUrl;if(!url)throw new Error('图片索引无效');}
 return imageResponse(await request(new URL(url),{Referer:referer}));
}
