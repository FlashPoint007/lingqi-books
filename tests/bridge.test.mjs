import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'lq-bridge-'));
const dataFile=new URL('../services/content-bridge/data/test-catalog.json',import.meta.url);
const config={sources:[{id:'test',name:'测试授权目录',kind:'novel',type:'catalog',site:'https://example.org/',rightsUrl:'https://example.org/license',attribution:'测试作者',file:'test-catalog.json'}]};
const pluginFile=new URL('../services/content-bridge/plugins/test-plugin.mjs',import.meta.url);
await writeFile(pluginFile,`export default {popularNovels:async()=>[{name:'插件测试',path:'/novel'}],searchNovels:async()=>[{name:'插件测试',path:'/novel'}],parseNovel:async()=>({chapters:[{name:'序章',path:'/chapter'}]}),parseChapter:async()=>'<script>bad()</script><p>安全正文</p><img src="/art.jpg" alt="插图"><p>第二段</p>'};`);
config.sources.push({id:'plugin',name:'测试插件',kind:'novel',type:'lnreader',module:'test-plugin.mjs',site:'https://example.org/',rightsUrl:'https://example.org/rights',attribution:'插件测试作者'});
await writeFile(dataFile,JSON.stringify([{id:'a',title:'测试作品',author:'作者',url:'https://example.org/a',chapters:[{title:'序章',text:'这是测试正文。'},{title:'第二章',text:'故事继续。'}]},{id:'b',title:'其他作品',url:'https://example.org/b',chapters:[]}]));
await writeFile(join(dir,'config.json'),JSON.stringify(config));
process.env.BRIDGE_TOKEN='test-only-token-not-a-real-credential';process.env.BRIDGE_CONFIG=join(dir,'config.json');process.env.BRIDGE_NO_LISTEN='true';
const {createServer}=await import('../services/content-bridge/server.mjs');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
async function call(path,authorized=true){const r=await fetch(origin+path,{headers:authorized?{Authorization:'Bearer '+process.env.BRIDGE_TOKEN}:{}});return {status:r.status,data:await r.json()};}
test('authenticated catalog bridge searches, reads chapters and prevents cross-work reads',async()=>{try{
assert.equal((await call('/v1/sources',false)).status,401);
const sources=await call('/v1/sources');assert.equal(sources.data.sources[0].rightsUrl,'https://example.org/license');assert.equal(sources.data.sources[0].file,undefined);
const search=await call('/v1/search?kind=novel&q=测试&page=1');const work=search.data.items.find(w=>w.source==='test');assert.ok(work);assert.match(work.id,/^[A-Za-z0-9_-]+$/);
const chapters=await call('/v1/chapters?id='+work.id);assert.equal(chapters.data.items.length,2);
const chapter=chapters.data.items[1];const content=await call('/v1/content?'+new URLSearchParams({id:chapter.id,workId:work.id}));assert.equal(content.data.text,'故事继续。');assert.equal(content.data.attribution,'测试作者');
const plugin=search.data.items.find(w=>w.source==='plugin');const pc=(await call('/v1/chapters?id='+plugin.id)).data.items[0];const pt=await call('/v1/content?'+new URLSearchParams({id:pc.id,workId:plugin.id}));assert.equal(pt.data.text,'安全正文\n第二段');assert.ok(!pt.data.text.includes('bad'));assert.deepEqual(pt.data.blocks.map(b=>b.type),['text','image','text']);assert.equal(pt.data.blocks[1].url,'https://example.org/art.jpg');
const other=(await call('/v1/search?kind=novel&q=其他')).data.items.find(w=>w.source==='test');assert.equal((await call('/v1/content?'+new URLSearchParams({id:chapter.id,workId:other.id}))).status,502);
assert.equal((await call('/v1/chapters?id=..%2F..')).status,502);assert.equal((await call('/v1/search?kind=novel&page=-1')).status,502);
}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});await rm(dataFile,{force:true});await rm(pluginFile,{force:true});}});
