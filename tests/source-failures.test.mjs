import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','source-errors','network','sfacg','public-reading','web-novels','reader-services','bridge','availability','sources']){
 let source=await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8');source=source.replace('../../services/content-bridge/richtext.mjs','../services/content-bridge/richtext.mjs').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const route=(await readFile(new URL('../app/api/catalog/route.ts',import.meta.url),'utf8')).replace(/from '\.\.\/\.\.\/\.\.\/lib\/books\/([^']+)'/g,"from './$1.mjs'");await writeFile(path.join(dir,'catalog.mjs'),ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const novel=await import(path.join(dir,'web-novels.mjs')),network=await import(path.join(dir,'network.mjs')),bridge=await import(path.join(dir,'bridge.mjs')),catalog=await import(path.join(dir,'catalog.mjs'));
const {sourceFailure}=await import(path.join(dir,'source-errors.mjs'));
test.after(async()=>{await rm(dir,{recursive:true,force:true});});
test('error pages distinguish confirmed verification, bare 403, login, rate and missing pages',()=>{
 const url=new URL('https://fixture.example/book');
 for(const [html,status,code] of [['<title>Just a moment...</title>challenge-platform',403,'verification_required'],['<h1>Forbidden</h1>',403,'access_denied'],['<title>登录 - 作品</title><form><input type="password"></form>',200,'login_required'],['<h1>Too many requests</h1>',429,'rate_limited'],['<h1>Not found</h1>',404,'not_found']])assert.throws(()=>network.assertHtmlPage(html,url,status),e=>e.code===code);
 assert.doesNotThrow(()=>network.assertHtmlPage('<title>作品列表</title><a href="/login">登录</a><div>小说目录</div>',url,200));
});
test('403 bodies are inspected, failures are not cached and domain redirects stop before another fetch',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('challenge-platform',{status:403});};
 try{for(let i=0;i<2;i++)await assert.rejects(network.htmlPage(new URL('https://fixture.example/403-body')),e=>e.code==='verification_required'&&!e.retryable);assert.equal(calls,2);globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://other.example/login'}});};await assert.rejects(network.htmlPage(new URL('https://fixture.example/redirect')),e=>e.code==='domain_changed');assert.equal(calls,3);}finally{globalThis.fetch=original;}
});
test('anonymous forum titles cannot become fake novel details; inherited source names are rejected',()=>{
 assert.throws(()=>novel.parseNovelDetail('esj','123','<title>ESJ Forum</title><h1>论坛首页</h1><a href="/login">登录</a>'),e=>e.code==='parse_changed');assert.throws(()=>novel.parseNovelDetail('wenku8','123','<title>轻小说文库</title><h1>登录页面</h1>'),e=>e.code==='parse_changed');assert.equal(novel.parseNovelDetail('esj','123','<div class="book-detail"><h2>有效作品</h2></div>').title,'有效作品');assert.equal(novel.isNovelSource('__proto__'),false);assert.equal(novel.isNovelSource('constructor'),false);
});
test('mapped novel source searches exactly its service and uses the local illustration gateway',async()=>{
 const original=globalThis.fetch;process.env.CONTENT_BRIDGE_URL='https://bridge.fixture';process.env.CONTENT_BRIDGE_TOKEN='fixture-bridge-secret';process.env.NOVEL_BRIDGE_SOURCE_ESJ='esj-account';const calls=[];
 globalThis.fetch=async(url,opts)=>{const u=new URL(url);calls.push(u);assert.equal(u.origin,'https://bridge.fixture');assert.equal(opts.headers.Authorization,'Bearer fixture-bridge-secret');if(u.pathname==='/v1/sources')return Response.json({sources:[{id:'esj-account',name:'ESJ 阅读服务',kind:'novel',language:'zh',rightsUrl:'https://example.org/rights',attribution:'作者'}]});if(u.pathname==='/v1/search'){assert.equal(u.searchParams.get('source'),'esj-account');return Response.json({items:[{id:'opaque-work',source:'esj-account',title:'服务作品',kind:'novel',url:'https://example.org/book',language:'zh',readable:true}],total:1,hasMore:false});}if(u.pathname==='/v1/content')return Response.json({blocks:[{type:'text',text:'段落一'},{type:'image',url:'https://example.org/art.png',alt:'插图'},{type:'text',text:'段落二'}],sourceUrl:'https://example.org/book',rightsUrl:'https://example.org/rights',attribution:'作者'});throw new Error('Unexpected URL');};
 try{const d=await(await catalog.GET(new Request('https://site.example/api/catalog?source=esj&kind=novel&q=故事'))).json();assert.equal(d.statuses[0].ok,true);assert.equal(d.items[0].source,'bridge');assert.equal(d.items[0].provider,'ESJ 阅读服务');const content=await bridge.bridgeContent('chapter','opaque-work');assert.deepEqual(content.blocks.map(b=>b.type),['text','image','text']);assert.match(content.blocks[1].url,/^\/api\/content-image\?/);assert.ok(!JSON.stringify(d).includes('fixture-bridge-secret'));assert.equal(calls.some(u=>u.hostname.includes('esjzone')),false);}finally{globalThis.fetch=original;delete process.env.CONTENT_BRIDGE_URL;delete process.env.CONTENT_BRIDGE_TOKEN;delete process.env.NOVEL_BRIDGE_SOURCE_ESJ;}
});
test('catalog reports missing configuration as a non-retryable failure',async()=>{
 const d=await(await catalog.GET(new Request('https://site.example/api/catalog?source=maki&kind=manga&action=test'))).json();assert.equal(d.statuses[0].ok,false);assert.equal(d.statuses[0].code,'service_not_configured');assert.equal(d.statuses[0].retryable,false);assert.match(d.statuses[0].hint,/配置/);
});
test('existing metadata network errors remain retryable while permission errors do not',()=>{assert.equal(sourceFailure(new Error('来源连接暂时失败，请稍后重试')).retryable,true);assert.equal(sourceFailure(new Error('来源暂不可用（503）')).httpStatus,503);assert.equal(sourceFailure(new Error('来源暂不可用（403）')).retryable,false);assert.equal(sourceFailure(new Error('来源请求过于频繁，请稍后重试')).code,'rate_limited');});
test('parallel chapter images queue instead of rejecting, and failed fetches release their slots',async()=>{
 const original=globalThis.fetch;let active=0,peak=0,calls=0;globalThis.fetch=async url=>{calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;if(new URL(url).pathname==='/failure')throw new Error('fixture transport failure');return new Response('image');};
 try{const results=await Promise.allSettled(Array.from({length:15},(_,i)=>network.request(new URL('https://images.fixture/'+(i===1?'failure':i)))));assert.equal(results.filter(x=>x.status==='fulfilled').length,14);assert.equal(results.filter(x=>x.status==='rejected').length,1);assert.equal(peak,3);assert.equal(calls,15);assert.equal((await network.request(new URL('https://images.fixture/after-failure'))).status,200);}finally{globalThis.fetch=original;}
});
