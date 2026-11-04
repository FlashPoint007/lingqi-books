import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','chinese','n8novel','komiic','source-errors','network','sfacg','mangabz','manhuagui','lnovel','kakuyomu','linovel','dm5','lnovel-api','public-reading']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace('../../services/content-bridge/richtext.mjs','../services/content-bridge/richtext.mjs').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const sf=await import(path.join(dir,'sfacg.mjs')),pub=await import(path.join(dir,'public-reading.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
// These fixtures are original samples; no third-party chapters are stored in Git.
const detail='<h1 class="title"><span class="text">星空邮局<span class="tag">征文标签</span></span></h1><div class="author-name">样本作者</div><p class="introduce">一个原创测试故事。</p><div id="hasTicket"><div class="pic"><img src="http://rs.sfacg.com/sample-cover.jpg"></div></div>';
const toc='<h1 class="story-title">星空邮局</h1><div class="story-catalog"><h3 class="catalog-title">第一卷</h3><div class="catalog-list"><a href="/Novel/910001/10/11/">开篇</a><a href="/Novel/910001/10/11/">重复</a><a href="/Novel/910002/10/11/">其他作品</a><a href="https://evil.test/Novel/910001/10/99/">跨域</a><a href="/vip/c/12/"><span class="icn_vip"></span>会员章</a></div></div>';
const bh='<a href="javascript:enterBookApp(\'样本篇\',\'/book/9001\')"><div class="container" id="9001"><div class="container-title">样本篇</div></div></a>';
test('SF metadata keeps the actual title, labels Chinese originals, and scopes search results',()=>{
 const d=sf.parseSfDetail('910001',detail);assert.equal(d.work.title,'星空邮局');assert.equal(d.work.author,'样本作者');assert.equal(d.coverUrl,'https://rs.sfacg.com/sample-cover.jpg');assert.ok(d.work.tags.includes('中文原创'));assert.match(d.work.cover,/workId=910001/);
 const list=sf.parseSfSearch('<a href="https://book.sfacg.com/Novel/910001">星空邮局</a><a href="/Novel/910001/">重复</a><a href="https://evil.test/Novel/2/">假来源</a>');assert.equal(list.length,1);assert.equal(list[0].sourceId,'910001');
 assert.equal(sf.sfSearchKey('梦 A'),'%u68a6%20A');assert.throws(()=>sf.parseSfDetail('910001','<title>登录</title>'),e=>e.code==='parse_changed');
});
test('SF catalogs discard cross-work links, deduplicate and lock VIP entries',()=>{
 const chapters=sf.parseSfChapters('910001',toc);assert.equal(chapters.length,2);assert.equal(chapters[0].id,'910001~10/11');assert.equal(chapters[0].locked,false);assert.equal(chapters[1].locked,true);assert.equal(chapters[1].id,'910001~vip/12');
 assert.throws(()=>sf.parseSfChapters('910001','<h1>Not a catalog</h1>'),e=>e.code==='parse_changed');
});
test('SF preserves paragraph and illustration order, removes executable HTML and rejects paywalls',()=>{
 const blocks=sf.parseSfContent('<div id="ChapterBody"><p>第一段。</p><img data-original="http://rs.sfacg.com/art.jpg" alt="插画"><script>bad()</script><p>第二段。</p></div>','https://book.sfacg.com/Novel/910001/10/11/');
 assert.deepEqual(blocks.map(b=>b.type),['text','image','text']);assert.equal(blocks[1].url,'https://rs.sfacg.com/art.jpg');assert.ok(!JSON.stringify(blocks).includes('bad()'));
 assert.throws(()=>sf.parseSfContent('<div id="ChapterBody"><img src="https://evil.test/art.jpg"></div>','https://book.sfacg.com/'),/图床/);
 assert.throws(()=>sf.parseSfContent('<div class="pay-section"></div><div id="ChapterBody">付费内容</div>','https://book.sfacg.com/'),e=>e.code==='login_required');
});
test('SF discovery keeps pagination when the next-page control has a numeric label',async()=>{
 const original=globalThis.fetch;process.env.PUBLIC_READING_SOURCES='sfacg';globalThis.fetch=async url=>{const u=new URL(url);assert.equal(u.pathname,'/List/');assert.equal(u.searchParams.get('PageIndex'),'2');return new Response('<ul><li><a href="/Novel/910003/">第二页作品</a></li></ul><li class="pagebarNext"><a href="/List/?PageIndex=3">1</a></li>');};
 try{const d=await pub.publicSearch('sfacg','',2);assert.equal(d.items[0].sourceId,'910003');assert.equal(d.hasMore,true);}finally{globalThis.fetch=original;delete process.env.PUBLIC_READING_SOURCES;}
});
test('official manga catalogs enforce work identity, ordering and image origins',()=>{
 assert.equal(pub.parseBh3Books(bh)[0].sourceId,'9001');assert.throws(()=>pub.parseBh3Books('<h1>首页</h1>'),e=>e.code==='parse_changed');
 const chapters=pub.parseBh3Chapters('9001',JSON.stringify([{bookid:'9001',chapterid:'2',page:'1',title:'第二话'},{bookid:9001,chapterid:1,page:1,title:'第一话'}]));assert.equal(chapters[0].number,'1');
 assert.throws(()=>pub.parseBh3Chapters('9001','[{"bookid":"9002","chapterid":"1","page":1,"title":"错书"}]'),/不匹配/);
 const page=url=>`<img class="lazy comic_img" data-original="${url}">`;
 assert.equal(pub.parseBh3Images('9001','1',page('https://act-webstatic.mihoyo.com/new_static_v2/comic/book/9001/1/0001.jpg')).length,1);
 for(const url of ['https://evil.test/new_static_v2/comic/book/9001/1/a.jpg','https://act-webstatic.mihoyo.com/new_static_v2/comic/book/9002/1/a.jpg'])assert.throws(()=>pub.parseBh3Images('9001','1',page(url)),/不匹配/);
});
test('SF server binds images to verified chapters and refuses VIP before requesting its body',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{const u=new URL(url);calls.push(u.href);if(u.pathname==='/Novel/910001/')return new Response(detail);if(u.pathname.endsWith('/MainIndex/'))return new Response(toc);if(u.pathname==='/Novel/910001/10/11/')return new Response('<div id="ChapterBody"><p>正文。</p><img src="https://rs.sfacg.com/inline.jpg"><p>结尾。</p></div>');if(u.href==='https://rs.sfacg.com/inline.jpg')return new Response('fixture-image',{headers:{'content-type':'image/jpeg'}});throw new Error('Unexpected request: '+u.href);};
 process.env.PUBLIC_READING_SOURCES='sfacg,bh3';
 try{const content=await pub.publicContent('sfacg','910001~10/11','910001');assert.deepEqual(content.blocks.map(b=>b.type),['text','image','text']);assert.match(content.images[0],/^\/api\/reader-image\?/);const img=await pub.publicImage('sfacg',new URLSearchParams({workId:'910001',id:'910001~10/11',index:'0'}));assert.equal(img.headers.get('content-type'),'image/jpeg');
 await assert.rejects(pub.publicContent('sfacg','910001~vip/12','910001'),e=>e.code==='login_required');assert.equal(calls.some(u=>u.includes('/vip/')),false);
 await assert.rejects(pub.publicContent('sfacg','910002~10/11','910001'),/不匹配/);await assert.rejects(pub.publicImage('sfacg',new URLSearchParams({workId:'910001',id:'910001~10/11',index:'1'})),/索引/);
 }finally{globalThis.fetch=original;delete process.env.PUBLIC_READING_SOURCES;}
});
test('official manga serves only chapter-manifest pages, with bounded indices and full page counts',async()=>{
 const original=globalThis.fetch;process.env.PUBLIC_READING_SOURCES='sfacg,bh3';globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname==='/book')return new Response(bh);if(u.pathname==='/book/9001/get_chapter')return new Response('[{"bookid":"9001","chapterid":"1","page":"1","title":"第一话"}]');if(u.pathname==='/book/9001/1')return new Response('<img class="lazy comic_img" data-original="https://act-webstatic.mihoyo.com/new_static_v2/comic/book/9001/1/0001.jpg">');if(u.hostname==='act-webstatic.mihoyo.com')return new Response('fixture-image',{headers:{'content-type':'image/jpeg'}});throw new Error('Unexpected request');};
 try{const d=await pub.publicContent('bh3','9001~1','9001');assert.equal(d.images.length,1);assert.match(d.images[0],/^\/api\/reader-image\?/);assert.equal((await pub.publicImage('bh3',new URLSearchParams({workId:'9001',id:'9001~1',index:'0'}))).status,200);await assert.rejects(pub.publicContent('bh3','9001~99','9001'),/目录/);await assert.rejects(pub.publicImage('bh3',new URLSearchParams({workId:'9001',id:'9001~1',index:'99'})),/索引/);
 }finally{globalThis.fetch=original;delete process.env.PUBLIC_READING_SOURCES;}
});
test('disabled public readers fail explicitly instead of returning successful empty catalogs',async()=>{delete process.env.PUBLIC_READING_SOURCES;await assert.rejects(pub.publicSearch('sfacg','',1),e=>e.code==='service_not_configured');assert.equal(pub.isPublicSource('__proto__'),false);});

