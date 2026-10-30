import {load} from 'cheerio/slim';
import LZString from 'lz-string';
import {cached,htmlPage,request,imageResponse} from './network';
import {SourceError} from './source-errors';
import type {Work,Chapter,ReadingContent} from './model';

const BASE='https://www.manhuagui.com';
const CDN=['https://i.hamreus.com','https://cf.hamreus.com'];
function numeric(id:string){if(!/^\d{1,12}$/.test(id))throw new Error('漫画 ID 无效');return id;}
function imagePath(workId:string,id?:string,index?:number){return '/api/reader-image?'+new URLSearchParams({source:'manhuagui',workId,...(id?{id,index:String(index)}:{kind:'cover'})});}
function work(id:string,title:string):Work{return {id:'manhuagui:'+id,source:'manhuagui',sourceId:id,title,originalTitle:title,kind:'manga',cover:imagePath(id),summary:'',author:'',tags:['中文漫画'],url:`${BASE}/comic/${id}/`,language:'中文',readable:true};}

export function parseGuiList(html:string){
 const $=load(html),items=new Map<string,Work>();
 $('#contList a.bcover,.book-result .book-detail dt a').each((_,el)=>{
  const a=$(el),u=new URL(a.attr('href')||'',BASE),m=u.pathname.match(/^\/comic\/(\d{1,12})\/$/),title=(a.attr('title')||a.text()).trim();
  if(u.origin===BASE&&m&&title&&!items.has(m[1]))items.set(m[1],work(m[1],title));
 });
 const hasMore=$('span.current + a[href]').length>0;
 if(!items.size&&!/没有找到|沒有找到|暂无|暫無|无相关|無相關/.test($('body').text()))throw new SourceError('parse_changed','漫画柜未返回有效作品','需要核对来源列表结构。');
 return {items:[...items.values()],hasMore,total:items.size+(hasMore?1:0)};
}
export function parseGuiDetail(id:string,html:string){
 numeric(id);const $=load(html),title=$('.book-title h1').first().text().trim();
 if($('#erroraudit_show,input#__VIEWSTATE').length)throw new SourceError('access_denied','此作品需要来源允许的阅读状态','仅接入匿名公开目录。');
 if(!title)throw new SourceError('parse_changed','漫画柜作品结构已变化','需要更新来源适配。');
 const raw=$('p.hcover img').attr('src')||'',cover=new URL(raw,BASE);
 if(!['https://cf.mhgui.com','https://cf.hamreus.com'].includes(cover.origin)||!cover.pathname.startsWith('/cpic/'))throw new Error('漫画封面地址无效');
 const w=work(id,title);w.summary=$('#intro-all').text().trim();w.author=$('.detail-list span').filter((_,e)=>/漫[画畫]作者/.test($(e).text())).find('a').text().trim();
 const seen=new Set<string>(),chapters:Chapter[]=[];
 $('[id^="chapter-list-"]').each((_,section)=>{
  const group:Chapter[]=[];
  $(section).find('a.status0[href]').each((_,el)=>{
   const a=$(el),u=new URL(a.attr('href')!,BASE),m=u.pathname.match(new RegExp(`^/comic/${id}/(\\d{1,12})\\.html$`));
   if(u.origin!==BASE||!m||seen.has(m[1]))return;seen.add(m[1]);
   group.push({id:id+'~'+m[1],title:(a.attr('title')||a.find('span').first().text()||a.text()).trim(),number:'',language:'zh',groups:[{name:'漫画柜（汉化组未标注）',url:BASE}],pages:0});
  });chapters.push(...group.reverse());
 });
 if(!chapters.length||chapters.length>20000)throw new SourceError('parse_changed','漫画目录为空或过大','需要检查目录结构。');
 chapters.forEach((c,i)=>c.number=String(i+1));return {work:w,cover:cover.href,chapters};
}
async function detail(id:string){numeric(id);return cached('gui:detail:'+id,async()=>parseGuiDetail(id,(await htmlPage(new URL(`/comic/${id}/`,BASE))).html));}
export async function guiSearch(q:string,page:number){if(/^\d{1,12}$/.test(q))return {items:[(await detail(q)).work],total:1,hasMore:false};return parseGuiList((await htmlPage(new URL(q?`/s/${encodeURIComponent(q)}_p${page}.html`:`/list/japan/view_p${page}.html`,BASE))).html);}
export async function guiWork(id:string){return (await detail(id)).work;}
export async function guiChapters(id:string,page:number){const all=(await detail(id)).chapters;return {items:all.slice((page-1)*100,page*100),total:all.length};}

