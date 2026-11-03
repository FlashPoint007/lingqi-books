'use client';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ArrowUp,BookOpen,ChevronLeft,ChevronRight,Layers,List,Settings2,X} from 'lucide-react';
import {ReadingSettings} from './reading-settings';
import {readingPalette,readingPosition,type ReadingPosition,type ReadingPreferences} from '../lib/books/reading-preferences';

export type DirectoryEntry={id:string;title:string;locked?:boolean;external?:boolean};
type Props={title:string;chapterTitle:string;positionKey:string;initialPosition?:ReadingPosition;ready:boolean;manga:boolean;mangaQuality?:boolean;entries:DirectoryEntry[];activeId:string;directoryBusy?:boolean;directoryError?:string;onDirectoryRetry:()=>void;onSelect:(id:string)=>void;onPrevious:()=>void;onNext:()=>void;previousDisabled:boolean;nextDisabled:boolean;onExit:()=>void;onPosition:(position:ReadingPosition)=>void;preferences:ReadingPreferences;onPreferences:(preferences:ReadingPreferences)=>void;children:ReactNode;pageControls?:{index:number;count:number;onChange:(index:number)=>void};sourcePanel?:ReactNode;sourceBusy?:boolean;notice?:string;onSourceOpenChange?:(open:boolean)=>void};

