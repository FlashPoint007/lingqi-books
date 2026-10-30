import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import LZString from 'lz-string';

const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','source-errors','network','manhuagui','lnovel']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace('../../services/content-bridge/richtext.mjs','../services/content-bridge/richtext.mjs').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const gui=await import(path.join(dir,'manhuagui.mjs')),ln=await import(path.join(dir,'lnovel.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
// Original synthetic fixtures; no third-party chapters or image keys in Git.
const data={bid:9001,cid:9002,files:['a.jpg.webp','b.png'],len:2,path:'/ps1/sample/chapter/',sl:{e:1800000000,m:'sample-key'}};
const packed=d=>"}('0.1("+JSON.stringify(d)+").preInit();',62,2,'"+LZString.compressToBase64('SMH|imgData')+"'['dictionary']('|'))";
test('compressed manga manifests remain data, validate identities and retain all pages',()=>{
 const images=gui.parseGuiManifest(packed(data),'9001','9002');assert.equal(images.length,2);assert.equal(new URL(images[0]).origin,'https://i.hamreus.com');assert.match(images[1],/b\.png\?/);
 assert.throws(()=>gui.parseGuiManifest(packed({...data,bid:9003}),'9001','9002'),/不匹配/);
 assert.throws(()=>gui.parseGuiManifest(packed({...data,len:4}),'9001','9002'),/数量/);
 assert.throws(()=>gui.parseGuiManifest(packed({...data,files:['../other.jpg','b.png']}),'9001','9002'),/文件/);
 assert.throws(()=>gui.parseGuiManifest(packed({...data,path:'//evil.test/'}),'9001','9002'),/路径/);
 assert.throws(()=>gui.parseGuiManifest(packed({...data,block_cc:'restricted'}),'9001','9002'),e=>e.code==='access_denied');
 assert.throws(()=>gui.parseGuiManifest('<script>throw Error("execute")</script>','9001','9002'),/结构/);
});
const guiDetail='<div class="book-title"><h1>样本漫画</h1></div><p class="hcover"><img src="https://cf.mhgui.com/cpic/h/9001.jpg"></p><div id="chapter-list-1"><a class="status0" href="/comic/9001/9003.html" title="第二话"></a><a class="status0" href="/comic/9001/9002.html" title="第一话"></a><a class="status0" href="/comic/9999/1.html">别的作品</a></div>';
test('manga catalogs preserve order and reject restricted works',()=>{
 const d=gui.parseGuiDetail('9001',guiDetail);assert.deepEqual(d.chapters.map(c=>c.id),['9001~9002','9001~9003']);
 assert.throws(()=>gui.parseGuiDetail('9001',guiDetail+'<div id="erroraudit_show"></div>'),e=>e.code==='access_denied');
});
const novelDetail='<link rel="canonical" href="https://lnovel.tw/books-9001"><main><article><h1>样本小说</h1><img src="/uploads/sample.jpg"><a href="/books?q[authors_id_eq]=9001">原创作者</a><p>原创简介</p></article><div id="volumes"><div class="accordion-item"><h3 class="accordion-header">第一卷</h3><div class="list-group"><a href="/chapters-9002">第一章</a><a href="/chapters-9002">重复</a><a href="https://evil.test/chapters-9003">跨域</a></div></div></div></main>';
const novelChapter=(body,work='9001')=>'<link rel="canonical" href="https://lnovel.tw/chapters-9002"><nav class="breadcrumb"><a href="/books-'+work+'">作品</a></nav><div id="chaptersShowContent">'+body+'</div>';
test('novel catalogs bind chapters, and rich text keeps illustration position and credits',()=>{
 const d=ln.parseLnDetail('9001',novelDetail);assert.equal(d.chapters.length,1);assert.equal(d.chapters[0].title,'第一卷 · 第一章');assert.equal(d.work.author,'原创作者');
 const blocks=ln.parseLnContent(novelChapter('<p>译者署名。</p><img data-src="/uploads/art.jpg"><script>bad()</script><p>末段。</p>'),'9001','9002');
 assert.deepEqual(blocks.map(b=>b.type),['text','image','text']);assert.match(blocks[1].url,/^https:\/\/lnovel.tw\/uploads\//);assert.ok(!JSON.stringify(blocks).includes('bad()'));
 assert.throws(()=>ln.parseLnContent(novelChapter('<p>正文。</p>','9003'),'9001','9002'),/不匹配/);
 assert.throws(()=>ln.parseLnContent(novelChapter('<img src="https://evil.test/art.jpg">'),'9001','9002'),/图床/);
 assert.throws(()=>ln.parseLnContent(novelChapter('<p>請先登入</p>'),'9001','9002'),e=>e.code==='login_required');
});
test('reader image endpoints validate chapter manifests and indices before upstream image access',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{const u=new URL(url);calls.push(u.href);if(u.href==='https://lnovel.tw/books-9001')return new Response(novelDetail);if(u.pathname==='/chapters-9002')return new Response(novelChapter('<p>署名。</p><img src="/uploads/art.jpg"><p>末段。</p>'));if(u.pathname==='/uploads/art.jpg')return new Response('sample',{headers:{'content-type':'image/jpeg'}});if(u.pathname==='/comic/9001/')return new Response(guiDetail);if(u.pathname==='/comic/9001/9002.html')return new Response(packed(data));if(u.hostname==='i.hamreus.com')return new Response('sample',{headers:{'content-type':'image/webp'}});throw new Error('Unexpected '+u.href);};
 try{const c=await ln.lnContent('9001~9002','9001');assert.match(c.images[0],/^\/api\/reader-image\?/);assert.equal((await ln.lnImage(new URLSearchParams({workId:'9001',id:'9001~9002',index:'0'}))).status,200);await assert.rejects(ln.lnImage(new URLSearchParams({workId:'9001',id:'9001~9002',index:'2'})),/索引/);
 const g=await gui.guiContent('9001~9002','9001');assert.equal(g.images.length,2);assert.equal((await gui.guiImage(new URLSearchParams({workId:'9001',id:'9001~9002',index:'1'}))).status,200);const before=calls.length;await assert.rejects(gui.guiImage(new URLSearchParams({workId:'9001',id:'9001~9002',index:'99'})),/索引/);await assert.rejects(gui.guiContent('9001~9999','9001'),/目录/);assert.equal(calls.length,before);
 }finally{globalThis.fetch=original;}
});
