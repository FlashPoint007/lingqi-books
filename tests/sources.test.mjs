import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','source-errors','network','sources']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {splitText,normalizeTitle}=await import(path.join(dir,'model.mjs'));
const {bangumiWork,mangaWork,groupBlocked,upstream,mangaCoverUrl}=await import(path.join(dir,'sources.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
test('UTF8 BOM, CRLF, chapter boundaries preserve actual text',()=>{const r=splitText('\uFEFF序章\r\n雨落在窗外。\r\n第一章 出发\r\n我拿起那本书。\r\n第二章 归来\r\n故事继续。');assert.equal(r.length,3);assert.equal(r[0].title,'序章');assert.equal(r[1].text,'我拿起那本书。');assert.equal(r[2].title,'第二章 归来');});
test('unheaded TXT does not lose content',()=>{assert.deepEqual(splitText('第一行\n第二行'),[{title:'开始阅读',text:'第一行\n第二行'}]);});
test('title matching normalization does not conflate volumes',()=>{assert.equal(normalizeTitle('ＡＢＣ：第一卷'),'abc第一卷');assert.notEqual(normalizeTitle('作品1'),normalizeTitle('作品2'));});
test('Bangumi keeps source ID and score attribution',()=>{const w=bangumiWork({id:42,name:'原題',name_cn:'译名',platform:'漫画',rating:{score:8.3,total:125},infobox:[{key:'作者',value:'甲'}]});assert.equal(w.id,'bangumi:42');assert.equal(w.kind,'manga');assert.equal(w.readable,false);assert.equal(w.votes,125);assert.equal(w.author,'甲');});
test('MangaDex Chinese title and cover relationship normalization',()=>{const w=mangaWork({id:'11111111-1111-4111-8111-111111111111',attributes:{contentRating:'safe',originalLanguage:'ja',title:{en:'Example'},altTitles:[{'zh-hk':'繁體名'}],description:{zh:'简介'},tags:[]},relationships:[{type:'cover_art',attributes:{fileName:'cover.jpg'}},{type:'author',attributes:{name:'作者'}}]});assert.equal(w.title,'繁體名');assert.equal(w.summary,'简介');assert.equal(w.author,'作者');assert.match(w.cover,/^\/api\/reader-image\?/);assert.equal(new URL(w.cover,'https://site.test').searchParams.get('workId'),'11111111-1111-4111-8111-111111111111');});
test('scanlation opt-out prevents group visibility',()=>{process.env.MANGADEX_BLOCKED_GROUPS='a, b';assert.equal(groupBlocked([{type:'scanlation_group',id:'b'}]),true);assert.equal(groupBlocked([{type:'manga',id:'b'}]),false);delete process.env.MANGADEX_BLOCKED_GROUPS;});
test('upstream reuses completed data without waiting on an abandoned request',async()=>{
 const original=globalThis.fetch;let calls=0,finish,timer;
 globalThis.fetch=async(u,opts)=>{calls++;assert.equal(opts.redirect,'manual');return calls===1?new Promise(resolve=>{finish=resolve;}):Response.json({ok:true});};
 const first=upstream('https://example.invalid/test');
 try{assert.deepEqual(await Promise.race([upstream('https://example.invalid/test'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('request reused abandoned IO')),200);})]),{ok:true});assert.deepEqual(await upstream('https://example.invalid/test'),{ok:true});assert.equal(calls,2);}
 finally{clearTimeout(timer);finish(Response.json({ok:true}));await first;globalThis.fetch=original;}
});
test('upstream errors do not become cached successes',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429});};try{await assert.rejects(upstream('https://example.invalid/rate'),/频繁/);await assert.rejects(upstream('https://example.invalid/rate'),/频繁/);assert.equal(calls,2);}finally{globalThis.fetch=original;}});


test('MangaDex cold covers validate the work and derive their fixed CDN path from metadata',async()=>{
 const original=globalThis.fetch,id='22222222-2222-4222-8222-222222222222';let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;assert.equal(new URL(url).origin,'https://api.mangadex.org');assert.match(new URL(url).pathname,new RegExp('/manga/'+id+'$'));return Response.json({data:{id,attributes:{contentRating:'safe',originalLanguage:'ja',title:{en:'Synthetic sample'},tags:[]},relationships:[{type:'cover_art',attributes:{fileName:'sample-cover.jpg'}}]}});};
 try{assert.equal(await mangaCoverUrl(id),`https://uploads.mangadex.org/covers/${id}/sample-cover.jpg.256.jpg`);assert.equal(await mangaCoverUrl(id),`https://uploads.mangadex.org/covers/${id}/sample-cover.jpg.256.jpg`);assert.equal(calls,1);await assert.rejects(mangaCoverUrl('https://evil.test/image.jpg'),/无效/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('MangaDex covers cannot expose restricted works or filename path traversal',async()=>{
 const original=globalThis.fetch,id='33333333-3333-4333-8333-333333333333';
 globalThis.fetch=async()=>Response.json({data:{id,attributes:{contentRating:'pornographic',originalLanguage:'ja'},relationships:[]}});
 try{await assert.rejects(mangaCoverUrl(id),/全年龄/);const work=mangaWork({id,attributes:{contentRating:'safe',originalLanguage:'ja',title:{en:'Synthetic'},tags:[]},relationships:[{type:'cover_art',attributes:{fileName:'../other.jpg'}}]});assert.equal(work.cover,'');}finally{globalThis.fetch=original;}
});
