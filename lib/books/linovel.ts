import {load} from 'cheerio/slim';
import {richText} from '../../services/content-bridge/richtext.mjs';
import {cached,htmlPage,requestImage} from './network';
import {SourceError} from './source-errors';
import type {Work,Chapter,ContentBlock,ReadingContent} from './model';

const BASE='https://www.linovel.net',CDN='https://rin.linovel.net';
function numeric(id:string){if(!/^\d{1,12}$/.test(id))throw new Error('小说 ID 无效');return id;}
function imagePath(workId:string,id?:string,index?:number){return '/api/reader-image?'+new URLSearchParams({source:'linovel',workId,...(id?{id,index:String(index)}:{kind:'cover'})});}
function imageUrl(raw:string){const u=new URL(raw,BASE);if(u.origin!==CDN||!/^\/(?:cover|book|image|illust)\//.test(u.pathname)||u.username||u.password)throw new Error('小说图片不在核准图床中');return u;}
function work(id:string,title:string):Work{return {id:'linovel:'+id,source:'linovel',sourceId:id,title,originalTitle:title,kind:'novel',cover:imagePath(id),summary:'',author:'',tags:['中文原创'],url:`${BASE}/book/${id}.html`,language:'简体中文',readable:true};}
export function parseLinovelList(html:string,page=1){
 const $=load(html),items=new Map<string,Work>();$('a[href]').each((_,e)=>{const a=$(e),u=new URL(a.attr('href')||'',BASE),m=u.pathname.match(/^\/book\/(\d{1,12})\.html$/),title=a.find('.book-name,.book-item-name').first().text().trim();if(u.origin!==BASE||!m||!title||items.has(m[1]))return;const w=work(m[1],title);w.summary=a.find('.book-intro').text().trim();items.set(m[1],w);});
 const hasMore=$('a[href]').toArray().some(e=>{const u=new URL($(e).attr('href')||'',BASE);return u.origin===BASE&&Number(u.searchParams.get('page'))===page+1;});
 if(!items.size&&!$('input[name=kw]').length)throw new SourceError('parse_changed','轻之文库作品列表已变化','需要更新来源目录解析。');return {items:[...items.values()],total:items.size+(hasMore?1:0),hasMore};
}
export function parseLinovelDetail(id:string,html:string){
 numeric(id);const $=load(html),title=$('.book-title').first().text().trim();if(!title||$('meta[property="og:url"]').attr('content')!==`${BASE}/book/${id}.html`)throw new Error('小说详情与作品不匹配');
 const w=work(id,title);w.author=$('div.name a').first().text().trim();w.summary=$('.about-text').text().trim();w.tags.push(...$('.book-cats>a').toArray().map(e=>$(e).text().trim()).filter(Boolean).slice(0,6));
 const cover=imageUrl($('.book-cover img').first().attr('src')||'');if(!new RegExp('/'+id+'_').test(cover.pathname))throw new Error('封面与作品不匹配');
 const chapters:Chapter[]=[],seen=new Set<string>();$('div.chapter a[href]').each((_,e)=>{const a=$(e),u=new URL(a.attr('href')!,BASE),m=u.pathname.match(/^\/book\/(\d{1,12})\/(\d{1,12})\.html$/);if(u.origin!==BASE||m?.[1]!==id||seen.has(m[2]))return;seen.add(m[2]);chapters.push({id:id+'~'+m[2],title:a.text().trim(),number:String(chapters.length+1),language:'zh',groups:[{name:w.author||'轻之文库原作者',url:w.url}],pages:0,locked:!!a.find('.icon-lock,.lock').length||/付费|付費|VIP/.test(a.attr('class')||'')});});
 if(!chapters.length||chapters.length>20000)throw new Error('未返回完整小说目录');return {work:w,cover:cover.href,chapters};
}
async function detail(id:string){numeric(id);return cached('linovel:detail:'+id,async()=>parseLinovelDetail(id,(await htmlPage(new URL(`/book/${id}.html`,BASE))).html));}
export async function linovelSearch(q:string,page:number){if(/^\d{1,12}$/.test(q))return {items:[(await detail(q)).work],total:1,hasMore:false};if(!q&&page>1)return {items:[],total:0,hasMore:false};const u=new URL(q?'/search/':'/list/top',BASE);if(q){u.searchParams.set('kw',q);u.searchParams.set('page',String(page));}return parseLinovelList((await htmlPage(u)).html,page);}
export async function linovelWork(id:string){return (await detail(id)).work;}
export async function linovelChapters(id:string,page:number){const all=(await detail(id)).chapters;return {items:all.slice((page-1)*100,page*100),total:all.length};}
export function parseLinovelBody(html:string,workId:string,chapterId:string):ContentBlock[]{
 const $=load(html);if($('.fufei-app-download-hint,.article-pay,.paywall').length)throw new SourceError('login_required','此章节需要来源阅读权限','付费章节不能在此读取。',false);
 const bound=$(`a[href="/book/${numeric(workId)}.html"]`).length>0,body=$('.article-text');if(!bound||!body.length)throw new SourceError('parse_changed','未返回匹配的公开正文','请检查来源章节或阅读权限。');
 const blocks=richText(body.html()||'',`${BASE}/book/${workId}/${numeric(chapterId)}.html`) as ContentBlock[];for(const b of blocks)if(b.type==='image')b.url=imageUrl(b.url).href;if(!blocks.length)throw new Error('公开正文为空');return blocks;
}
async function content(id:string,workId:string):Promise<ReadingContent>{
 numeric(workId);if(!id.startsWith(workId+'~'))throw new Error('章节与作品不匹配');const ep=numeric(id.slice(workId.length+1)),d=await detail(workId),chapter=d.chapters.find(c=>c.id===id);if(!chapter)throw new Error('章节不在作品目录中');if(chapter.locked)throw new SourceError('login_required','章节需要来源阅读权限','仅提供公开章节。',false);
 return cached('linovel:body:'+id,async()=>{const sourceUrl=`${BASE}/book/${workId}/${ep}.html`,blocks=parseLinovelBody((await htmlPage(new URL(sourceUrl))).html,workId,ep);return {blocks,text:blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n\n'),images:blocks.filter(b=>b.type==='image').map(b=>b.url),sourceUrl,attribution:`轻之文库 · ${d.work.author} · 中文原创`,rightsUrl:d.work.url};},60000);
}
export async function linovelContent(id:string,workId:string){const d=await content(id,workId);let index=0;const blocks=d.blocks.map(b=>b.type==='image'?{...b,url:imagePath(workId,id,index++)}:b);return {...d,blocks,images:blocks.filter(b=>b.type==='image').map(b=>b.url)};}
export async function linovelImage(p:URLSearchParams){const workId=numeric(p.get('workId')||'');let url:string;if(p.get('kind')==='cover')url=(await detail(workId)).cover;else {const d=await content(p.get('id')||'',workId),i=Number(p.get('index'));if(!p.has('index')||!Number.isInteger(i)||i<0||!d.images[i])throw new Error('插图索引无效');url=d.images[i];}return requestImage(imageUrl(url),{Referer:BASE+'/'});}
