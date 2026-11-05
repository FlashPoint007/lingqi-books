import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','image-retry','chinese','source-errors','bounded-cache','network','n8novel','komiic']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace('../../services/content-bridge/richtext.mjs','../services/content-bridge/richtext.mjs').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const cn=await import(path.join(dir,'chinese.mjs')),n8=await import(path.join(dir,'n8novel.mjs')),ki=await import(path.join(dir,'komiic.mjs'));
const net=await import(path.join(dir,'network.mjs')),retry=await import(path.join(dir,'image-retry.mjs'));
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
 assert.deepEqual(b.map(x=>x.type),['text','text','image','text']);assert.equal(b[2].url,'https://www.8novel.com/pics/content/9001/a.jpg');assert.ok(!JSON.stringify(b).includes('bad()'));
 assert.throws(()=>n8.parseN8Text('<title>404. 找不到页面</title>'),e=>e.code==='not_found');
});
test('novel image gateway checks the work catalog and image index before fetching files',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{const u=new URL(url);calls.push(u.href);if(u.pathname==='/novelbooks/9001/')return new Response(book);if(u.pathname==='/read/9001/')return new Response(reader);if(u.pathname.startsWith('/txt/'))return new Response('<p>署名。</p><img src="/pics/content/9001/a.jpg"><p>末段。</p>');if(u.pathname==='/pics/content/9001/a.jpg')return new Response(Uint8Array.from([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});throw new Error('Unexpected '+u.href);};
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

test('cold novel cover requests use source-bound filenames without fetching eighteen book catalogs',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,opts)=>{const u=new URL(url);calls.push(u.href);assert.equal(u.href,'https://www.8novel.com/pics/0/9511-sample.jpg');assert.match(opts.headers.Accept,/image\//);return new Response(Uint8Array.from([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});};
 try{n8.parseN8List('<a title="原创封面测试" href="/novelbooks/9511/"><img src="/pics/0/9511-sample.jpg"></a>');const p=new URLSearchParams({kind:'cover',workId:'9511',file:'9511-sample.jpg'});assert.equal((await n8.n8Image(p)).status,200);assert.equal(calls.length,1);for(const file of ['9512-sample.jpg','../9511.jpg','https://evil.test/9511.jpg','9511.jpg?x=1'])await assert.rejects(n8.n8Image(new URLSearchParams({kind:'cover',workId:'9511',file})),/不匹配/);assert.equal(calls.length,1);}finally{globalThis.fetch=original;}
});

test('image requests negotiate images and follow only bounded same-origin redirects',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,opts)=>{const u=new URL(url);calls.push(u.href);assert.match(opts.headers.Accept,/image\/jpeg/);if(u.pathname==='/redirect')return new Response(null,{status:302,headers:{location:'/actual.jpg'}});if(u.pathname==='/external')return new Response(null,{status:302,headers:{location:'https://other-image.test/a.jpg'}});return new Response(Uint8Array.from([255,216,255,0]),{headers:{'content-type':'image/jpg'}});};
 try{const r=await net.requestImage(new URL('https://images.fixture/redirect'));assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(calls.length,2);await assert.rejects(net.requestImage(new URL('https://images.fixture/external'),{'X-Image-Ticket':'synthetic-only'}),e=>e.code==='domain_changed');assert.equal(calls.length,3);assert.ok(calls.every(u=>!u.includes('other-image')));}finally{globalThis.fetch=original;}
});

test('binary images with generic MIME types are accepted only with a supported signature',async()=>{
 const r=await net.imageResponse(new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'application/octet-stream'}}));assert.equal(r.headers.get('content-type'),'image/jpeg');
 await assert.rejects(net.imageResponse(new Response('<html>not an image</html>',{headers:{'content-type':'application/octet-stream'}})),e=>e.code==='invalid_response');
});

test('source image missing files and permissions retain their actual failure reason',async()=>{
 for(const [status,body,code] of [[200,'<title>404.找不到頁面</title>','not_found'],[404,'missing','not_found'],[403,'<title>Just a moment</title>challenge-platform','verification_required'],[429,'limit','rate_limited']])await assert.rejects(net.imageResponse(new Response(body,{status,headers:{'content-type':'text/html'}})),e=>e.code===code);
});

test('manual image retry changes a local gateway URL without changing chapter or signed external URLs',()=>{
 const src='/api/reader-image?source=komiic&workId=9001&id=9001%7E9002&index=1';const u=new URL(retry.imageRetryUrl(src,2),'https://site.test');assert.equal(u.searchParams.get('_retry'),'2');assert.equal(u.searchParams.get('id'),'9001~9002');assert.equal(u.searchParams.get('index'),'1');assert.equal(retry.imageRetryUrl(src,0),src);const signed='https://public.example/a.jpg?signature=synthetic';assert.equal(retry.imageRetryUrl(signed,1),signed);
});
