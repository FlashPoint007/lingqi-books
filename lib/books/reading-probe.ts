import {sourceFailure} from './source-errors';
import {cached} from './network';
import {n8Search,n8Work,n8Chapters,n8Content,n8Image} from './n8novel';
import {kiSearch,kiWork,kiChapters,kiContent,kiImage} from './komiic';
import {kakuSearch,kakuWork,kakuChapters,kakuContent,kakuImage} from './kakuyomu';
import {linovelSearch,linovelWork,linovelChapters,linovelContent,linovelImage} from './linovel';
import {dmSearch,dmWork,dmChapters,dmContent,dmImage} from './dm5';
/** A bounded end-to-end check of two public sample works. No arbitrary source
 * URLs or image tickets are accepted or returned. Pending readers can be tested
 * on the production node before adding them to PUBLIC_READING_SOURCES. */
export async function readingProbe(source:string){
 if(['kakuyomu','linovel','dm5'].includes(source))return newReaderProbe(source);
 if(source!=='n8novel'&&source!=='komiic')throw new Error('此来源没有固定阅读检测');
 return cached('reading-probe:'+source,async()=>{
  const novel=source==='n8novel',id=novel?'9236':'466';
  const result=await (novel?n8Search('败犬女主太多了',1):kiSearch('膽大黨',1));
  if(!result.items.length)throw new Error('检测未读取到作品列表');
  const work=await (novel?n8Work(id):kiWork(id)),catalog=await (novel?n8Chapters(id,1):kiChapters(id,1)),first=catalog.items.find(c=>!c.locked&&!c.externalUrl);if(!first)throw new Error('检测作品没有可读章节');
  const content=await (novel?n8Content(first.id,id):kiContent(first.id,id));
  let textCharacters=0,imageBytes=0;const warnings:string[]=[],imageFailures:({kind:string;code:string;message:string;httpStatus?:number})[]=[];
  if(novel){const next=catalog.items[1];if(!next)throw new Error('检测目录不完整');const body=await n8Content(next.id,id);textCharacters=(content.text?.length||0)+(body.text?.length||0);if(textCharacters<200)throw new Error('检测正文过短');}
  else{if(!content.images.length)throw new Error('检测章节缺少图片');const r=await kiImage(new URLSearchParams({workId:id,id:first.id,index:'0'}));imageBytes=(await r.arrayBuffer()).byteLength;if(imageBytes<1000)throw new Error('检测图片不完整');}
  let coverBytes=0;try{const cover=await(novel?n8Image(new URLSearchParams({workId:id,kind:'cover'})):kiImage(new URLSearchParams({workId:id,kind:'cover'})));coverBytes=(await cover.arrayBuffer()).byteLength;}catch(e){if(!novel)throw e;const d=sourceFailure(e);imageFailures.push({kind:'cover',code:d.code,message:d.message,httpStatus:d.httpStatus});warnings.push('封面检测未通过：'+d.message);}
  let illustrationBytes=0;if(novel){try{const ill=await n8Image(new URLSearchParams({workId:id,id:id+'~116303',index:'0'}));illustrationBytes=(await ill.arrayBuffer()).byteLength;}catch(e){const d=sourceFailure(e);imageFailures.push({kind:'illustration',code:d.code,message:d.message,httpStatus:d.httpStatus});warnings.push('插图检测未通过：'+d.message);}}
  const validation={workId:id,chapterCount:catalog.total,textCharacters,imageCount:content.images.length,imageBytes,coverBytes,illustrationBytes,warnings,imageFailures,checkedAt:new Date().toISOString()};
  const message=novel?`已验证目录 ${catalog.total} 章及两章正文${warnings.length?'；部分图片检测未通过':'、封面与插图'}`:`已验证目录 ${catalog.total} 章、整章图片列表及真实图片`;
  return {items:[work],total:1,hasMore:false,statuses:[{source,ok:true,message}],validation};
 },600000);
}

async function newReaderProbe(source:string){
 return cached('reading-probe:'+source,async()=>{
  const adapter=source==='kakuyomu'?{id:'16817139555062978831',query:'16817139555062978831',search:kakuSearch,work:kakuWork,chapters:kakuChapters,content:kakuContent,image:kakuImage,novel:true}:source==='linovel'?{id:'101294',query:'白澜',search:linovelSearch,work:linovelWork,chapters:linovelChapters,content:linovelContent,image:linovelImage,novel:true}:{id:'beizhuifangdezhuanshengchongqishiyongyouxizhishikaiwushuang',query:'',search:dmSearch,work:dmWork,chapters:dmChapters,content:dmContent,image:dmImage,novel:false};
  const list=await adapter.search(adapter.query,1);if(!list.items.some(w=>w.sourceId===adapter.id))throw new Error('检测列表未返回样本作品');
  const work=await adapter.work(adapter.id),catalog=await adapter.chapters(adapter.id,1),chapter=catalog.items.find(c=>!c.locked&&!c.externalUrl);if(!chapter)throw new Error('检测作品没有公开章节');
  const content=await adapter.content(chapter.id,adapter.id),textCharacters=content.text?.length||0;if(adapter.novel&&textCharacters<200)throw new Error('检测正文过短');
  let imageBytes=0;if(!adapter.novel){if(!content.images.length)throw new Error('检测章节没有图片');const r=await adapter.image(new URLSearchParams({workId:adapter.id,id:chapter.id,index:'0'}));imageBytes=(await r.arrayBuffer()).byteLength;if(imageBytes<1000)throw new Error('检测页图不完整');}
  const cover=await adapter.image(new URLSearchParams({workId:adapter.id,kind:'cover'})),coverBytes=(await cover.arrayBuffer()).byteLength;if(coverBytes<1000)throw new Error('检测封面不完整');
  return {items:[work],total:1,hasMore:false,statuses:[{source,ok:true,message:`已验证公开目录 ${catalog.total} 章、${adapter.novel?'真实正文':'整章图片列表与首张页图'}和封面`}],validation:{workId:adapter.id,chapterId:chapter.id,chapterCount:catalog.total,textCharacters,imageCount:content.images.length,imageBytes,coverBytes,checkedAt:new Date().toISOString()}};
 },600000);
}
