import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

test('read APIs remain available during pending framework work, preserve context and reject writes to read APIs',async()=>{
 const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
 try{
  const publicCache=await readFile(new URL('../lib/books/public-cache.ts',import.meta.url),'utf8');
  await writeFile(path.join(dir,'public-cache.mjs'),ts.transpileModule(publicCache,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  const protection=await readFile(new URL('../lib/books/read-protection.ts',import.meta.url),'utf8');
  await writeFile(path.join(dir,'read-protection.mjs'),ts.transpileModule(protection,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  const context=await readFile(new URL('../lib/connector-context.ts',import.meta.url),'utf8');
  await writeFile(path.join(dir,'context.mjs'),ts.transpileModule(context,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  // Simulate a framework request whose lazy initialization never finishes.
  await writeFile(path.join(dir,'framework.mjs'),'export default {fetch(r){return new URL(r.url).pathname==="/pending-page"?new Promise(()=>{}):new Response("framework",{status:202})}};');
  await writeFile(path.join(dir,'api.mjs'),'import {getConnectorBinding} from "./context.mjs";export async function GET(r){return Response.json({path:new URL(r.url).pathname,query:new URL(r.url).search,binding:getConnectorBinding()?.fixture})}');
  let worker=await readFile(new URL('../worker/index.ts',import.meta.url),'utf8');
  worker=worker.replace('"../lib/books/public-cache"','"./public-cache.mjs"').replace('"../lib/books/read-protection"','"./read-protection.mjs"').replace('"vinext/server/fetch-handler"','"./framework.mjs"').replace('"../lib/connector-context"','"./context.mjs"').replace(/"\.\.\/app\/api\/(?:catalog|reader-image|content-image)\/route"/g,'"./api.mjs"').replace('import.meta.env.DEV','false');
  await writeFile(path.join(dir,'worker.mjs'),ts.transpileModule(worker,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  const {default:app}=await import(path.join(dir,'worker.mjs')),ctx={props:{CONNECTORS:{fixture:'request-only'}}};
  void app.fetch(new Request('https://fixture.example/pending-page'),{},ctx);
  for(const route of ['/api/catalog?action=status','/api/reader-image?source=bh3&workId=1&kind=cover','/api/content-image?id=fixture&workId=work&index=0']){
   let timer;try{const response=await Promise.race([app.fetch(new Request('https://fixture.example'+route),{},ctx),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('read API waited on framework initialization')),250);})]);const data=await response.json();assert.equal(data.path,route.split('?')[0]);assert.equal(data.binding,'request-only');}finally{clearTimeout(timer);}
  }
  const post=await app.fetch(new Request('https://fixture.example/api/catalog',{method:'POST'}),{},ctx);assert.equal(post.status,405);await post.text();const frameworkPost=await app.fetch(new Request('https://fixture.example/other-write',{method:'POST'}),{},ctx);assert.equal(frameworkPost.status,202);assert.equal(await frameworkPost.text(),'framework');
  const noBinding=await app.fetch(new Request('https://fixture.example/api/catalog'),{},{props:{}});assert.equal((await noBinding.json()).binding,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});
