import {load} from 'cheerio/slim';
import {richText} from '../../services/content-bridge/richtext.mjs';
import {cached,htmlPage,requestImage} from './network';
import {SourceError} from './source-errors';
import type {Work,Chapter,ContentBlock,ReadingContent} from './model';

const BASE='https://kakuyomu.jp';
function numeric(id:string){if(!/^\d{15,22}$/.test(id))throw new Error('作品或章节 ID 无效');return id;}
function state(html:string):Record<string,any>{
 const $=load(html);try{const a=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.__APOLLO_STATE__;if(a&&typeof a==='object')return a;}catch{}
 throw new SourceError('parse_changed','Kakuyomu 页面数据结构已变化','需要更新公开作品解析。');
}
function imagePath(id:string){return '/api/reader-image?'+new URLSearchParams({source:'kakuyomu',kind:'cover',workId:id});}
function coverUrl(raw:string){const u=new URL(raw);if(u.origin!=='https://cdn.kdkw.jp'||!/^\/cover_\d+\/[\w/-]+\.(?:jpe?g|png|webp)$/.test(u.pathname)||u.username||u.password)throw new Error('封面图床尚未核准');return u;}
function work(v:any,a:Record<string,any>):Work{
 const id=numeric(String(v.id));if(v.kakuyomuNextWork||v.isSexual)throw new SourceError('access_denied','此作品不在公开阅读范围','仅接入普通公开作品。',false);
 return {id:'kakuyomu:'+id,source:'kakuyomu',sourceId:id,title:String(v.title||''),originalTitle:String(v.title||''),kind:'novel',cover:v.adminCoverImageUrl?imagePath(id):'',summary:String(v.introduction||v.catchphrase||''),author:String(a[v.author?.__ref]?.name||v.alternateAuthorName||''),tags:['日文原文',...(v.tagLabels||[]).slice(0,6)],url:`${BASE}/works/${id}`,language:'日文原文',readable:true,updated:v.lastEpisodePublishedAt};
}
export function parseKakuList(html:string,page=1){
 const $=load(html),a=state(html),items=new Map<string,Work>();
 $('a[href]').each((_,e)=>{const u=new URL($(e).attr('href')||'',BASE),m=u.pathname.match(/^\/works\/(\d{15,22})$/);if(u.origin!==BASE||!m||items.has(m[1]))return;const v=a['Work:'+m[1]];if(!v?.title||v.kakuyomuNextWork||v.isSexual)return;items.set(m[1],work(v,a));});
 const hasMore=$('a[href]').toArray().some(e=>{const u=new URL($(e).attr('href')||'',BASE);return u.origin===BASE&&Number(u.searchParams.get('page'))===page+1;});
 return {items:[...items.values()],total:items.size+(hasMore?1:0),hasMore};
}
export function parseKakuDetail(id:string,html:string){
 numeric(id);const a=state(html),v=a['Work:'+id];if(!v?.title||String(v.id)!==id)throw new Error('作品详情与 ID 不匹配');const w=work(v,a),chapters:Chapter[]=[],seen=new Set<string>();
 if(!Array.isArray(v.tableOfContentsV2))throw new SourceError('parse_changed','作品未返回完整目录','需要更新来源解析。');
 for(const ref of v.tableOfContentsV2){const group=a[ref.__ref],volume=a[group?.chapter?.__ref]?.title||'';for(const r of group?.episodeUnions||[]){const ep=a[r.__ref];if(!ep||ep.__typename!=='Episode'||!ep.title)continue;const part=numeric(String(ep.id));if(seen.has(part))continue;seen.add(part);chapters.push({id:id+'~'+part,title:[volume,ep.title].filter(Boolean).join(' · '),number:String(chapters.length+1),language:'ja',groups:[{name:w.author||'Kakuyomu 原作者',url:w.url}],pages:0});}}
 if(!chapters.length||chapters.length>20000)throw new Error('作品没有可读取的公开目录');
 if(Number(v.publicEpisodeCount)!==chapters.length)throw new SourceError('parse_changed','作品目录未完整返回','暂不开始阅读，以免遗漏章节。');
 return {work:w,chapters,cover:v.adminCoverImageUrl?coverUrl(v.adminCoverImageUrl).href:''};
}
async function detail(id:string){numeric(id);return cached('kaku:detail:'+id,async()=>parseKakuDetail(id,(await htmlPage(new URL('/works/'+id,BASE))).html));}
export async function kakuSearch(q:string,page:number){if(/^\d{15,22}$/.test(q))return {items:[(await detail(q)).work],total:1,hasMore:false};const u=new URL(q?'/search':'/rankings/all/weekly',BASE);u.searchParams.set('page',String(page));if(q)u.searchParams.set('q',q);return parseKakuList((await htmlPage(u)).html,page);}
export async function kakuWork(id:string){return (await detail(id)).work;}
export async function kakuChapters(id:string,page:number){const all=(await detail(id)).chapters;return {items:all.slice((page-1)*100,page*100),total:all.length};}
export function parseKakuBody(html:string,workId:string,episodeId:string):ContentBlock[]{
 const $=load(html),expected=`${BASE}/works/${numeric(workId)}/episodes/${numeric(episodeId)}`;if($('link[rel=canonical]').attr('href')!==expected)throw new Error('正文与作品章节不匹配');
 const body=$('.widget-episodeBody');if(!body.length)throw new SourceError('parse_changed','未返回公开章节正文','请检查来源阅读权限。');body.find('rt,rp').remove();
 const blocks=richText(body.html()||'',expected,()=>false) as ContentBlock[];if(!blocks.some(b=>b.type==='text'&&b.text.trim()))throw new Error('公开正文为空');return blocks;
}
export async function kakuContent(id:string,workId:string):Promise<ReadingContent>{
 numeric(workId);if(!id.startsWith(workId+'~'))throw new Error('章节与作品不匹配');const ep=numeric(id.slice(workId.length+1)),d=await detail(workId);if(!d.chapters.some(c=>c.id===id))throw new Error('章节不在公开作品目录中');
 return cached('kaku:body:'+id,async()=>{const sourceUrl=`${BASE}/works/${workId}/episodes/${ep}`,blocks=parseKakuBody((await htmlPage(new URL(sourceUrl))).html,workId,ep);return {blocks,text:blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n\n'),images:[],sourceUrl,attribution:`Kakuyomu · ${d.work.author} · 日文原文`,rightsUrl:d.work.url,notice:'日文原文，未自动翻译。仅提供来源公开章节。'};},60000);
}
export async function kakuImage(p:URLSearchParams){if(p.get('kind')!=='cover')throw new Error('此来源没有章节图片');const d=await detail(numeric(p.get('workId')||''));if(!d.cover)throw new SourceError('not_found','作品没有公开封面','来源使用文字封面。',false,404);return requestImage(coverUrl(d.cover),{Referer:d.work.url});}