const bz=await import(path.join(dir,'mangabz.mjs'));
test('MangaBz refuses crossed works, VIP chapters and executable image responses',()=>{
 const session='var MANGABZ_MID=9001;var MANGABZ_CID=9002;var MANGABZ_IMAGE_COUNT=2;var MANGABZ_VIEWSIGN="sample";var MANGABZ_VIEWSIGN_DT="date";';
 assert.equal(bz.parseBzSession(session,'9001','9002').count,2);
 assert.throws(()=>bz.parseBzSession(session,'9003','9002'),/不匹配/);
 assert.throws(()=>bz.parseBzSession('var isVip="True";'+session,'9001','9002'),e=>e.code==='login_required');
 globalThis.bzExecuted=false;
 assert.throws(()=>bz.parseBzPage('globalThis.bzExecuted=true','9001','9002'),/格式/);
 assert.equal(globalThis.bzExecuted,false);delete globalThis.bzExecuted;
 const packed = root=>"}('"+`var pix="${root}";var key='abc123';var pvalue=["/one.jpg"];`.replaceAll("'",String.fromCharCode(92)+"'")+"',25,0,''.split('|'))";
 assert.equal(bz.parseBzPage(packed('https://image.mangabz.com/1/9001/9002'),'9001','9002').hostname,'image.mangabz.com');
 assert.throws(()=>bz.parseBzPage(packed('https://evil.test/1/9001/9002'),'9001','9002'),/不匹配/);
 assert.throws(()=>bz.parseBzPage(packed('https://image.mangabz.com/1/9003/9002'),'9001','9002'),/不匹配/);
});