// The source packages JSON as a compressed dictionary. Parse literals only;
// never execute the site's scripts or its advertisements.
function literal(s:string){return s.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|[\\'"nrt])/gi,(_,e:string)=>e[0]==='x'||e[0]==='u'?String.fromCharCode(parseInt(e.slice(1),16)):e==='n'?'\n':e==='r'?'\r':e==='t'?'\t':e);}
export function parseGuiManifest(html:string,workId:string,chapterId:string){
 numeric(workId);numeric(chapterId);
 if(/id=["']erroraudit_show/.test(html))throw new SourceError('access_denied','此章节需要来源允许的阅读状态','仅接入匿名公开章节。');
 const m=html.match(/\}\('((?:\\.|[^'\\])*)',(\d+),(\d+),'([A-Za-z0-9+/=]+)'\[/);
 if(!m||m[1].length>300000||m[4].length>32000)throw new Error('漫画图片数据结构已变化');
 const radix=Number(m[2]),count=Number(m[3]);if(radix<2||radix>62||count<1||count>20000)throw new Error('漫画图片字典无效');
 const dictionary=LZString.decompressFromBase64(m[4]);if(!dictionary||dictionary.length>2000000)throw new Error('漫画图片字典无效');
 const words=dictionary.split('|');if(words.length<count)throw new Error('漫画图片字典不完整');
 const digit=(n:number)=>n<36?n.toString(36):String.fromCharCode(n+29);
 const key=(n:number):string=>n<radix?digit(n):key(Math.floor(n/radix))+digit(n%radix);
 const map=new Map(words.slice(0,count).map((w,i)=>[key(i),w]));
 const code=literal(m[1]).replace(/\b[0-9A-Za-z]+\b/g,t=>map.get(t)||t);
 const json=code.match(/^[A-Za-z0-9_.]+\((\{[\s\S]*\})\)\.[A-Za-z0-9_]+\(\);?$/)?.[1];
 if(!json)throw new Error('漫画图片数据无效');
 const d=JSON.parse(json);
 if(String(d.bid)!==workId||String(d.cid)!==chapterId)throw new Error('漫画图片与章节不匹配');
 if(d.block_cc)throw new SourceError('access_denied','来源限制了此章节的阅读范围','请遵守来源的地域与阅读权限。');
 if(!Array.isArray(d.files)||d.files.length<1||d.files.length>500||d.len!==d.files.length)throw new Error('漫画图片数量不完整');
 if(typeof d.path!=='string'||!/^\/(?!\/)/.test(d.path)||!d.path.endsWith('/')||/[?#\\]|(?:^|\/)\.\.(?:\/|$)/.test(decodeURIComponent(d.path)))throw new Error('漫画图片路径无效');
 if(!d.sl||!Number.isInteger(d.sl.e)||typeof d.sl.m!=='string'||!/^[-\w]{1,200}$/.test(d.sl.m))throw new Error('漫画图片参数无效');
 const paths:string[]=d.files.map((f:unknown)=>{
  if(typeof f!=='string'||f.length>500||/[/?#\\]|^\.\.?$/.test(decodeURIComponent(f))||! /\.(?:webp|jpe?g|png|gif|avif)$/i.test(f))throw new Error('漫画图片文件无效');
  const u=new URL(d.path+f,CDN[0]);if(u.origin!==CDN[0])throw new Error('漫画图片路径无效');u.search=new URLSearchParams({e:String(d.sl.e),m:d.sl.m}).toString();return u.href;
 });return paths;
}
async function manifest(id:string,workId:string){numeric(workId);if(!id.startsWith(workId+'~'))throw new Error('章节与作品不匹配');const part=numeric(id.slice(workId.length+1));if(!(await detail(workId)).chapters.some(c=>c.id===id))throw new Error('章节不在作品目录中');return cached('gui:pages:'+id,async()=>{const sourceUrl=`${BASE}/comic/${workId}/${part}.html`;return {sourceUrl,images:parseGuiManifest((await htmlPage(new URL(sourceUrl))).html,workId,part)};},60000);}
export async function guiContent(id:string,workId:string):Promise<ReadingContent>{const d=await manifest(id,workId);return {blocks:[],images:d.images.map((_,i)=>imagePath(workId,id,i)),sourceUrl:d.sourceUrl,attribution:'漫画柜 · 汉化组未标注',rightsUrl:`${BASE}/comic/${workId}/`};}
export async function guiImage(p:URLSearchParams){const workId=numeric(p.get('workId')||'');if(p.get('kind')==='cover')return imageResponse(await request(new URL((await detail(workId)).cover),{Referer:BASE+'/'}));const d=await manifest(p.get('id')||'',workId),index=Number(p.get('index'));if(!p.has('index')||!Number.isInteger(index)||index<0||!d.images[index])throw new Error('图片索引无效');return imageResponse(await request(new URL(d.images[index]),{Referer:BASE+'/'}));}
