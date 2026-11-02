export type ReadingPreferences={fontSize:number;lineHeight:number;width:number;fontFamily:'serif'|'sans';theme:'paper'|'white'|'green'|'dark';layout:'scroll'|'page'};
export type ReadingPosition={key:string;ratio:number;anchor?:string;offset?:number};
export const DEFAULT_READING_PREFERENCES:ReadingPreferences={fontSize:20,lineHeight:2,width:780,fontFamily:'serif',theme:'paper',layout:'scroll'};
export function readingPreferences(value:unknown):ReadingPreferences{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const clamp=(key:string,min:number,max:number,fallback:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.min(max,Math.max(min,v[key] as number)):fallback;
 return {fontSize:clamp('fontSize',14,32,20),lineHeight:clamp('lineHeight',1.6,2.6,2),width:clamp('width',600,1000,780),fontFamily:v.fontFamily==='sans'?'sans':'serif',theme:['paper','white','green','dark'].includes(String(v.theme))?v.theme as ReadingPreferences['theme']:'paper',layout:v.layout==='page'?'page':'scroll'};
}
export function readingPosition(value:unknown,key:string):ReadingPosition|undefined{
 if(!value||typeof value!=='object')return;const v=value as Record<string,unknown>;if(v.key!==key||typeof v.ratio!=='number'||!Number.isFinite(v.ratio))return;
 return {key,ratio:Math.max(0,Math.min(1,v.ratio)),anchor:typeof v.anchor==='string'&&/^[a-z]+-\d+$/.test(v.anchor)?v.anchor:undefined,offset:typeof v.offset==='number'&&Number.isFinite(v.offset)?Math.max(0,Math.min(1,v.offset)):0};
}