test('production-blocked novel reader reports the verification reason and is not enabled',async()=>{delete process.env.PUBLIC_READING_SOURCES;assert.equal(pub.publicSourceEnabled('lnovel'),false);await assert.rejects(pub.publicSearch('lnovel','',1),e=>e.code==='verification_required'&&e.retryable===false);});

test('lnovel API binds volumes, chapters and in-order illustrations to the selected work',async()=>{
 const lnovel=await import(path.join(dir,'lnovel-api.mjs'));
 const origin='https://lnovel.animes.garden';
 const cover='http://[2001:db8::1]/bili/files/article/image/9/910040/910040s.jpg';
 const illustration='http://[2001:db8::1]/bili/img3/9/910040/910042/page.jpg';
 const other=origin+'/bili/img3/9/910041/910042/page.jpg';
 const paths=[];
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=new URL(String(input));
  paths.push(url.pathname);
  assert.equal(url.origin,origin);
  const data={
   '/api/bili/novel/910040':{nid:910040,name:'星空邮局',cover,labels:['日本轻小说'],authors:[{name:'测试作者',position:'author'}],volumes:[{nid:910040,vid:910041,title:'第一卷'}]},
   '/api/bili/novel/910040/vol/910041':{nid:910040,vid:910041,chapters:[{nid:910040,vid:910041,cid:910042,title:'邮差'}]},
   '/api/bili/novel/910040/chapter/910042':{nid:910040,vid:910041,cid:910042,images:[{src:illustration},{src:other}],
    content:`<p>一封信。</p><img src="${illustration}"><script>shouldNotRun()</script><img src="${other}"><p>送达。</p>`},
  }[url.pathname];
  if(data)return Response.json({ok:true,provider:'bilinovel',data});
  assert.ok([origin+new URL(illustration).pathname,origin+new URL(cover).pathname].includes(url.href));
  return new Response(Uint8Array.from([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});
 };
 try{
  const catalog=await lnovel.lnovelApiChapters('910040',1);
  assert.equal(catalog.items[0].id,'910040~910041~910042');
  await assert.rejects(lnovel.lnovelApiContent('910040~910041~910043','910040'),/目录/);
  assert.ok(!paths.includes('/api/bili/novel/910040/chapter/910043'));
  const body=await lnovel.lnovelApiContent(catalog.items[0].id,'910040');
  assert.deepEqual(body.blocks.map(block=>block.type),['text','image','text']);
  assert.equal(body.text,'一封信。\n\n送达。');
  const result=await lnovel.lnovelApiImage(new URLSearchParams({workId:'910040',id:catalog.items[0].id,index:'0'}));
  assert.equal(result.headers.get('content-type'),'image/jpeg');
  const image=await lnovel.lnovelApiImage(new URLSearchParams({workId:'910040',kind:'cover'}));
  assert.equal(image.headers.get('content-type'),'image/jpeg');
  await assert.rejects(lnovel.lnovelApiImage(new URLSearchParams({workId:'910040',id:catalog.items[0].id,index:'1'})));
 }finally{globalThis.fetch=oldFetch;}
});

