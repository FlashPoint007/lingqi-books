import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

test('read APIs remain available during pending framework work, preserve context and leave writes to the framework',async()=>{
 const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
 try{
  const context=await readFile(new URL('../lib/connector-context.ts',import.meta.url),'utf8');
  await writeFile(path.join(dir,'context.mjs'),ts.transpileModule(context,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  // Simulate a framework request whose lazy initialization never finishes.
  await writeFile(path.join(dir,'framework.mjs'),'export default {fetch(r){return new URL(r.url).pathname==="/pending-page"?new Promise(()=>{}):new Response("framework",{status:202})}};');
  await writeFile(path.join(dir,'api.mjs'),'import {getConnectorBinding} from "./context.mjs";export async function GET(r){return Response.json({path:new URL(r.url).pathname,query:new URL(r.url).search,binding:getConnectorBinding()?.fixture})}');
  let worker=await readFile(new URL('../worker/index.ts',import.meta.url),'utf8');
  worker=worker.replace('"vinext/server/fetch-handler"','"./framework.mjs"').replace('"../lib/connector-context"','"./context.mjs"').replace(/"\.\.\/app\/api\/(?:catalog|reader-image|content-image)\/route"/g,'"./api.mjs"').replace('import.meta.env.DEV','false');
  await writeFile(path.join(dir,'worker.mjs'),ts.transpileModule(worker,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  const {default:app}=await import(path.join(dir,'worker.mjs')),ctx={props:{CONNECTORS:{fixture:'request-only'}}};
  void app.fetch(new Request('https://fixture.example/pending-page'),{},ctx);
  for(const route of ['/api/catalog?action=status','/api/reader-image?source=fixture','/api/content-image?id=fixture']){
   let timer;try{const response=await Promise.race([app.fetch(new Request('https://fixture.example'+route),{},ctx),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('read API waited on framework initialization')),250);})]);const data=await response.json();assert.equal(data.path,route.split('?')[0]);assert.equal(data.binding,'request-only');}finally{clearTimeout(timer);}
  }
  const post=await app.fetch(new Request('https://fixture.example/api/catalog',{method:'POST'}),{},ctx);assert.equal(post.status,202);assert.equal(await post.text(),'framework');
  const noBinding=await app.fetch(new Request('https://fixture.example/api/catalog'),{},{props:{}});assert.equal((await noBinding.json()).binding,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});
