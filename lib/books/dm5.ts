import {load} from 'cheerio/slim';
import {cached,htmlPage,requestImage} from './network';
import {SourceError} from './source-errors';
import {chineseKey} from './chinese';
import type {Work,Chapter,ReadingContent} from './model';

const BASE='https://www.dm5.com';
// Nodes observed in the public catalog and the verified chapter manifest.
const COVER_NODES=Array.from({length:9},(_,i)=>`https://mhfm${i+1}us.cdndm5.com`);
const PAGE_NODES=['https://manhua1036zjcdn26.cdndm5.com'];
function slug(id:string){if(!/^[a-z0-9][a-z0-9-]{0,180}$/.test(id))throw new Error('漫画作品 ID 无效');return id;}
function numeric(id:string){if(!/^\d{1,12}$/.test(id))throw new Error('漫画章节 ID 无效');return id;}
function imagePath(workId:string,id?:string,index?:number){return '/api/reader-image?'+new URLSearchParams({source:'dm5',workId,...(id?{id,index:String(index)}:{kind:'cover'})});}
function work(id:string,title:string):Work{return {id:'dm5:'+id,source:'dm5',sourceId:id,title,originalTitle:title,kind:'manga',cover:imagePath(id),summary:'',author:'',tags:['中文日漫'],url:`${BASE}/manhua-${id}/`,language:'中文',readable:true};}
function restricted(html:string){const $=load(html);if($('.warning-bar').length)throw new SourceError('access_denied','此作品有来源阅读限制','仅提供匿名公开作品，不读取受限页面。',false);}
export function parseDmList(html:string,page=1,q=''){
 const $=load(html),items=new Map<string,Work>();$(q?'.banner_detail_form,.mh-list .mh-item':'.mh-list .mh-item').each((_,e)=>{const card=$(e),a=card.find('h2.title>a,.title>a').first(),u=new URL(a.attr('href')||'',BASE),m=u.pathname.match(/^\/manhua-([a-z0-9-]+)\/$/),title=a.text().trim();if(u.origin!==BASE||!m||!title||card.find('.detail-lock,.view-lock').length||q&&!chineseKey(title).includes(chineseKey(q)))return;items.set(m[1],work(slug(m[1]),title));});
 const hasMore=$('a[href]').toArray().some(e=>{const u=new URL($(e).attr('href')||'',BASE);return u.origin===BASE&&(u.pathname===`/manhua-list-p${page+1}/`||Number(u.searchParams.get('page'))===page+1);});
 if(!items.size&&!$('#txtKeywords,.search-main,.search-empty').length)throw new SourceError('parse_changed','动漫屋作品列表已变化','需要更新来源目录解析。');return {items:[...items.values()],total:items.size+(items.size&&hasMore?1:0),hasMore:!!items.size&&hasMore};
}
export function parseDmDetail(id:string,html:string){
 slug(id);restricted(html);const $=load(html),heading=$('.banner_detail_form p.title').first().clone();heading.children().remove();const title=heading.text().trim();if(!title)throw new SourceError('parse_changed','未返回动漫屋作品详情','需要核对来源页面。');
 const cover=new URL($('.banner_detail_form img').first().attr('src')||'',BASE),path=cover.pathname.match(/^\/(\d{1,5})\/(\d{1,12})\/[^/]+\.(?:jpe?g|png|webp)$/i);if(!COVER_NODES.includes(cover.origin)||!path||cover.username||cover.password)throw new Error('封面图床或作品路径未核准');
 const w=work(id,title);w.summary=$('.banner_detail_form p.content').text().trim();w.author=$('.banner_detail_form p.subtitle>a').map((_,e)=>$(e).text().trim()).get().join(' / ');
 const chapters:Chapter[]=[],seen=new Set<string>(),descending=$('.detail-list-title a.order').first().text().trim()!=='正序';
 $('#chapterlistload>ul').each((_,ul)=>{const links=$(ul).find('li>a').toArray();if(descending)links.reverse();for(const el of links){const a=$(el),u=new URL(a.attr('href')||'',BASE),m=u.pathname.match(/^\/m(\d{1,12})\/$/);if(u.origin!==BASE||!m||seen.has(m[1]))continue;seen.add(m[1]);const text=(a.find('p.title').text()||a.text()).trim(),pages=Number(text.match(/[（(](\d+)P[）)]/i)?.[1]||0);chapters.push({id:id+'~'+m[1],title:text.replace(/[（(]\d+P[）)]/i,'').trim(),number:String(chapters.length+1),language:'zh',groups:[{name:'动漫屋（汉化组未标注）',url:BASE}],pages,locked:!!a.find('.detail-lock,.view-lock').length});}});
 if(!chapters.length||chapters.length>20000)throw new Error('未返回完整漫画目录');return {work:w,cover:cover.href,mid:path[2],prefix:path[1],chapters};
}
async function detail(id:string){slug(id);return cached('dm5:detail:'+id,async()=>parseDmDetail(id,(await htmlPage(new URL(`/manhua-${id}/`,BASE))).html));}
export async function dmSearch(q:string,page:number){const u=new URL(q?'/search':`/manhua-list-p${page}/`,BASE);if(q){u.searchParams.set('title',q);u.searchParams.set('language','1');u.searchParams.set('page',String(page));}return parseDmList((await htmlPage(u)).html,page,q);}
export async function dmWork(id:string){return (await detail(id)).work;}
export async function dmChapters(id:string,page:number){const all=(await detail(id)).chapters;return {items:all.slice((page-1)*100,page*100),total:all.length};}
export function parseDmSession(html:string,mid:string,cid:string){
 restricted(html);const $=load(html);if($('.view-pay-form').length)throw new SourceError('login_required','此章节需要来源阅读权限','仅提供公开章节。',false);
 const n=(k:string)=>html.match(new RegExp('var\\s+DM5_'+k+'\\s*=\\s*(\\d+)'))?.[1],s=(k:string)=>html.match(new RegExp('var\\s+DM5_'+k+'\\s*=\\s*["\x27]([^"\x27]+)'))?.[1];
 if(n('MID')!==mid||n('CID')!==cid)throw new Error('漫画章节与作品不匹配');const count=Number(n('IMAGE_COUNT')),sign=s('VIEWSIGN'),date=s('VIEWSIGN_DT');if(!Number.isInteger(count)||count<1||count>500||!sign||!date)throw new SourceError('parse_changed','未返回公开图片信息','该章节可能需要来源阅读权限。');
 return {count,sign,date};
}
async function session(id:string,workId:string){
 slug(workId);if(!id.startsWith(workId+'~'))throw new Error('章节与作品不匹配');const cid=numeric(id.slice(workId.length+1)),d=await detail(workId),chapter=d.chapters.find(c=>c.id===id);if(!chapter)throw new Error('章节不在作品目录中');if(chapter.locked)throw new SourceError('login_required','章节需要来源阅读权限','仅提供公开章节。',false);
 return cached('dm5:session:'+id,async()=>{const sourceUrl=`${BASE}/m${cid}/`,html=(await htmlPage(new URL(sourceUrl))).html,s=parseDmSession(html,d.mid,cid);if(chapter.pages&&chapter.pages!==s.count)throw new Error('章节页数不匹配');return {...s,sourceUrl,cid,mid:d.mid,prefix:d.prefix};},60000);
}
export function parseDmPage(script:string,mid:string,cid:string,prefix:string){
 // Only unpack literal data. No upstream code, functions or expressions run.
 const m=script.match(/\}\('((?:\\.|[^'\\])*)',([0-9]+),([0-9]+),'([^'\\]*)'\.split\('\|'\)/);if(!m||script.length>100000||Number(m[2])<2||Number(m[2])>36||Number(m[3])>1000)throw new Error('漫画图片数据格式已变化');
 const words=m[4].split('|'),base=Number(m[2]);let code=m[1].replace(/\\'/g,"'").replace(/\\\\/g,'\\');code=code.replace(/\b[0-9a-z]+\b/g,t=>{const n=parseInt(t,base);return Number.isInteger(n)&&n<Number(m[3])&&n.toString(base)===t&&words[n]?words[n]:t;});
 const root=code.match(/var pix="(https:\/\/[^"\s]+)"/)?.[1],key=code.match(/var key=["']([a-f0-9]{16,128})["']/)?.[1],array=code.match(/var pvalue=(\[[^;]+\]);/)?.[1];if(!root||!key||!array||code.match(/var cid=(\d+);/)?.[1]!==cid)throw new Error('漫画图片数据无效');
 const paths:unknown=JSON.parse(array);if(!Array.isArray(paths)||!paths.length||typeof paths[0]!=='string'||!/^\/[\w.-]+\.(?:jpe?g|png|webp)$/.test(paths[0]))throw new Error('漫画图片文件无效');const u=new URL(root+paths[0]);
 if(!PAGE_NODES.includes(u.origin)||!u.pathname.startsWith(`/${prefix}/${mid}/${cid}/`)||u.username||u.password)throw new Error('漫画图床或章节路径未核准');u.search=new URLSearchParams({cid,key}).toString();return u;
}
export async function dmContent(id:string,workId:string):Promise<ReadingContent>{const s=await session(id,workId);return {blocks:[],images:Array.from({length:s.count},(_,i)=>imagePath(workId,id,i)),sourceUrl:s.sourceUrl,attribution:'动漫屋 · 汉化组未标注',rightsUrl:`${BASE}/manhua-${workId}/`};}
export async function dmImage(p:URLSearchParams){const workId=slug(p.get('workId')||'');if(p.get('kind')==='cover')return requestImage(new URL((await detail(workId)).cover),{Referer:`${BASE}/manhua-${workId}/`});const id=p.get('id')||'',s=await session(id,workId),i=Number(p.get('index'));if(!p.has('index')||!Number.isInteger(i)||i<0||i>=s.count)throw new Error('图片索引无效');const url=await cached(`dm5:image:${id}:${i}`,async()=>{const u=new URL('chapterfun.ashx',s.sourceUrl);u.search=new URLSearchParams({cid:s.cid,page:String(i+1),key:'',language:'1',gtk:'6',_cid:s.cid,_mid:s.mid,_dt:s.date,_sign:s.sign}).toString();return parseDmPage((await htmlPage(u,{Referer:s.sourceUrl})).html,s.mid,s.cid,s.prefix).href;},30000);return requestImage(new URL(url),{Referer:s.sourceUrl});}
