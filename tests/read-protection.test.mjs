import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['read-protection','bounded-cache']){
 const source=await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8');
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {inspectReadRequest,createReadProtection}=await import(path.join(dir,'read-protection.mjs'));
const {BoundedDataCache}=await import(path.join(dir,'bounded-cache.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
const request=(query='action=status',ip='192.0.2.1',headers={})=>{const r=new Request('https://books.example/api/catalog?'+query,{headers:{'cf-connecting-ip':ip,...headers}});Object.defineProperty(r,'cf',{value:{colo:'TEST'}});return r;};
test('invalid methods, oversized and ambiguous queries stop before upstream work',async()=>{
 const protect=createReadProtection();let calls=0;const dispatch=()=>{calls++;return Response.json({ok:true});};
 for(const r of [new Request('https://books.example/api/catalog',{method:'POST'}),request('q=a&q=b'),request('page=1000'),request('action=unknown'),request('id=x&extra=1'),request('action=detail'),request('q='+('x'.repeat(101))),request('kind=audio'),request('source=__proto__'),request('action=status','192.0.2.1',{'sec-fetch-site':'cross-site'}),request('action=status','192.0.2.1',{origin:'https://hotlink.example'})]){const response=await protect(r,dispatch);assert.ok(response.status>=400);assert.equal(response.headers.get('Cache-Control'),'no-store');await response.text();}
 assert.equal(calls,0);
 assert.equal(inspectReadRequest(new Request('https://books.example/api/reader-image?source=bh3&workId=1&id=2&index=29&_retry=3')).lane,'image');
 assert.equal(inspectReadRequest(new Request('https://books.example/api/reader-image?source=n8novel&workId=9511&kind=cover&file=9511-sample.jpg')).lane,'image');
 assert.equal(inspectReadRequest(new Request('https://books.example/some-page')),undefined);
});
test('aggregate searches cost more, cooldown replenishes and readers have separate budgets',async()=>{
 let time=0,calls=0;const protect=createReadProtection(()=>time),dispatch=()=>{calls++;return Response.json({ok:true});};
 for(let i=0;i<15;i++)assert.equal((await(await protect(request('source=readable'),dispatch)).json()).ok,true);
 const blocked=await protect(request('source=readable'),dispatch);assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'2');assert.equal((await blocked.json()).code,'rate_limited');assert.equal(calls,15);
 const other=await protect(request('source=readable','192.0.2.2'),dispatch);assert.equal(other.status,200);await other.text();
 time=2000;const recovered=await protect(request('source=readable'),dispatch);assert.equal(recovered.status,200);await recovered.text();
});
test('untrusted forwarded IPs cannot obtain fresh buckets outside Cloudflare',async()=>{
 const protect=createReadProtection(()=>0),dispatch=()=>new Response(null);
 for(let i=0;i<15;i++){const r=new Request('https://books.example/api/catalog?source=all',{headers:{'cf-connecting-ip':'192.0.2.'+i,'x-forwarded-for':'192.0.2.'+i}});assert.equal((await protect(r,dispatch)).status,200);}
 assert.equal((await protect(new Request('https://books.example/api/catalog?source=all',{headers:{'cf-connecting-ip':'192.0.2.200'}}),dispatch)).status,429);
});
test('stream bodies retain concurrency slots until cancellation, then readers recover',async()=>{
 const protect=createReadProtection(()=>0),held=[];let calls=0;
 const dispatch=()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));}}));};
 try{
  for(let i=0;i<6;i++)held.push(await protect(request('action=test&source=bh3','192.0.2.'+i),dispatch));
  const blocked=await protect(request('action=test&source=bh3','192.0.2.100'),dispatch);assert.equal(blocked.status,503);assert.equal(calls,6);assert.equal(blocked.headers.get('Retry-After'),'3');
  await held.pop().body.cancel();held.push(await protect(request('action=test&source=bh3','192.0.2.100'),dispatch));assert.equal(held.at(-1).status,200);assert.equal(calls,7);
 }finally{await Promise.all(held.map(r=>r.body.cancel()));}
});
test('bounded cache evicts least recently used data, rejects oversized entries and expires data',()=>{
 const cache=new BoundedDataCache(3,80,60);cache.set('a','1234567890',10000);cache.set('b','1234567890',10000);cache.set('c','1234567890',10000);assert.equal(cache.get('a'),'1234567890');cache.set('d','1234567890',10000);assert.equal(cache.get('b'),undefined);assert.equal(cache.get('d'),'1234567890');cache.set('large','x'.repeat(100),10000);assert.equal(cache.get('large'),undefined);cache.set('expired','ok',-1);assert.equal(cache.get('expired'),undefined);
});
