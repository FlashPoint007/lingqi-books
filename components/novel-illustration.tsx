'use client';
import {useEffect,useState} from 'react';
import {RotateCw,X,ZoomIn} from 'lucide-react';
export function NovelIllustration({src,alt}:{src:string;alt:string}){
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0),[zoom,setZoom]=useState(false);
 useEffect(()=>{if(!zoom)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setZoom(false);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[zoom]);
 return <figure className="novel-illustration">{failed?<button className="image-error" onClick={()=>{setFailed(false);setLoaded(false);setAttempt(v=>v+1);}}><RotateCw size={18}/>插图加载失败，点击重试</button>:<button className={'illustration-button '+(!loaded?'loading':'')} aria-label={'放大插图 '+alt} onClick={()=>setZoom(true)}><img key={attempt} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/><span><ZoomIn size={16}/> 点击放大</span></button>}{zoom&&<div role="dialog" aria-modal="true" aria-label="插图大图" className="illustration-lightbox" onClick={()=>setZoom(false)}><button autoFocus aria-label="关闭插图" onClick={()=>setZoom(false)}><X/></button><img src={src} alt={alt} referrerPolicy="no-referrer" onClick={e=>e.stopPropagation()}/></div>}</figure>;
}
