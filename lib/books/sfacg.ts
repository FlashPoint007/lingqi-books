import {load} from 'cheerio/slim';
import {richText} from '../../services/content-bridge/richtext.mjs';
import {cached,htmlPage,publicUrl,request,imageResponse} from './network';
import {SourceError} from './source-errors';
import type {Work,Chapter,ContentBlock,ReadingContent} from './model';

const SITE='https://book.sfacg.com';
function numeric(id:string){if(!/^\d{1,12}$/.test(id))throw new Error('作品 ID 无效');return id;}
function imageUrl(raw:string,base=SITE){
 const u=publicUrl(raw,base);if(u.protocol==='http:')u.protocol='https:';
 const extra=(process.env.SFACG_IMAGE_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(u.protocol!=='https:'||!(/(^|\.)sfacg\.com$/.test(u.hostname)||extra.includes(u.hostname)))throw new Error('插图不在来源允许的图床范围');
 return u.href;
}
function work(id:string,title:string,cover='',author='',summary=''):Work{
 return {id:'sfacg:'+id,source:'sfacg',sourceId:id,title:title.trim(),originalTitle:title.trim(),kind:'novel',cover:cover?'/api/reader-image?'+new URLSearchParams({source:'sfacg',kind:'cover',workId:id}):'',summary:summary.trim()||'中文原创轻小说补充源。可在本站阅读公开章节，VIP 章节锁定。',author:author.trim()||'作者资料待补充',tags:['中文原创','公开章节'],url:`${SITE}/Novel/${id}/`,language:'中文',readable:true};
}
export function parseSfSearch(html:string){
 const $=load(html),out=new Map<string,Work>();
 $('a[href]').each((_,el)=>{const a=$(el);let u:URL;try{u=publicUrl(a.attr('href')||'',SITE);}catch{return;}const id=u.origin===SITE?u.pathname.match(/^\/Novel\/(\d{1,12})\/?$/)?.[1]:undefined;if(!id||out.has(id))return;
 const title=(a.attr('title')||a.find('img').attr('alt')||a.text()).trim();if(!title||/^(阅读|详情|目录|点击阅读)$/.test(title))return;
 const card=a.closest('ul,dl,.comic_info,.book-info,table');const img=a.find('img').first().length?a.find('img').first():card.find('img').first();const raw=img.attr('src')||'';let cover='';try{if(raw)cover=imageUrl(raw);}catch{}
 out.set(id,work(id,title,cover,card.find('a[href*="/Club/"]').first().text()));});return [...out.values()];
}
// The public search form uses JavaScript escape(), including UTF-16 %uXXXX sequences.
export function sfSearchKey(s:string){return Array.from({length:s.length},(_,i)=>{const c=s[i],n=s.charCodeAt(i);return /[\w@*+\-./]/.test(c)?c:n<256?'%'+n.toString(16).padStart(2,'0'):'%u'+n.toString(16).padStart(4,'0');}).join('');}
export async function sfSearch(q:string,page:number){
 if(/^\d{1,12}$/.test(q))return {items:[await sfWork(q)],total:1,hasMore:false};
 const url=q?new URL(`https://s.sfacg.com/?Key=${sfSearchKey(q)}&S=1&SS=0&PageIndex=${page}`):new URL(`/List/?PageIndex=${page}`,SITE);
 const {html}=await htmlPage(url),items=parseSfSearch(html),$=load(html);
 if(!items.length){if(q&&/没有找到|未找到|无符合|沒有找到|搜索结果.{0,10}0/.test($('body').text()))return {items:[],total:0,hasMore:false};throw new SourceError('parse_changed','SF 未返回可识别的作品列表','可以使用作品数字 ID 查找，或检查来源页面结构。');}
 const hasMore=$('a[href]').toArray().some(e=>/下一[页頁]|next/i.test($(e).text()));return {items,total:(page-1)*18+items.length+(hasMore?1:0),hasMore};
}
export function parseSfDetail(id:string,html:string){
 numeric(id);const $=load(html),heading=$('h1.title').first().clone();heading.find('.tag').remove();const title=heading.text().trim(),author=$('.author-name').first().text().trim();
 if(!title||!author)throw new SourceError('parse_changed','SF 作品详情结构已变化','需要核对作品地址与页面解析。');
 const raw=$('#hasTicket div.pic img').first().attr('src')||'';const coverUrl=raw?imageUrl(raw):'';return {work:work(id,title,coverUrl,author,$('.introduce').first().text()),coverUrl};
}
async function data(id:string){numeric(id);return cached('sfacg:work:'+id,async()=>parseSfDetail(id,(await htmlPage(new URL(`/Novel/${id}/`,SITE))).html));}
export async function sfWork(id:string){return (await data(id)).work;}
export function parseSfChapters(id:string,html:string){
 numeric(id);const $=load(html);if(!$('h1.story-title').text().trim())throw new SourceError('parse_changed','SF 未返回有效目录','需要核对来源目录结构。');
 const out:Chapter[]=[],seen=new Set<string>();$('.catalog-list a[href]').each((_,el)=>{const a=$(el);let u:URL;try{u=publicUrl(a.attr('href')||'',SITE);}catch{return;}if(u.origin!==SITE)return;
 const free=u.pathname.match(new RegExp(`^/Novel/${id}/(\\d{1,12})/(\\d{1,12})/$`)),vip=u.pathname.match(/^\/vip\/c\/(\d{1,12})\/?$/i);if(!free&&!vip)return;
 const cid=id+'~'+(free?free[1]+'/'+free[2]:'vip/'+vip![1]);if(seen.has(cid))return;const title=(a.attr('title')||a.text()).trim();if(!title)return;seen.add(cid);
 const section=a.closest('.story-catalog').find('.catalog-title').first().text().trim();out.push({id:cid,title:(section?section+' · ':'')+title,number:String(out.length+1),language:'zh',groups:[{name:'SF轻小说',url:SITE}],pages:0,locked:!!vip||a.find('.icn_vip,.vip').length>0||a.is('.icn_vip,.vip')});});
 if(!out.length||out.length>20000)throw new SourceError('parse_changed','SF 目录为空或超过读取上限','请检查来源目录。');return out;
}
async function allChapters(id:string){numeric(id);return cached('sfacg:chapters:'+id,async()=>{await sfWork(id);return parseSfChapters(id,(await htmlPage(new URL(`/Novel/${id}/MainIndex/`,SITE))).html);});}
export async function sfChapters(id:string,page:number){const list=await allChapters(id);return {items:list.slice((page-1)*100,page*100),total:list.length};}
export function parseSfContent(html:string,url:string):ContentBlock[]{
 const $=load(html);if($('.pay-section,#vipImage,.fufei-app-download-hint').length)throw new SourceError('login_required','此章节需要来源账户的阅读权限','仅接入公开章节，VIP 内容不读取。');
 const body=$('.article-content,#ChapterBody').first();if(!body.length)throw new SourceError('parse_changed','SF 未返回公开正文','需要核对章节结构与阅读权限。');
 if(/请先登录|订阅后|购买本章/.test(body.text()))throw new SourceError('login_required','此章节需要登录或订阅','仅接入公开章节。');
 const blocks=richText(body.html()||'',url) as ContentBlock[];const safe=blocks.map(b=>b.type==='image'?{...b,url:imageUrl(b.url,url)}:b);if(!safe.length)throw new Error('此章节没有可读图文');return safe;
}
async function content(id:string,workId:string):Promise<ReadingContent>{
 numeric(workId);if(!id.startsWith(workId+'~'))throw new Error('章节与作品不匹配');const list=await allChapters(workId),chapter=list.find(c=>c.id===id);if(!chapter)throw new Error('章节不在作品目录中');
 if(chapter.locked)throw new SourceError('login_required','VIP 章节已锁定','仅接入公开章节，不读取或购买付费正文。');
 const part=id.slice(workId.length+1);if(!/^\d{1,12}\/\d{1,12}$/.test(part))throw new Error('章节 ID 无效');
 return cached('sfacg:content:'+id,async()=>{const url=`${SITE}/Novel/${workId}/${part}/`,{html}=await htmlPage(new URL(url)),blocks=parseSfContent(html,url),w=await sfWork(workId);return {blocks,text:blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n\n'),images:blocks.filter(b=>b.type==='image').map(b=>b.url),sourceUrl:url,attribution:`SF轻小说 · ${w.author}`,rightsUrl:w.url};},60000);
}
export async function sfContent(id:string,workId:string){const d=await content(id,workId);let index=0;const blocks=d.blocks.map(b=>b.type==='image'?{...b,url:'/api/reader-image?'+new URLSearchParams({source:'sfacg',id,workId,index:String(index++)})}:b);return {...d,blocks,images:blocks.filter(b=>b.type==='image').map(b=>b.url)};}
export async function sfImage(p:URLSearchParams){
 const workId=numeric(p.get('workId')||'');let url:string,referer:string;
 if(p.get('kind')==='cover'){const d=await data(workId);url=d.coverUrl;referer=d.work.url;if(!url)throw new Error('封面不可用');}
 else {const index=Number(p.get('index'));if(!p.has('index')||!Number.isInteger(index)||index<0)throw new Error('图片索引无效');const d=await content(p.get('id')||'',workId);url=d.images[index];referer=d.sourceUrl;if(!url)throw new Error('图片索引无效');}
 return imageResponse(await request(new URL(imageUrl(url)),{Referer:referer}));
}
