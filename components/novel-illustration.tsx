'use client';
import {useEffect,useRef,useState} from 'react';
import {RotateCw,X,ZoomIn} from 'lucide-react';
import {imageRetryUrl} from '../lib/books/image-retry';
export function NovelIllustration(props:{src:string;alt:string}){return <Illustration key={props.src} {...props}/>;}
function Illustration({src,alt}:{src:string;alt:string}){
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0),[zoom,setZoom]=useState(false);
 const lightbox=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!zoom)return;const dialog=lightbox.current;dialog?.showModal();return()=>dialog?.close();},[zoom]);
 const imageSrc=imageRetryUrl(src,attempt);
 return <figure className="novel-illustration">{failed?<button className="image-error" onClick={()=>{setFailed(false);setLoaded(false);setAttempt(v=>v+1);}}><RotateCw size={18}/>插图加载失败，点击重试</button>:<button className={'illustration-button '+(!loaded?'loading':'')} aria-label={'放大插图 '+alt} disabled={!loaded} onClick={()=>setZoom(true)}><img key={imageSrc} src={imageSrc} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/><span><ZoomIn size={16}/> {loaded?'点击放大':'正在加载插图…'}</span></button>}{zoom&&<dialog ref={lightbox} aria-label="插图大图" className="illustration-lightbox" onCancel={e=>{e.preventDefault();e.stopPropagation();setZoom(false);}} onClick={e=>{if(e.target===e.currentTarget)setZoom(false);}}><button autoFocus aria-label="关闭插图" onClick={()=>setZoom(false)}><X/></button><img src={imageSrc} alt={alt} referrerPolicy="no-referrer"/></dialog>}</figure>;
}
