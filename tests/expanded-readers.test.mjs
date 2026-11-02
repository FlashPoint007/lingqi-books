import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','chinese','source-errors','network','n8novel','komiic']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace('../../services/content-bridge/richtext.mjs','../services/content-bridge/richtext.mjs').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const cn=await import(path.join(dir,'chinese.mjs')),n8=await import(path.join(dir,'n8novel.mjs')),ki=await import(path.join(dir,'komiic.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
// Original synthetic fixtures. No third-party chapters, tickets or image files.
const book='<li class="h2">星空手記(星空手记)</li><span class="item-info-author">作者: 樣本作者</span><div class="item-cover"><img src="/pics/0/9001.jpg"></div><li class="full_text">原创简介</li><div class="folder"><div class="vol-title"><h3>第一卷 / <span>2</span></h3></div><a class="episode_li" href="/read/9001/?9002">序章</a><a class="episode_li" href="/read/9001/?9003">第一章</a><a class="episode_li" href="/read/9999/?9002">错书</a><a class="episode_li" href="https://evil.test/read/9001/?9004">跨域</a><a class="episode_li" href="/read/9001/?9002">重复</a></div>';
const seed='1234567890'.repeat(12),reader=`<script>var table='9002,9003,${seed}'.split(','); var path='%2f1%2f9001%2f';</script>`;
test('traditional titles and parenthesized aliases match without merging volume suffixes',()=>{
 assert.equal(cn.chineseKey('星空手記！'),cn.chineseKey('星空手记'));
 assert.ok(cn.titleKeys('敗北女角太多了！(敗犬女主太多了！)').includes(cn.chineseKey('败犬女主太多了！')));
 assert.ok(!cn.titleKeys('星空手記(第二卷)').includes(cn.chineseKey('星空手记')));
});
test('novel catalogs bind chapter identities, deduplicate and retain volume order',()=>{
 const d=n8.parseN8Book('9001',book);assert.equal(d.work.author,'樣本作者');assert.deepEqual(d.chapters.map(c=>c.id),['9001~9002','9001~9003']);assert.equal(d.chapters[0].title,'第一卷 · 序章');
 const list=n8.parseN8List('<a title="星空手記" href="/novelbooks/9001">作品</a><a title="重复" href="/novelbooks/9001">作品</a><a title="跨域" href="https://evil.test/novelbooks/1">作品</a>');assert.equal(list.length,1);
});
test('novel static paths are data and require membership in the reader chapter table',()=>{
 const u=n8.n8TextUrl(reader,'9001','9002');assert.equal(u.origin,'https://article.8novel.com');assert.match(u.pathname,/^\/txt\/1\/9001\/9002\d{5}\.html$/);
 assert.throws(()=>n8.n8TextUrl(reader,'9999','9002'),/结构/);assert.throws(()=>n8.n8TextUrl(reader,'9001','9010'),/结构/);
 assert.throws(()=>n8.n8TextUrl('<script>throw Error("execute")</script>','9001','9002'),/结构/);
});
test('novel content preserves illustration positions and paragraphs while removing active markup',()=>{
 const b=n8.parseN8Text('<p>译者署名。<br>第一段。</p><img src="/pics/content/9001/a.jpg"><script>bad()</script><iframe>bad()</iframe><img src="https://evil.test/a.jpg"><p>末段。</p>');
 assert.deepEqual(b.map(x=>x.type),['text','text','image','text']);assert.equal(b[2].url,'https://article.8novel.com/pics/content/9001/a.jpg');assert.ok(!JSON.stringify(b).includes('bad()'));
 assert.throws(()=>n8.parseN8Text('<title>404. 找不到页面</title>'),e=>e.code==='not_found');
});
test('novel image gateway checks the work catalog and image index before fetching files',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{const u=new URL(url);calls.push(u.href);if(u.pathname==='/novelbooks/9001/')return new Response(book);if(u.pathname==='/read/9001/')return new Response(reader);if(u.pathname.startsWith('/txt/'))return new Response('<p>署名。</p><img src="/pics/content/9001/a.jpg"><p>末段。</p>');if(u.pathname==='/pics/content/9001/a.jpg')return new Response('sample',{headers:{'content-type':'image/jpeg'}});throw new Error('Unexpected '+u.href);};
 try{const c=await n8.n8Content('9001~9002','9001');assert.match(c.images[0],/^\/api\/reader-image\?/);assert.equal((await n8.n8Image(new URLSearchParams({workId:'9001',id:'9001~9002',index:'0'}))).status,200);const before=calls.length;await assert.rejects(n8.n8Content('9001~9999','9001'),/目录/);await assert.rejects(n8.n8Content('9999~9002','9001'),/不匹配/);await assert.rejects(n8.n8Image(new URLSearchParams({workId:'9001',id:'9001~9002',index:'3'})),/索引/);assert.equal(calls.length,before);}finally{globalThis.fetch=original;}
});
const rawWork={id:'9001',title:'样本漫画',imageUrl:'https://public.komiic.com/comics/sample.jpg',contentType:'REGULAR',warnings:[],authors:[{name:'样本作者'}],categories:[{name:'冒險'}]};
const chapters=[{id:'9002',type:'chapter',serial:'1',size:2},{id:'9003',type:'chapter',serial:'2',size:2},{id:'9004',type:'book',serial:'1',size:100}];
test('manga readers exclude restricted works and keep chapter and book editions separate',()=>{
 assert.equal(ki.parseKiWork(rawWork).author,'样本作者');assert.throws(()=>ki.parseKiWork({...rawWork,contentType:'H_MANGA'}),e=>e.code==='access_denied');assert.throws(()=>ki.parseKiWork({...rawWork,warnings:['H_MANGA']}),e=>e.code==='access_denied');assert.throws(()=>ki.parseKiWork({...rawWork,imageUrl:'https://evil.test/a.jpg'}),/封面/);
 assert.deepEqual(ki.parseKiChapters('9001',chapters).map(c=>c.id),['9001~9002','9001~9003']);assert.equal(ki.parseKiChapters('9001',[chapters[2]])[0].title,'单行本 第 1 卷');assert.throws(()=>ki.parseKiImages([{kid:'sample-kid-9002'}],2),/数量/);
});
test('manga pages use source tickets on the pinned CDN, validate binary images and hide tickets',async()=>{
 const original=globalThis.fetch,calls=[],kids=['sample-kid-9002','sample-kid-9003'];globalThis.fetch=async(url,opts)=>{const u=new URL(url);calls.push(u.href);if(u.pathname==='/api/query'){const {query,variables}=JSON.parse(opts.body);if(query.includes('comicByIds'))return Response.json({data:{comicByIds:[rawWork],chaptersByComicId:chapters}});if(query.includes('imagesByChapterId'))return Response.json({data:{imagesByChapterId:kids.map(kid=>({kid})),getImageLimit:{limit:300,usage:2}}});if(query.includes('getImageTicket'))return Response.json({data:{getImageTicket:{kid:variables.kid,url:'https://img.komiic.com/comics/sample/000.jpg',ticket:'original-synthetic-fixture',expiresAt:new Date(Date.now()+60000).toISOString()}}});}if(u.origin==='https://img.komiic.com'){assert.equal(opts.headers['X-Image-Ticket'],'original-synthetic-fixture');return new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'application/octet-stream'}});}throw new Error('Unexpected '+u.href);};
 try{const d=await ki.kiContent('9001~9002','9001');assert.equal(d.images.length,2);assert.match(d.images[0],/^\/api\/reader-image\?/);assert.match(d.notice,/298/);assert.ok(!JSON.stringify(d).includes('synthetic-fixture'));assert.equal((await ki.kiImage(new URLSearchParams({workId:'9001',id:'9001~9002',index:'0'}))).headers.get('content-type'),'image/jpeg');const before=calls.length;await assert.rejects(ki.kiContent('9001~9999','9001'),/目录/);await assert.rejects(ki.kiImage(new URLSearchParams({workId:'9001',id:'9001~9002',index:'5'})),/索引/);assert.equal(calls.length,before);assert.throws(()=>ki.kiImageType(new TextEncoder().encode('<html>error</html>')),/有效图片/);}finally{globalThis.fetch=original;}
});
test('exhausted visitor image quota remains a source failure',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(_url,opts)=>{const {query}=JSON.parse(opts.body);return Response.json({data:query.includes('comicByIds')?{comicByIds:[{...rawWork,id:'9011'}],chaptersByComicId:chapters.map(c=>({...c,id:String(Number(c.id)+100)}))}:{imagesByChapterId:[{kid:'sample-kid-9002'},{kid:'sample-kid-9003'}],getImageLimit:{limit:300,usage:300}}});};
 try{await assert.rejects(ki.kiContent('9011~9102','9011'),e=>e.code==='rate_limited');}finally{globalThis.fetch=original;}
});
