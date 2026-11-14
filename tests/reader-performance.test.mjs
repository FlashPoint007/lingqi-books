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


test('scroll manga history stores the visible page instead of a stale page-mode cursor',()=>{
 assert.equal(library.mangaReadingPage({key:'chapter',ratio:.5,anchor:'image-12'},30,0),12);
 assert.equal(library.mangaReadingPage({key:'chapter',ratio:1,anchor:'image-99'},30,0),29);
 assert.equal(library.mangaReadingPage(undefined,30,7),7);
 assert.equal(library.mangaReadingPage({key:'chapter',ratio:0,anchor:'paragraph-8'},30,3),3);
 assert.equal(library.mangaReadingPage(undefined,0,Infinity),0);
});
test('corrupt stored progress cannot override valid history or crash chapter resume',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const valid={chapter:2,page:5,time:100,label:'第三章'};
 const storage=new Map([
  ['lq-progress',JSON.stringify({good:valid,nullEntry:null,fraction:{...valid,chapter:.5},overflow:{...valid,time:1e100}})],
  ['lq-progress:work:good','null'],
  ['lq-progress:work:bad',JSON.stringify({...valid,page:-1})],
  ['lq-progress:work:current',JSON.stringify({...valid,page:9})],
 ]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  get length(){return storage.size;},key:index=>[...storage.keys()][index],getItem:key=>storage.get(key)??null,
 }});
 try{assert.deepEqual(library.loadProgress(),{good:valid,current:{...valid,page:9}});}
 finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
});

function temporaryLibrary(run){
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage=new Map();let fail=false;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return storage.size;},key:index=>[...storage.keys()][index],getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(fail)throw new Error('QuotaExceededError');storage.set(key,value);}}});
 try{return run(storage,()=>{fail=true;});}finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
}
const backupWork={id:'komiic:123',source:'komiic',sourceId:'123',title:'原创备份测试',kind:'manga',originalTitle:'',cover:'',summary:'',author:'',tags:[],url:'',language:'',readable:true};
const backupProgress={chapter:0,page:12,label:'测试章',time:100,mangaChapter:{id:'123~456',title:'测试章',number:'1',language:'zh',groups:[],pages:30},position:{key:'komiic:123:123~456',ratio:.5,anchor:'image-12',offset:.1},work:backupWork};
test('version 2 backup roundtrip restores shelf and removed-book history without TXT bodies',()=>{
 const file=temporaryLibrary(()=>{library.storeShelfItem(backupWork,false);library.storeProgress(backupWork.id,backupProgress);library.storeShelfItem({...backupWork,id:'komiic:124',sourceId:'124'},true);library.storeProgress('komiic:124',{...backupProgress,work:{...backupWork,id:'komiic:124',sourceId:'124'},position:undefined});return library.exportLibraryBackup();});
 temporaryLibrary(()=>{
  const backup=library.parseLibraryBackup(file);assert.deepEqual(library.importLibraryBackup(backup),{added:1,updated:2});
  assert.equal(library.loadShelf().length,1);assert.equal(library.loadHistory().length,2);assert.equal(library.loadProgress()[backupWork.id].page,12);assert.equal(library.loadProgress()[backupWork.id].position.anchor,'image-12');
  assert.deepEqual(library.importLibraryBackup(backup),{added:0,updated:0});
  library.storeShelfItem(backupWork,true);assert.equal(library.loadShelf().length,0);assert.equal(library.loadHistory().length,2);
 });
});
test('backup merge preserves newer current progress and fails atomically on storage quota',()=>temporaryLibrary((storage,fail)=>{
 library.storeProgress(backupWork.id,{...backupProgress,time:200,page:20});
 const data=library.parseLibraryBackup(JSON.stringify({version:2,shelf:[backupWork],progress:{[backupWork.id]:backupProgress}}));
 library.importLibraryBackup(data);assert.equal(library.loadProgress()[backupWork.id].page,20);
 const before=[...storage];fail();assert.throws(()=>library.importLibraryBackup(data),/Quota/);assert.deepEqual([...storage],before);
}));
test('backup validation rejects unsupported versions, mismatched identities and unsafe records',()=>{
 for(const data of [{version:1,shelf:[],progress:{}},{version:2,shelf:[{...backupWork,id:'other:123'}],progress:{}},{version:2,shelf:[backupWork],progress:{[backupWork.id]:{...backupProgress,page:-1}}},{version:2,shelf:[],progress:{['__proto__']:backupProgress}}])assert.throws(()=>library.parseLibraryBackup(JSON.stringify(data)));
 assert.throws(()=>library.parseLibraryBackup('not json'));
 const parsed=library.parseLibraryBackup(JSON.stringify({version:2,shelf:[{...backupWork,url:'javascript:alert(1)',cover:'//evil.test/image'}],progress:{}}));
 assert.equal(parsed.shelf[0].url,'');assert.equal(parsed.shelf[0].cover,'');
});
