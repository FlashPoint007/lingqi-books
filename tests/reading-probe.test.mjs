import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
const source=await readFile(new URL('../lib/books/reading-probe.ts',import.meta.url),'utf8');
const mocked=source.replace(/import \{([^}]+)\} from '[^']+';/g,(_,names)=>names.split(',').map(name=>`const ${name.trim()}=(...args)=>globalThis.__readingProbeMock.${name.trim()}(...args);`).join('\n'));
await writeFile(path.join(dir,'probe.mjs'),ts.transpileModule(mocked,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {readingProbe}=await import(path.join(dir,'probe.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
const image=()=>new Response(new Uint8Array(2000));
test('rotating discovery rankings need not contain the fixed DM5 reader sample',async()=>{
 globalThis.__readingProbeMock={cached:(_,load)=>load(),dmSearch:async()=>({items:[{sourceId:'another-valid-work'}]}),dmWork:async()=>({title:'sample'}),dmChapters:async()=>({total:1,items:[{id:'chapter'}]}),dmContent:async()=>({images:['page']}),dmImage:async()=>image()};
 try{const result=await readingProbe('dm5');assert.equal(result.validation.imageBytes,2000);assert.equal(result.statuses[0].ok,true);}
 finally{delete globalThis.__readingProbeMock;}
});
test('missing lnovel illustrations remain explicit warnings without hiding verified text',async()=>{
 globalThis.__readingProbeMock={cached:(_,load)=>load(),lnovelApiSearch:async()=>({items:[{title:'sample'}]}),lnovelApiChapters:async()=>({total:2,items:[{id:'sample~274117'},{id:'sample~274118'}]}),lnovelApiContent:async()=>({text:'原'.repeat(250)}),lnovelApiImage:async params=>{if(params.get('kind')==='cover')return image();throw new Error('来源图片不存在');},sourceFailure:error=>({code:'not_found',message:error.message,httpStatus:404})};
 try{const result=await readingProbe('lnovelapi');assert.equal(result.validation.textCharacters,250);assert.equal(result.validation.coverBytes,2000);assert.equal(result.validation.illustrationBytes,0);assert.equal(result.validation.imageFailures[0].httpStatus,404);assert.match(result.statuses[0].message,/插图检测未通过/);}
 finally{delete globalThis.__readingProbeMock;}
});
