import {sourceFailure} from '../../../lib/books/source-errors';
import {isPublicSource,publicImage} from '../../../lib/books/public-reading';
import {mangaPageImage,mangaCoverUrl,isMangaDex,mangaDexEnabled} from '../../../lib/books/sources';
import {requestImage} from '../../../lib/books/network';
import {isNovelSource,novelImage} from '../../../lib/books/web-novels';
import {isReaderService,serviceImage} from '../../../lib/books/reader-services';
export async function GET(req:Request){const p=new URL(req.url).searchParams,s=p.get('source')||'';if([...p.values()].some(v=>v.length>2000))return new Response('参数无效',{status:400});try{if(isPublicSource(s))return await publicImage(s,p);if(isMangaDex(s)){
 if(!mangaDexEnabled(s))return new Response('阅读版本尚未启用',{status:400});
 if(p.get('kind')==='cover')return await requestImage(new URL(await mangaCoverUrl(p.get('workId')||'')),{Referer:'https://mangadex.org/'});
 const id=p.get('id')||'',index=Number(p.get('index'));
 if(!/^[0-9a-f-]{36}$/i.test(id)||!p.has('index')||!Number.isInteger(index)||index<0)return new Response('图片参数无效',{status:400});
 return await mangaPageImage(id,index,s,p.get('workId')||'');
}if(isNovelSource(s))return await novelImage(s,p);if(isReaderService(s))return await serviceImage(s,p);return new Response('来源无效',{status:400});}catch(e){const d=sourceFailure(e);console.warn(JSON.stringify({event:'reader_image_failure',source:s,code:d.code,httpStatus:d.httpStatus}));return Response.json({error:d.message,...d},{status:d.code==='not_found'?404:d.code==='rate_limited'?429:502,headers:{'Cache-Control':'no-store','X-Image-Error':d.code}});}}
