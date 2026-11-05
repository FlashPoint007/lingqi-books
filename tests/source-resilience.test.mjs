import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['source-health','source-errors','public-cache']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {createSourceHealth,sourceRequestSignal}=await import(path.join(dir,'source-health.mjs'));
const {SourceError,retryAfterSeconds}=await import(path.join(dir,'source-errors.mjs'));
const {runWithPublicCache,cachedPublicCatalog,cachedPublicImage}=await import(path.join(dir,'public-cache.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
const unavailable=()=>Promise.reject(new SourceError('connection_failed','连接失败','稍后重试',true));
test('concurrent failures open one source, cooldown grows, and only one recovery probe runs',async()=>{
 let now=0;const health=createSourceHealth(()=>now,()=>0);
 await Promise.allSettled([health.run('slow',unavailable),health.run('slow',unavailable)]);
 assert.equal(health.status('slow').retryAfter,30);
 let called=false;await assert.rejects(health.run('slow',async()=>{called=true;}),e=>e.code==='source_cooling_down'&&e.retryAfter===30);assert.equal(called,false);
 assert.equal(await health.run('other',async()=>42),42);
 now=30000;let finish;
 const recovery=health.run('slow',()=>new Promise(resolve=>{finish=resolve;}));
 await assert.rejects(health.run('slow',async()=>0),e=>e.code==='source_cooling_down');
 finish('healthy');assert.equal(await recovery,'healthy');assert.equal(health.status('slow'),undefined);
 await health.run('slow',unavailable).catch(()=>{});await health.run('slow',unavailable).catch(()=>{});now+=30000;
 await health.run('slow',unavailable).catch(()=>{});assert.equal(health.status('slow').retryAfter,60);
});
test('valid empty searches and missing works do not trip unrelated discovery; parse errors and 429 do',async()=>{
 let now=100;const health=createSourceHealth(()=>now,()=>0);
 for(let i=0;i<4;i++)await assert.rejects(health.run('book',async()=>{throw new SourceError('not_found','缺少作品','检查地址');}));
 assert.equal(await health.run('book',async()=>({items:[],total:0})).then(x=>x.total),0);assert.equal(health.status('book'),undefined);for(let i=0;i<3;i++)await health.run('restricted-work',async()=>{throw new SourceError('access_denied','单本作品受限','选择其他作品');}).catch(()=>{});assert.equal(health.status('restricted-work'),undefined);
 await health.run('parse',async()=>{throw new SourceError('parse_changed','解析失败','需要更新适配');}).catch(()=>{});assert.equal(health.status('parse').retryAfter,300);
 await health.run('quota',async()=>{throw new SourceError('rate_limited','上游限流','等待',true,429,600);}).catch(()=>{});assert.equal(health.status('quota').retryAfter,600);
 assert.equal(retryAfterSeconds('120'),120);assert.equal(retryAfterSeconds('99999'),1800);assert.equal(retryAfterSeconds('bad'),undefined);
});
test('abandoned recovery leases expire; late successful requests cannot undo newer failures',async()=>{
 let now=0,resolveOld;const health=createSourceHealth(()=>now,()=>0);
 const old=health.run('source',()=>new Promise(resolve=>{resolveOld=resolve;}));
 await health.run('source',async()=>{throw new SourceError('parse_changed','结构变化','更新适配');}).catch(()=>{});
 resolveOld('late');await old;assert.equal(health.status('source').state,'cooling');
 now=300000;let finishFirst;
 const first=health.run('source',()=>new Promise(resolve=>{finishFirst=resolve;}),1000);
 now+=6001;assert.equal(await health.run('source',async()=>'new probe'),'new probe');finishFirst('late probe');await first;assert.equal(health.status('source'),undefined);
});
test('source deadline aborts upstream work and returns a retryable failure without waiting forever',async()=>{
 const health=createSourceHealth();let signal;
 await assert.rejects(health.run('deadline',()=>{signal=sourceRequestSignal();return new Promise(()=>{});},15),e=>e.code==='connection_failed'&&e.retryable);
 assert.equal(signal.aborted,true);assert.equal(sourceRequestSignal(),undefined);
});
function fixture(){
 const records=new Map(),tasks=[];let puts=0,matches=0;
 const cache={async match(request){matches++;const hit=records.get(request.url);if(!hit||hit.until<Date.now())return;return new Response(hit.body,{headers:hit.headers});},async put(request,response){puts++;const body=await response.arrayBuffer();records.set(request.url,{body,headers:[...response.headers],until:Date.now()+Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)[1])*1000});}};
 const ctx={waitUntil:promise=>tasks.push(promise)};
 return {cache,ctx,records,get puts(){return puts;},get matches(){return matches;},async drain(){await Promise.all(tasks.splice(0));},run:(job,headers={})=>runWithPublicCache(new Request('https://books.example/',{headers}),ctx,job,cache)};
}
async function configured(job){const old=process.env.PUBLIC_READING_SOURCES;process.env.PUBLIC_READING_SOURCES='bh3,lnovelapi';try{return await job();}finally{if(old===undefined)delete process.env.PUBLIC_READING_SOURCES;else process.env.PUBLIC_READING_SOURCES=old;}}
test('validated public provider catalogs hit across requests while query, kind, configuration and origin remain isolated',()=>configured(async()=>{
 const f=fixture();let loads=0;const load=async()=>{loads++;return {items:[{id:'sample'}],total:1};};
 const read=(params={q:'sample',page:1,kind:'novel'})=>f.run(()=>cachedPublicCatalog('lnovelapi',params,load));
 assert.equal((await read()).edgeCache,'MISS');await f.drain();assert.equal((await read()).edgeCache,'HIT');assert.equal(loads,1);
 await read({q:'other',page:1,kind:'novel'});await f.drain();assert.equal(loads,2);
 const otherOrigin=await runWithPublicCache(new Request('https://other.example/'),f.ctx,()=>cachedPublicCatalog('lnovelapi',{q:'sample',page:1,kind:'novel'},load),f.cache);assert.equal(otherOrigin.edgeCache,'MISS');await f.drain();assert.equal(loads,3);
 process.env.PUBLIC_READING_SOURCES='bh3';await read();assert.equal(loads,4);assert.equal(f.puts,3);
}));
test('private services, authenticated requests, partial results and failures never populate public catalog cache',()=>configured(async()=>{
 const f=fixture(),load=async()=>({items:[],total:0});
 for(const source of ['bridge','maki','suwayomi','esj'])await f.run(()=>cachedPublicCatalog(source,{},load),{Cookie:'session=private'});
 for(const headers of [{Authorization:'Bearer private'}])await f.run(()=>cachedPublicCatalog('lnovelapi',{},load),headers);
 await f.run(()=>cachedPublicCatalog('lnovelapi',{q:'partial'},async()=>({items:[],total:0,partial:true})));
 await assert.rejects(f.run(()=>cachedPublicCatalog('lnovelapi',{q:'broken'},async()=>{throw new Error('parse failed');})));
 await f.drain();assert.equal(f.puts,0);
 // A valid empty catalog is reusable; it is not a source outage.
 await f.run(()=>cachedPublicCatalog('lnovelapi',{q:'empty'},load));await f.drain();assert.equal((await f.run(()=>cachedPublicCatalog('lnovelapi',{q:'empty'},load))).edgeCache,'HIT');
}));
test('failed cache infrastructure is optional and expired catalogs reload',()=>configured(async()=>{
 const f=fixture();let loads=0;const load=async()=>{loads++;return {items:[],total:0};};
 await f.run(()=>cachedPublicCatalog('lnovelapi',{},load));await f.drain();for(const record of f.records.values())record.until=0;
 await f.run(()=>cachedPublicCatalog('lnovelapi',{},load));await f.drain();assert.equal(loads,2);
 f.cache.match=async()=>{throw new Error('cache unavailable');};f.cache.put=()=>{throw new Error('write unavailable');};
 assert.equal((await f.run(()=>cachedPublicCatalog('lnovelapi',{},load))).total,0);await f.drain();assert.equal(loads,3);
}));
test('public image cache canonicalizes keys, permits manual refresh and excludes private or ticketed images',()=>configured(async()=>{
 const f=fixture();let loads=0;
 const load=async()=>{loads++;return new Response(Uint8Array.from([255,216,255,0]),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=600'}});};
 const read=(url='/api/reader-image?source=bh3&workId=1&id=1~1&index=0')=>f.run(()=>cachedPublicImage(new Request('https://books.example'+url),load));
 const first=await read();assert.equal(first.headers.get('X-Lingqi-Cache'),'MISS');await first.arrayBuffer();await f.drain();
 const second=await read('/api/reader-image?index=0&id=1~1&workId=1&source=bh3');assert.equal(second.headers.get('X-Lingqi-Cache'),'HIT');assert.match(second.headers.get('Cache-Control'),/^private/);await second.arrayBuffer();assert.equal(loads,1);const refreshed=await read('/api/reader-image?index=0&id=1~1&workId=1&source=bh3&_retry=2');assert.equal(refreshed.headers.get('X-Lingqi-Cache'),'MISS');await refreshed.arrayBuffer();await f.drain();assert.equal(loads,2);assert.equal(f.records.size,1);
 await(await read('/api/reader-image?source=komiic&workId=1&id=1~1&index=0')).arrayBuffer();await(await read('/api/content-image?id=private&workId=1&index=0')).arrayBuffer();await f.drain();assert.equal(f.puts,2);
}));
test('oversized, interrupted and error image responses never become successful cache entries',()=>configured(async()=>{
 const f=fixture(),request=new Request('https://books.example/api/reader-image?source=bh3&workId=1&id=1~1&index=0');
 for(const response of [new Response('failure',{status:502}),new Response('cookie',{headers:{'Content-Type':'image/jpeg','Set-Cookie':'private=1'}}),new Response(new Uint8Array(2000001),{headers:{'Content-Type':'image/jpeg'}})]){const r=await f.run(()=>cachedPublicImage(request,async()=>response));await r.arrayBuffer();await f.drain();}
 let controller;const response=new Response(new ReadableStream({start(c){controller=c;c.enqueue(new Uint8Array(20));}}),{headers:{'Content-Type':'image/jpeg'}});
 const r=await f.run(()=>cachedPublicImage(request,async()=>response));controller.error(new Error('upstream cut off'));await assert.rejects(r.arrayBuffer());await f.drain();assert.equal(f.puts,0);
}));
test('a stalled edge lookup cannot hold the public reading request indefinitely',()=>configured(async()=>{
 const f=fixture();f.cache.match=()=>new Promise(()=>{});
 let timer;try{const result=await Promise.race([f.run(()=>cachedPublicCatalog('lnovelapi',{q:'stalled'},async()=>({items:[],total:0}))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('cache held reader indefinitely')),1000);})]);assert.equal(result.total,0);await f.drain();}finally{clearTimeout(timer);}
}));
test('browser preference/session cookies do not disable explicitly anonymous public catalogs',()=>configured(async()=>{
 const f=fixture();let calls=0;const load=async()=>{calls++;return {items:[{id:'public:1'}],total:1};};
 const first=await f.run(()=>cachedPublicCatalog('lnovelapi',{q:'public'},load),{Cookie:'preferences=one'});assert.equal(first.edgeCache,'MISS');await f.drain();
 const next=await f.run(()=>cachedPublicCatalog('lnovelapi',{q:'public'},load),{Cookie:'preferences=two'});assert.equal(next.edgeCache,'HIT');assert.equal(calls,1);
}));
