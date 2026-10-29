import {load} from 'cheerio/slim';
/** Parse into data, never executable HTML. Keep image positions between paragraphs.
 * @param {string} html
 * @param {string} baseUrl
 * @param {(url: URL) => boolean} acceptImage
 */
export function richText(html,baseUrl,acceptImage=()=>true){
 const $=load(html);$('script,style,iframe,object,embed,svg,form,button,noscript,.cgo,.ads,.ad,.advertisement').remove();
 const blocks=[];let pending='';
 const flush=()=>{const value=pending.replace(/\u00a0/g,' ').split('\n').map(s=>s.trim()).filter(Boolean).join('\n');if(value)blocks.push({type:'text',text:value});pending='';};
 const walk=node=>{if(node.type==='text'){pending+=node.data||'';return;}const tag=node.name?.toLowerCase();if(tag==='img'){
 flush();let raw=$(node).attr('data-src')||$(node).attr('data-original')||$(node).attr('src');try{const u=new URL(raw||'',baseUrl);if(raw&&['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&acceptImage(u))blocks.push({type:'image',url:u.href,alt:($(node).attr('alt')||'插图').slice(0,200)});}catch{}return;}
 if(tag==='br'){pending+='\n';return;}const boundary=['p','div','section','h1','h2','h3','blockquote','li','figure','figcaption'].includes(tag);if(boundary)flush();for(const child of node.children||[])walk(child);if(boundary)flush();};
 for(const child of $.root()[0]?.children||[])walk(child);flush();return blocks.slice(0,10000);
}
