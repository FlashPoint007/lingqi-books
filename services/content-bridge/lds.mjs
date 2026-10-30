// Adapter for the LNReader LDS JSON contract. The operator supplies an existing
// service. This module does not solve challenges or obtain login sessions.
export class BridgeError extends Error {constructor(code){super(code);this.code=code;}}
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');const parts=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw new Error('Response too large');}parts.push(value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createLdsPlugin(source){
 const endpoint=new URL(source.endpoint);if(!['https:','http:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('Invalid LDS endpoint');
 const novelPath=path=>{if(!/^\/novel\/\d+\.html$/.test(path))throw new Error('Invalid novel path');return path;};
 const chapterPath=path=>{if(!/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(path))throw new Error('Invalid chapter path');return path;};
 async function call(path,params){const u=new URL(endpoint.href.replace(/\/$/,'')+path);u.search=new URLSearchParams(params).toString();const r=await fetch(u,{headers:{Accept:'application/json',...(source.authorizationEnv?{Authorization:process.env[source.authorizationEnv]||''}:{})},redirect:'manual',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('LDS unavailable');return boundedJson(r);}
 async function parseNovel(path){novelPath(path);const book=await call('/api/novel',{path});if(typeof book.name!=='string'||!book.name.trim()||!Array.isArray(book.chapters)||book.chapters.length>20000)throw new Error('Invalid novel');const id=path.match(/\d+/)[0];for(const chapter of book.chapters){chapterPath(chapter.path);if(!chapter.path.startsWith('/novel/'+id+'/'))throw new Error('Chapter mismatch');}return {...book,path};}
 return {
  // LDS has no popular-list endpoint: ask for a query instead of reporting an
  // empty success or falling back to an origin that has rejected the request.
  popularNovels:async()=>{throw new BridgeError('query_required');},
  searchNovels:async(query,page)=>{if(/^\d{1,12}$/.test(query))return page===1?[await parseNovel('/novel/'+query+'.html')]:[];const data=await call('/api/search',{keyword:query});if(!Array.isArray(data.results)||data.results.length>1000)throw new Error('Invalid search results');for(const book of data.results)novelPath(book.path);return data.results.slice((page-1)*18,page*18);},
  parseNovel,
  parseChapter:async(path)=>{chapterPath(path);const data=await call('/api/chapter',{path});if(typeof data.content!=='string'||data.content.length>1000000)throw new Error('Invalid chapter');return data.content;},
 };
}
