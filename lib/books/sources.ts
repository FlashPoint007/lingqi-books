import {jsonRequest,requestImage} from './network';
import {SourceError} from './source-errors';
import type {Work,Chapter} from './model';
const UA='LingqiBooks/0.1 (https://github.com/FlashPoint007/lingqi-books)';
const cache=new Map<string,{until:number;data:any}>();
export async function upstream(url:string,body?:unknown){
 const key=url+JSON.stringify(body||'');const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.data;
 const task=(async()=>{const res=await fetch(url,{method:body?'POST':'GET',headers:{'User-Agent':UA,'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:'manual'});
 if(!res.ok)throw new Error(res.status===429?'来源请求过于频繁，请稍后重试':`来源暂不可用（${res.status}）`);
 const data=await res.json();if(cache.size>=180)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+300000,data});return data;})();
 try{return await task;}catch(e){if(e instanceof Error&&/^(来源|当前|该|作品|图片|尚未)/.test(e.message))throw e;throw new Error('来源连接暂时失败，请稍后重试');}
}
function text(v:any):string{return typeof v==='string'?v:Array.isArray(v)?v.map(x=>x.v||'').join(' / '):'';}
function aliasNames(names:unknown[]){return [...new Set(names.filter((name):name is string=>typeof name==='string'&&name.trim().length>0&&name.length<=100))].slice(0,24);}
export function bangumiWork(s:any,category:Work['kind']='novel'):Work{
 const kind=/漫画|漫畫/.test(s.platform||'')?'manga':/小说|小說|文库|文庫/.test(s.platform||'')?'novel':category;
 const cover=safeUrl(s.images?.common)||safeUrl(s.images?.large)||safeUrl(s.image)||'';
 const coverFallback=[s.images?.large,s.images?.medium,s.images?.small].map(safeUrl).find(url=>url&&url!==cover);
 return {
  id:`bangumi:${s.id}`,source:'bangumi',sourceId:String(s.id),title:s.name_cn||s.name,originalTitle:s.name,
  aliases:aliasNames((s.infobox||[]).filter((x:any)=>/别名|別名/.test(x.key)).flatMap((x:any)=>Array.isArray(x.value)?x.value.map((v:any)=>v.v):[x.value])),
  kind,cover,coverFallback,summary:s.summary||'暂无作品简介',
  author:text(s.infobox?.find((x:any)=>x.key==='作者')?.value)||'作者资料待补充',
  tags:(s.tags||[]).slice(0,5).map((x:any)=>x.name),score:s.rating?.score||undefined,votes:s.rating?.total||0,
  url:`https://bgm.tv/subject/${s.id}`,language:s.name_cn?'中文资料':'日文资料',readable:false,updated:s.date||undefined,
 };
}
export type MangaDexSource='mangadex'|'mangadex-en';
export function isMangaDex(source:string):source is MangaDexSource{return source==='mangadex'||source==='mangadex-en';}
export function mangaDexEnabled(source:MangaDexSource){
 return source==='mangadex'||(process.env.PUBLIC_READING_SOURCES||'').split(',').some(id=>id.trim()===source);
}
function mangaLanguages(source:MangaDexSource){return source==='mangadex-en'?['en']:['zh','zh-hk'];}
const mdCovers=new Map<string,{url:string;until:number}>();
function mdCover(id:string,file:unknown,attributes:any){if(typeof file!=='string'||!/^[a-zA-Z0-9_-]{1,120}\.(?:jpe?g|png|webp)$/i.test(file)||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return '';if(attributes.contentRating==='safe'&&attributes.originalLanguage==='ja'){if(mdCovers.size>=180)mdCovers.delete(mdCovers.keys().next().value!);mdCovers.set(id,{url:`https://uploads.mangadex.org/covers/${id}/${file}.256.jpg`,until:Date.now()+300000});}return '/api/reader-image?'+new URLSearchParams({source:'mangadex',kind:'cover',workId:id});}
export async function mangaCoverUrl(id:string){if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new Error('作品 ID 无效');let h=mdCovers.get(id);if(!h||h.until<=Date.now()){const d=await jsonRequest(new URL(`https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=author`));if(d.data?.id!==id||d.data?.attributes?.contentRating!=='safe'||d.data?.attributes?.originalLanguage!=='ja')throw new Error('当前仅提供全年龄日漫');mangaWork(d.data);h=mdCovers.get(id);}if(!h)throw new Error('来源未提供有效封面');return h.url;}
const localized=(v:any)=>v?.zh||v?.['zh-hk']||v?.ja||v?.en||Object.values(v||{})[0]||'';
export function mangaWork(m:any,source:MangaDexSource='mangadex'):Work{const a=m.attributes;const cover=m.relationships?.find((x:any)=>x.type==='cover_art')?.attributes?.fileName;const cn=a.altTitles?.find((t:any)=>t.zh||t['zh-hk']);return {id:source+':'+m.id,source,sourceId:m.id,title:cn?localized(cn):localized(a.title),originalTitle:localized(a.title),aliases:aliasNames([Object.values(a.title||{}),...(a.altTitles||[]).map((t:any)=>Object.values(t))].flat()),kind:'manga',cover:mdCover(m.id,cover,a),summary:localized(a.description)||'暂无作品简介',author:m.relationships?.filter((r:any)=>r.type==='author').map((r:any)=>r.attributes?.name).filter(Boolean).join(' / ')||'作者资料待补充',tags:a.tags?.slice(0,5).map((t:any)=>localized(t.attributes.name))||[],url:`https://mangadex.org/title/${m.id}`,language:source==='mangadex-en'?'英文译文':'中文章节候选',readable:true,updated:a.updatedAt};}
export async function searchBangumi(q:string,kind:string,page:number,sort:string,tag:string){
 const category=kind==='manga'?'manga':'novel';
 const data=await upstream(`https://api.bgm.tv/v0/search/subjects?limit=18&offset=${(page-1)*18}`,{
  keyword:q,sort:sort==='score'?'score':q?'match':'heat',
  filter:{type:[1],tag:[category==='manga'?'漫画':'轻小说',...(tag?[tag]:[])],nsfw:false},
 });
 const items:Work[]=(data.data||[]).filter((entry:any)=>!entry.nsfw&&entry.type===1)
  .map((entry:any)=>bangumiWork(entry,category)).filter((work:Work)=>work.kind===category);
 return {items,total:data.total||0};
}
export async function searchManga(q:string,page:number,sort:string,source:MangaDexSource='mangadex'){
 const params=new URLSearchParams({limit:'18',offset:String((page-1)*18),'originalLanguage[]':'ja','contentRating[]':'safe'});
 for(const language of mangaLanguages(source))params.append('availableTranslatedLanguage[]',language);
 for(const relationship of ['cover_art','author'])params.append('includes[]',relationship);
 params.set(sort==='updated'?'order[latestUploadedChapter]':'order[followedCount]','desc');
 if(q)params.set('title',q);
 const data=await upstream('https://api.mangadex.org/manga?'+params);
 const items:Work[]=data.data.map((manga:any)=>mangaWork(manga,source));
 return {items,total:data.total};
}
export async function mangaDetail(id:string,source:MangaDexSource='mangadex'){
 const d=await upstream(`https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=author`);
 if(d.data.id!==id||d.data.attributes.contentRating!=='safe'||d.data.attributes.originalLanguage!=='ja')throw new Error('当前仅提供全年龄日漫');
 return mangaWork(d.data,source);
}
function blockedGroups(){return new Set((process.env.MANGADEX_BLOCKED_GROUPS||'').split(',').map(s=>s.trim()).filter(Boolean));}
export function groupBlocked(rels:any[]){return rels.some(r=>r.type==='scanlation_group'&&blockedGroups().has(r.id));}
function safeUrl(u:any){try{const v=new URL(u);return v.protocol==='https:'&&!v.username&&!v.password?v.href:undefined;}catch{return undefined;}}
function mangaGroups(relationships:any[]){
 return relationships.filter(r=>r.type==='scanlation_group').map(r=>({name:r.attributes?.name||'未署名汉化组',url:`https://mangadex.org/group/${r.id}`}));
}
export async function chapters(id:string,page:number,source:MangaDexSource='mangadex'){
 await mangaDetail(id,source);
 const params=new URLSearchParams({limit:'100',offset:String((page-1)*100),'order[volume]':'asc','order[chapter]':'asc','includes[]':'scanlation_group','contentRating[]':'safe'});
 const languages=mangaLanguages(source);
 for(const language of languages)params.append('translatedLanguage[]',language);
 const data=await upstream(`https://api.mangadex.org/manga/${id}/feed?`+params);
 const items:Chapter[]=data.data.filter((c:any)=>!groupBlocked(c.relationships)&&languages.includes(c.attributes.translatedLanguage))
  .map((c:any):Chapter=>({
   id:c.id,title:c.attributes.title||(source==='mangadex-en'?`Chapter ${c.attributes.chapter||'Extra'}`:`第 ${c.attributes.chapter||'番外'} 话`),
   number:c.attributes.chapter||'番外',language:c.attributes.translatedLanguage,groups:mangaGroups(c.relationships),
   externalUrl:safeUrl(c.attributes.externalUrl),pages:c.attributes.pages,
   locked:!c.attributes.externalUrl&&c.attributes.pages===0,
  }));
 return {total:data.total,hasMore:page*100<data.total,items};
}
export async function pages(id:string,source:MangaDexSource='mangadex',workId=''){
 const d=await upstream(`https://api.mangadex.org/chapter/${id}?includes[]=scanlation_group&includes[]=manga`);
 if(groupBlocked(d.data.relationships))throw new Error('该汉化组的内容已停止提供');
 const a=d.data.attributes;
 if(!mangaLanguages(source).includes(a.translatedLanguage))throw new Error('章节语言与所选版本不一致');
 const m=d.data.relationships.find((r:any)=>r.type==='manga');
 if(!m||workId&&m.id!==workId)throw new Error('章节与所选作品不匹配');
 await mangaDetail(m.id,source);
 if(a.externalUrl)return {externalUrl:safeUrl(a.externalUrl),images:[],groups:[]};
 const at=await upstream(`https://api.mangadex.org/at-home/server/${id}`);
 const base=safeUrl(at.baseUrl);
 if(!base)throw new Error('图片服务器地址无效');
 const imageList=(files:string[],folder:string)=>files.map(file=>`${base.replace(/\/$/,'')}/${folder}/${encodeURIComponent(at.chapter.hash)}/${encodeURIComponent(file)}`);
 return {images:imageList(at.chapter.data,'data'),fallbackImages:imageList(at.chapter.dataSaver||[],'data-saver'),
  groups:mangaGroups(d.data.relationships),chapterUrl:`https://mangadex.org/chapter/${id}`};
}
export async function mangaPageImage(id:string,index:number,source:MangaDexSource='mangadex',workId='',quality:'original'|'saver'='original'){
 const manifest=await pages(id,source,workId);
 const original=manifest.images[index],compressed=manifest.fallbackImages?.[index];
 if(!original)throw new SourceError('not_found','来源未提供此页图片','请检查章节或切换阅读源。');
 const image=quality==='saver'&&compressed?compressed:original;
 const fallback=image===original?compressed:original;
 try{return await requestImage(new URL(image));}
 catch(error){
  if(error instanceof SourceError&&['verification_required','login_required','access_denied','rate_limited'].includes(error.code))throw error;
  if(!fallback||fallback===image)throw error;
  return requestImage(new URL(fallback));
 }
}
export async function narou(q:string,page:number){if(process.env.NAROU_ENABLED!=='true')throw new Error('尚未启用：运营者需完成平台注册并核对使用条件');const p=new URLSearchParams({out:'json',lim:'18',st:String((page-1)*18+1),order:'weeklypoint',of:'t-n-w-s-k-ga-gp',word:q});const d=await upstream('https://api.syosetu.com/novelapi/api/?'+p);return {total:d[0]?.allcount||0,items:d.slice(1).map((n:any):Work=>({id:`narou:${n.ncode}`,source:'narou',sourceId:n.ncode,title:n.title,originalTitle:n.title,kind:'novel',cover:'',summary:n.story,author:n.writer,tags:(n.keyword||'').split(' ').slice(0,5),url:`https://ncode.syosetu.com/${n.ncode.toLowerCase()}/`,language:'日文原作',readable:false}))};}
