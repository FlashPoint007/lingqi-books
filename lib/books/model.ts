export type Source = 'bangumi' | 'mangadex' | 'narou' | 'local' | 'bridge' | 'wenku8' | 'bilinovel' | 'esj' | 'masiro' | 'suwayomi' | 'maki' | 'sfacg' | 'bh3' | 'mangabz';
export type Work = { id:string; source:Source; sourceId:string; title:string; originalTitle:string; kind:'novel'|'manga'; cover:string; summary:string; author:string; tags:string[]; score?:number; votes?:number; url:string; language:string; readable:boolean; provider?:string; updated?:string };
export type Chapter = { id:string; title:string; number:string; language:string; groups:{name:string;url:string}[]; externalUrl?:string; pages:number; locked?:boolean };
export type SourceStatus = {source:string;ok:boolean;message:string;code?:string;hint?:string;retryable?:boolean;httpStatus?:number};
export type Catalog = {items:Work[];total:number;statuses:SourceStatus[];hasMore?:boolean};
export function normalizeTitle(s:string){return s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');}
export function splitText(text:string){
 const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
 const chapters:{title:string;text:string}[]=[];let title='开始阅读',body:string[]=[];
 const flush=()=>{if(body.join('').trim())chapters.push({title,text:body.join('\n').trim()});body=[];};
 for(const line of lines){if(/^\s*(第[零〇一二三四五六七八九十百千万两\d]+[章节卷话回部].{0,60}|(?:序章|序言|楔子|后记|尾声|终章|插曲|番外).{0,40}|chapter\s+\d+.{0,60})\s*$/i.test(line)){flush();title=line.trim();}else body.push(line);}
 flush();return chapters.length?chapters:[{title:'开始阅读',text}];
}

export type ContentBlock = {type:"text";text:string} | {type:"image";url:string;alt:string};
export type ReadingContent = {blocks:ContentBlock[];text?:string;images:string[];sourceUrl:string;attribution:string;rightsUrl:string};
