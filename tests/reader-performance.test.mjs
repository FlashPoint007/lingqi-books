import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','reader-cache','catalog-client','browser-library']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {ReaderCache,mayPreload}=await import(path.join(dir,'reader-cache.mjs'));
const {searchCatalog}=await import(path.join(dir,'catalog-client.mjs'));
const library=await import(path.join(dir,'browser-library.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));

test('turning to an in-flight prefetched chapter reuses it after the previous consumer leaves',async()=>{
 const cache=new ReaderCache();let resolve,calls=0;
 const load=async()=>{calls++;return new Promise(done=>{resolve=done;});};
 const old=new AbortController();
 const first=cache.read('next',load,old.signal);
 const rejected=assert.rejects(first,error=>error.name==='AbortError');
 await Promise.resolve();old.abort();
 const second=cache.read('next',load);
 resolve({text:'原创样本'});
 await rejected;assert.equal((await second).text,'原创样本');assert.equal(calls,1);
 assert.equal((await cache.read('next',async()=>{throw new Error('duplicate');})).text,'原创样本');
});

test('failed, invalidated and canceled chapter loads never become reusable completed entries',async()=>{
 const cache=new ReaderCache();let finish;
 await assert.rejects(cache.read('failed',async()=>{throw new Error('temporary');}));
 assert.equal(await cache.read('failed',async()=>42),42);
 const pending=cache.read('abandoned',()=>new Promise(resolve=>{finish=resolve;}));
 const rejected=assert.rejects(pending,error=>error.name==='AbortError');
 await Promise.resolve();cache.cancelPending();finish('late');await rejected;
 assert.equal(cache.get('abandoned'),undefined);
 cache.invalidate('failed');assert.equal(cache.get('failed'),undefined);
 assert.equal(await cache.read('abandoned',async()=>'new work'), 'new work');
});

test('chapter cache bounds entries, total payload and lifetime',async()=>{
 const cache=new ReaderCache(2,20,5);
 cache.set('a','aaaa');cache.set('b','bbbb');cache.get('a');cache.set('c','cccc');
 assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a'),'aaaa');
 cache.set('large','x'.repeat(30));assert.equal(cache.get('large'),undefined);
 cache.set('d','d'.repeat(13));assert.equal(cache.get('a'),undefined);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(cache.get('d'),undefined);
 assert.equal(mayPreload({saveData:true}),false);assert.equal(mayPreload({effectiveType:'2g'}),false);
 assert.equal(mayPreload(undefined,false),false);assert.equal(mayPreload({effectiveType:'4g'}),true);
});

test('history survives shelf removal and page reload and retains the actual edition and manga page',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  get length(){return storage.size;},key:index=>[...storage.keys()][index],
  getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),
 }});
 const novel={id:'lnovelapi:sample',title:'原创测试小说',source:'lnovelapi',kind:'novel'},manga={id:'komiic:sample',title:'原创测试漫画',source:'komiic',kind:'manga'};
 try{
  library.storeShelfItem(novel,false);
  library.storeProgress(novel.id,{chapter:4,page:0,time:1,label:'第五章',novelChapterId:'actual-id',work:novel});
  library.storeShelfItem(novel,true);
  library.storeProgress(manga.id,{chapter:0,page:7,time:2,label:'第20话',work:manga});
  assert.equal(library.loadShelf().length,0);
  const history=library.loadHistory();assert.deepEqual(history.map(item=>item.work.id),[manga.id,novel.id]);
  assert.equal(history[0].progress.page,7);assert.equal(history[1].progress.novelChapterId,'actual-id');
  const progress=library.loadProgress();delete progress[novel.id].work;
  assert.ok(library.loadHistory(progress).some(item=>item.work.id===novel.id));
  assert.equal(library.readingHistory({bad:{...progress[manga.id],time:1e100}},[manga]).length,0);
 }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
});

test('multi-source search emits usable results before a slow provider completes, including split UTF-8 chunks',async()=>{
 const original=globalThis.fetch,encoder=new TextEncoder();let stream,updates=[];
 globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){stream=controller;}}));
 const request=searchCatalog({source:'readable'},new AbortController().signal,data=>updates.push(data));
 await Promise.resolve();
 const early={items:[{id:'fast:1',title:'星空'}],total:1,statuses:[{source:'fast',ok:true}],pendingSources:['slow']};
 const line=encoder.encode(JSON.stringify(early)+'\n');
 const split=line.findIndex(byte=>byte>=224)+1;
 stream.enqueue(line.slice(0,split));stream.enqueue(line.slice(split));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(updates[0].items[0].title,'星空');
 stream.enqueue(encoder.encode(JSON.stringify({...early,pendingSources:[]})+'\n'));stream.close();
 try{assert.equal((await request).pendingSources.length,0);}finally{globalThis.fetch=original;}
});

test('an interrupted search retains delivered partial results and reports unfinished sources',async()=>{
 const original=globalThis.fetch,updates=[];
 globalThis.fetch=async()=>new Response(JSON.stringify({items:[{id:'ok:1'}],total:1,statuses:[],pendingSources:['slow']})+'\n');
 try{await assert.rejects(searchCatalog({source:'readable'},new AbortController().signal,data=>updates.push(data)),/部分来源/);assert.equal(updates[0].items.length,1);}finally{globalThis.fetch=original;}
});