test('lnovel search keeps usable rankings and reports partial coverage when the public index fails',async()=>{
 const lnovel=await import(path.join(dir,'lnovel-api.mjs'));
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=new URL(input);
  assert.equal(url.origin,'https://lnovel.animes.garden');
  if(url.pathname==='/api/bili/novels')return new Response('Unavailable',{status:503});
  assert.match(url.pathname,/^\/api\/bili\/top\/(?:weekvisit|monthvisit)$/);
  return Response.json({ok:true,provider:'bilinovel',data:{items:[{nid:910050,title:'榜单测试故事',author:'样本作者'}]}});
 };
 try{
  const data=await lnovel.lnovelApiSearch('榜单测试',1);
  assert.equal(data.items[0].sourceId,'910050');
  assert.equal(data.partial,true);
 }finally{globalThis.fetch=original;}
});

test('lnovel searches beyond the charts with Chinese normalization, exact titles first and bounded pagination',async()=>{
 const lnovel=await import(path.join(dir,'lnovel-api.mjs'));
 const original=globalThis.fetch;
 const entry=(nid,name,extra={})=>({nid,name,authors:[{name:'測試作者',position:'author'},{name:'插画者',position:'illustrator'}],
  description:'原创测试简介',labels:['日本轻小说'],isDeleted:false,...extra});
 let calls=0;
 globalThis.fetch=async input=>{
  const url=new URL(input);calls++;
  assert.equal(url.href,'https://lnovel.animes.garden/api/bili/novels');
  return Response.json({ok:true,provider:'bilinovel',data:[
   ...Array.from({length:20},(_,i)=>entry(910060+i,'星空郵局 外傳'+i)),
   entry(910090,'星空郵局'),entry(910091,'星空郵局 已移除',{isDeleted:true}),
   entry(910092,'星空郵局 限制版',{labels:['日本轻小说','R18']}),
  ]});
 };
 try{
  const first=await lnovel.lnovelApiSearch('星空邮局',1),second=await lnovel.lnovelApiSearch('星空郵局',2);
  assert.equal(first.items[0].sourceId,'910090');
  assert.equal(first.items[0].author,'測試作者');
  assert.equal(first.items.length,18);assert.equal(first.total,21);assert.equal(first.hasMore,true);
  assert.equal(second.items.length,3);assert.equal(second.hasMore,false);
  assert.equal(new Set([...first.items,...second.items].map(w=>w.id)).size,21);
  const author=await lnovel.lnovelApiSearch('测试作者',1);
  assert.equal(author.total,21);
  assert.equal((await lnovel.lnovelApiSearch('插画者',1)).total,0);
  assert.equal((await lnovel.lnovelApiSearch('不存在的作品',1)).items.length,0);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
