'use client';
import {useState,type ReactNode} from 'react';
import {ArrowRight,BookOpen,History,Plus,Search} from 'lucide-react';
import type {Work} from '../lib/books/model';
import type {HistoryItem} from '../lib/books/browser-library';

export function ReadingHistoryView({entries,ready,shelfIds,onResume,onOpen,onAdd,cover,sourceName}:{
 entries:HistoryItem[];ready:boolean;shelfIds:Set<string>;
 onResume:(work:Work)=>void;onOpen:(work:Work)=>void;onAdd:(work:Work)=>void;
 cover:(work:Work)=>ReactNode;sourceName:(work:Work)=>string;
}){
 const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[limit,setLimit]=useState(30);
 const needle=query.normalize('NFKC').trim().toLowerCase();
 const shown=entries.filter(({work})=>(kind==='all'||work.kind===kind)&&(!needle||
  [work.title,work.originalTitle,work.author].some(text=>text?.normalize('NFKC').toLowerCase().includes(needle))));
 return <section className="catalog-section shelf-section history-section" aria-labelledby="history-title">
  <div className="eyebrow">YOUR READING JOURNEY</div>
  <h1 id="history-title">阅读历史 <span className="shelf-count">{entries.length}</span></h1>
  <p className="muted">按最近阅读排序。移出书架后仍保留历史，继续阅读会回到当时的来源、章节与位置。</p>
  <p className="muted">历史保存在当前浏览器；清除网站数据会一并清除。</p>
  <div className="history-controls"><label><Search size={16}/><input aria-label="搜索阅读历史" placeholder="搜索读过的作品或作者…" value={query} onChange={event=>{setQuery(event.target.value);setLimit(30);}}/></label>
   <select aria-label="历史作品类型" value={kind} onChange={event=>{setKind(event.target.value);setLimit(30);}}><option value="all">全部作品</option><option value="novel">轻小说</option><option value="manga">漫画</option></select>
  </div>
  {!ready?<p role="status">正在读取历史…</p>:!shown.length?<div className="empty"><History/><h3>{entries.length?'没有匹配的阅读记录':'从下一页开始，留下你的阅读足迹'}</h3><p>{entries.length?'换个关键词或作品类型试试。':'在线阅读与本地 TXT 的进度会自动记录在这里。'}</p></div>:
   <ol className="history-list">{shown.slice(0,limit).map(({work,progress})=><li key={work.id}>
    <button className="history-cover" onClick={()=>onOpen(work)} aria-label={'查看 '+work.title+' 历史版本'}>{cover(work)}</button>
    <div className="history-info"><div className="book-meta"><span>{work.kind==='manga'?'漫画':'轻小说'}</span><span>{sourceName(work)}</span></div>
     <button className="history-title" onClick={()=>onOpen(work)}>{work.title}</button>
     <p className="history-chapter"><BookOpen size={14}/>{progress.label||'上次阅读位置'}{work.kind==='manga'&&` · 第 ${Math.max(0,progress.page)+1} 页`}</p>
     <time dateTime={new Date(progress.time).toISOString()}>{new Date(progress.time).toLocaleString('zh-CN',{hour12:false})}</time>
    </div>
    <div className="history-actions"><button className="primary" onClick={()=>onResume(work)} aria-label={'继续阅读 '+work.title}>继续阅读<ArrowRight size={15}/></button>
     <button className="text-button" disabled={shelfIds.has(work.id)} onClick={()=>onAdd(work)}>{shelfIds.has(work.id)?'已在书架':<><Plus size={14}/>加入书架</>}</button>
    </div>
   </li>)}</ol>}
  {shown.length>limit&&<div className="pagination"><span>已显示 {limit} / {shown.length} 条</span><button onClick={()=>setLimit(value=>value+30)}>再显示 30 条</button></div>}
 </section>;
}