function positionAt(el:HTMLDivElement,key:string):ReadingPosition{
 const top=el.getBoundingClientRect().top,anchors=Array.from(el.querySelectorAll<HTMLElement>('[data-reader-anchor]'));
 let node:HTMLElement|undefined;for(const a of anchors){if(a.getBoundingClientRect().top<=top+24)node=a;else break;}
 const rect=node?.getBoundingClientRect();return {key,ratio:Math.max(0,Math.min(1,el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight))),anchor:node?.dataset.readerAnchor,offset:rect?Math.max(0,Math.min(1,(top-rect.top)/Math.max(1,rect.height))):0};
}
export function ReadingFrame(p:Props){
 const shell=useRef<HTMLDialogElement>(null),scroll=useRef<HTMLDivElement>(null),flow=useRef<HTMLDivElement>(null),directory=useRef<HTMLDialogElement>(null),settings=useRef<HTMLDialogElement>(null),sourcePanel=useRef<HTMLDialogElement>(null);
 const [query,setQuery]=useState(''),[directoryPage,setDirectoryPage]=useState(0),[percent,setPercent]=useState(0);
 const latest=useRef(p),desired=useRef<ReadingPosition|undefined>(undefined),restoring=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);latest.current=p;
 function measure(){const el=scroll.current;if(el)setPercent(Math.round(Math.min(1,el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight))*100));}
 function flush(){if(timer.current)clearTimeout(timer.current);const el=scroll.current,v=latest.current;if(!el||!v.ready)return;v.onPosition(restoring.current&&desired.current?desired.current:positionAt(el,v.positionKey));}
 function restore(){const el=scroll.current,v=desired.current;if(!el||!latest.current.ready||!restoring.current)return;if(!v){el.scrollTop=0;measure();return;}const node=v.anchor?Array.from(el.querySelectorAll<HTMLElement>('[data-reader-anchor]')).find(a=>a.dataset.readerAnchor===v.anchor):undefined;if(node){const rect=node.getBoundingClientRect();el.scrollTop+=rect.top-el.getBoundingClientRect().top+rect.height*(v.offset||0);}else el.scrollTop=v.ratio*Math.max(0,el.scrollHeight-el.clientHeight);measure();}
 function navigate(action:()=>void){flush();directory.current?.close();settings.current?.close();sourcePanel.current?.close();action();}
 function changePreferences(prefs:ReadingPreferences){if(scroll.current&&p.ready)desired.current=positionAt(scroll.current,p.positionKey);flush();restoring.current=true;p.onPreferences(prefs);}
 useEffect(()=>{shell.current?.showModal();const save=()=>flush();window.addEventListener('pagehide',save);const visibility=()=>{if(document.visibilityState==='hidden')flush();};document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',visibility);if(timer.current)clearTimeout(timer.current);};},[]);
 useLayoutEffect(()=>{desired.current=readingPosition(p.initialPosition,p.positionKey);restoring.current=true;if(scroll.current)scroll.current.scrollTop=0;setPercent(0);},[p.positionKey]);
 useLayoutEffect(()=>{if(p.ready)restore();},[p.positionKey,p.ready,p.preferences,p.children]);
 useEffect(()=>{const el=flow.current;if(!el)return;const observer=new ResizeObserver(()=>{if(restoring.current)restore();else measure();});observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||directory.current?.open||settings.current?.open||sourcePanel.current?.open||document.querySelector('.illustration-lightbox'))return;const tag=(e.target as HTMLElement)?.tagName;if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)||(e.target as HTMLElement)?.isContentEditable)return;const pages=latest.current.pageControls;if(pages&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();const index=pages.index+(e.key==='ArrowRight'?1:-1);if(index>=0&&index<pages.count){flush();pages.onChange(index);}return;}if(['ArrowDown','ArrowUp'].includes(e.key))restoring.current=false;if(e.key==='ArrowLeft'&&!latest.current.previousDisabled){e.preventDefault();navigate(latest.current.onPrevious);}if(e.key==='ArrowRight'&&!latest.current.nextDisabled){e.preventDefault();navigate(latest.current.onNext);}if([' ','PageDown','PageUp','Home','End'].includes(e.key)){restoring.current=false;e.preventDefault();const el=scroll.current;if(!el)return;if(e.key==='Home')el.scrollTo(0,0);else if(e.key==='End')el.scrollTo(0,el.scrollHeight);else el.scrollBy({top:el.clientHeight*.85*(e.key==='PageUp'?-1:1),behavior:'smooth'});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const activeIndex=p.entries.findIndex(c=>c.id===p.activeId),filtered=p.entries.filter(c=>!query||c.title.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())),pages=Math.max(1,Math.ceil(filtered.length/100)),shown=filtered.slice(directoryPage*100,(directoryPage+1)*100);
 const openDirectory=()=>{setQuery('');setDirectoryPage(Math.max(0,Math.floor(activeIndex/100)));directory.current?.showModal();};
 const palette=readingPalette(p.preferences);
 const readerStyle={
  backgroundColor:palette.background,color:palette.text,
  '--reader-panel':palette.panel,'--reader-ui-text':palette.uiText,'--reader-muted':palette.muted,
  '--reader-border':palette.border,'--reader-accent':palette.accent,
  '--reader-paragraph-spacing':p.preferences.paragraphSpacing+'em','--reader-indent':p.preferences.indent?'2em':'0',
 } as CSSProperties;
 return <dialog ref={shell} style={readerStyle} className={'reader reading-dialog reader-'+p.preferences.theme} aria-label="站内阅读器" onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();navigate(p.onExit);}}>
  <header className="reading-header"><button onClick={()=>navigate(p.onExit)}><ChevronLeft size={18}/><span>书架 / 返回</span></button><div><strong title={p.title}>{p.title}</strong><small>{p.chapterTitle}</small></div><span className="reading-saved">进度自动保存</span></header>
  <div className="reading-progress" role="progressbar" aria-label="本章阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:percent+'%'}}/></div>
  <div className="reader-content" ref={scroll} tabIndex={0} aria-label="章节内容" onWheel={()=>{restoring.current=false;}} onTouchStart={()=>{restoring.current=false;}} onPointerDown={()=>{restoring.current=false;}} onScroll={()=>{measure();if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(flush,700);}}><div ref={flow} className="reading-flow">{p.children}</div></div>
  {p.notice&&<p className="reading-message" role="status">{p.notice}</p>}
  {p.pageControls&&<nav className="reading-pagebar" aria-label="漫画逐页阅读">
   <button disabled={p.pageControls.index===0} onClick={()=>{flush();p.pageControls?.onChange(p.pageControls.index-1);}}><ChevronLeft size={16}/>上一页</button>
   <output aria-live="polite">第 {p.pageControls.index+1} / {p.pageControls.count} 页</output>
   <button disabled={p.pageControls.index+1===p.pageControls.count} onClick={()=>{flush();p.pageControls?.onChange(p.pageControls.index+1);}}>下一页<ChevronRight size={16}/></button>
  </nav>}
  <nav className="reading-dock" aria-label="阅读操作"><button disabled={p.previousDisabled} onClick={()=>navigate(p.onPrevious)}><ChevronLeft size={18}/><span>上一章</span></button><button onClick={openDirectory}><List size={18}/><span>目录</span></button><span className="reading-location">{activeIndex>=0?`${activeIndex+1} / ${p.entries.length} 章`:'目录加载中'}<small>本章 {percent}%</small></span>{p.sourcePanel&&<button aria-label="切换阅读源" onClick={()=>{flush();p.onSourceOpenChange?.(true);sourcePanel.current?.showModal();}}><Layers size={18}/><span>换源</span></button>}<button onClick={()=>settings.current?.showModal()}><Settings2 size={18}/><span>设置</span></button><button disabled={p.nextDisabled} onClick={()=>navigate(p.onNext)}><span>下一章</span><ChevronRight size={18}/></button><button className="reading-top" aria-label="回到章首" onClick={()=>{restoring.current=false;scroll.current?.scrollTo({top:0,behavior:'smooth'});}}><ArrowUp size={18}/></button></nav>
  <dialog ref={directory} className="reading-panel directory-panel" aria-labelledby="reader-directory-title" onCancel={e=>e.stopPropagation()} onClick={e=>{if(e.target===e.currentTarget)directory.current?.close();}}><header><h2 id="reader-directory-title"><List size={18}/>章节目录</h2><button aria-label="关闭章节目录" onClick={()=>directory.current?.close()}><X size={20}/></button></header><p className="reading-panel-note">{p.title} · {p.entries.length} 章</p><input aria-label="搜索章节" placeholder="输入章节名查找…" value={query} onChange={e=>{setQuery(e.target.value);setDirectoryPage(0);}}/><div className="directory-tools"><span>{query?`找到 ${filtered.length} 章`:'按正文顺序排列'}</span><button onClick={()=>{setQuery('');setDirectoryPage(Math.max(0,Math.floor(activeIndex/100)));}}>定位当前章</button></div>{p.directoryBusy&&<p role="status">正在读取完整目录…</p>}{p.directoryError&&<div className="notice error">{p.directoryError}<button onClick={p.onDirectoryRetry}>重新读取目录</button></div>}<ol className="reading-directory" start={directoryPage*100+1}>{shown.map(c=><li key={c.id}><button aria-current={c.id===p.activeId?'true':undefined} disabled={c.locked||c.external} onClick={()=>navigate(()=>p.onSelect(c.id))}><span>{c.title}</span><small>{c.locked?'需要权限':c.external?'暂无站内图片':c.id===p.activeId?'正在读':''}</small></button></li>)}</ol>{!filtered.length&&!p.directoryBusy&&<p>没有匹配的章节</p>}{pages>1&&<div className="directory-pagination"><button disabled={!directoryPage} onClick={()=>setDirectoryPage(x=>x-1)}>前 100 章</button><span>{directoryPage+1} / {pages}</span><button disabled={directoryPage+1>=pages} onClick={()=>setDirectoryPage(x=>x+1)}>后 100 章</button></div>}</dialog>
  {p.sourcePanel&&<dialog ref={sourcePanel} className="reading-panel reader-source-panel" aria-label="切换阅读源"
   onClose={()=>p.onSourceOpenChange?.(false)} onCancel={e=>{e.stopPropagation();if(p.sourceBusy)e.preventDefault();}}>
   <header><h2><Layers size={18}/>换源 · {p.title}</h2><button disabled={p.sourceBusy} aria-label="关闭阅读源选择" onClick={()=>sourcePanel.current?.close()}><X size={20}/></button></header>
   {p.sourcePanel}
  </dialog>}
  <dialog ref={settings} className="reading-panel settings-panel" aria-labelledby="reader-settings-title" onCancel={e=>e.stopPropagation()}>
   <header><h2 id="reader-settings-title"><BookOpen size={18}/>阅读设置</h2><button aria-label="关闭阅读设置" onClick={()=>settings.current?.close()}><X size={20}/></button></header>
   <p className="reading-panel-note">设置与进度保存在当前浏览器</p>
   <ReadingSettings preferences={p.preferences} onChange={changePreferences} manga={p.manga} mangaQuality={p.mangaQuality}/>
   <p className="reading-panel-note reading-shortcuts">{p.pageControls?'← → 翻页':'← → 翻章'} · 空格 / PageDown 向下阅读</p>
  </dialog>
 </dialog>;
}
