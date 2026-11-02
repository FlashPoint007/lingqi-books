import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(new URL('../.reader-test-',import.meta.url));
for(const name of ['model','chinese','source-errors','network','kakuyomu','linovel','dm5','reading-preferences']){
 const source=(await readFile(new URL('../lib/books/'+name+'.ts',import.meta.url),'utf8')).replace('../../services/content-bridge/richtext.mjs','../services/content-bridge/richtext.mjs').replace(/from '\.\/([^']+)'/g,"from './$1.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const k=await import(path.join(dir,'kakuyomu.mjs')),l=await import(path.join(dir,'linovel.mjs')),d=await import(path.join(dir,'dm5.mjs')),prefs=await import(path.join(dir,'reading-preferences.mjs'));
test.after(()=>rm(dir,{recursive:true,force:true}));
// All chapter text and metadata below are original synthetic fixtures.
const wid='12345678901234567890',ep1='12345678901234567891',ep2='12345678901234567892';
function kaku(extra={}){return '<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{__APOLLO_STATE__:{['Work:'+wid]:{id:wid,title:'星の郵便局',author:{__ref:'UserAccount:1'},kakuyomuNextWork:null,publicEpisodeCount:2,tableOfContentsV2:[{__ref:'TableOfContentsChapter:1'}],...extra},'UserAccount:1':{name:'テスト作者'},'TableOfContentsChapter:1':{chapter:{__ref:'Chapter:1'},episodeUnions:[{__ref:'Episode:'+ep2},{__ref:'Episode:'+ep1}]},'Chapter:1':{title:'第一部'},['Episode:'+ep1]:{__typename:'Episode',id:ep1,title:'後半'},['Episode:'+ep2]:{__typename:'Episode',id:ep2,title:'前半'}}}}})+'</script>';}
test('Kakuyomu preserves long IDs and explicit TOC order, and refuses incomplete or subscription catalogs',()=>{
 const v=k.parseKakuDetail(wid,kaku());assert.equal(v.work.sourceId,wid);assert.equal(v.work.language,'日文原文');assert.equal(v.work.author,'テスト作者');assert.deepEqual(v.chapters.map(c=>c.id),[wid+'~'+ep2,wid+'~'+ep1]);
 assert.throws(()=>k.parseKakuDetail(wid,kaku({kakuyomuNextWork:{__ref:'paid'}})),e=>e.code==='access_denied');assert.throws(()=>k.parseKakuDetail(wid,kaku({publicEpisodeCount:3})),e=>e.code==='parse_changed');assert.throws(()=>k.parseKakuDetail(wid,kaku({id:ep1})),/不匹配/);
});
test('Japanese text keeps base characters without duplicate ruby pronunciation and binds canonical episode',()=>{
 const body=`<link rel="canonical" href="https://kakuyomu.jp/works/${wid}/episodes/${ep1}"><div class="widget-episodeBody"><p>星<ruby>空<rt>そら</rt><rp>（</rp></ruby>。</p><script>unsafe()</script></div>`;
 const b=k.parseKakuBody(body,wid,ep1);assert.equal(b[0].text,'星空。');assert.equal(JSON.stringify(b).includes('unsafe'),false);assert.throws(()=>k.parseKakuBody(body,wid,ep2),/不匹配/);
});
const ln='<meta property="og:url" content="https://www.linovel.net/book/9901.html"><h1 class="book-title">星空邮局</h1><div class="name"><a>原创作者</a></div><div class="book-cover"><img src="https://rin.linovel.net/cover/9901_sample.jpg!min300jpg"></div><div class="chapter"><a href="/book/9901/9902.html">序章</a><a href="/book/9901/9903.html" class="VIP">权限章</a><a href="/book/9999/9904.html">错书</a></div>';
test('Linovel binds covers and chapter membership and refuses paid content before parsing text',()=>{
 const v=l.parseLinovelDetail('9901',ln);assert.equal(v.work.author,'原创作者');assert.equal(v.chapters.length,2);assert.equal(v.chapters[1].locked,true);
 assert.throws(()=>l.parseLinovelDetail('9901',ln.replace('/cover/9901_','/cover/9999_')),/不匹配/);
 assert.throws(()=>l.parseLinovelBody('<div class="fufei-app-download-hint"></div><div class="article-text">权限章</div>','9901','9903'),e=>e.code==='login_required');
 const b=l.parseLinovelBody('<a href="/book/9901.html">作品</a><div class="article-text"><p>开篇。</p><img src="https://rin.linovel.net/image/sample.jpg"><p>结尾。</p></div>','9901','9902');assert.deepEqual(b.map(b=>b.type),['text','image','text']);
 assert.throws(()=>l.parseLinovelBody('<a href="/book/9999.html">错书</a><div class="article-text">内容</div>','9901','9902'),e=>e.code==='parse_changed');
});
test('Linovel rejects unknown chapters and never requests a locked chapter body',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async u=>{calls.push(new URL(u).pathname);if(new URL(u).pathname==='/book/9901.html')return new Response(ln);throw new Error('Unexpected body request');};
 try{await assert.rejects(l.linovelContent('9901~9903','9901'),e=>e.code==='login_required');await assert.rejects(l.linovelContent('9901~9998','9901'),/目录/);assert.deepEqual(calls,['/book/9901.html']);}finally{globalThis.fetch=original;}
});
const dm='<div class="banner_detail_form"><p class="title">星空漫画<span>9分</span></p><img src="https://mhfm3us.cdndm5.com/9/9901/cover.jpg"></div><div class="detail-list-title"><a class="order">倒序</a></div><div id="chapterlistload"><ul><li><a href="/m9903/">第2话（2P）</a></li><li><a href="/m9902/">第1话（3P）</a></li><li><a href="https://evil.test/m9999/">跨域</a></li></ul></div>';
test('DM5 orders chapter groups for reading and stops at explicit source restrictions',()=>{
 const v=d.parseDmDetail('sample',dm);assert.equal(v.work.title,'星空漫画');assert.equal(v.mid,'9901');assert.deepEqual(v.chapters.map(c=>c.id),['sample~9902','sample~9903']);assert.equal(v.chapters[0].pages,3);
 assert.throws(()=>d.parseDmDetail('sample',dm+'<div class="warning-bar">受限</div>'),e=>e.code==='access_denied');
 const script='var DM5_MID=9901;var DM5_CID=9902;var DM5_IMAGE_COUNT=3;var DM5_VIEWSIGN="fixture";var DM5_VIEWSIGN_DT="fixture-date";';assert.equal(d.parseDmSession(script,'9901','9902').count,3);assert.throws(()=>d.parseDmSession(script,'9909','9902'),/不匹配/);assert.throws(()=>d.parseDmSession(script+'<div class="view-pay-form">权限</div>','9901','9902'),e=>e.code==='login_required');
});
test('DM5 data decoding cannot execute JavaScript or expand to an arbitrary image origin',()=>{
 const packed=root=>"}('"+`var cid=9902;var pix="${root}";var key="abcdef0123456789";var pvalue=["/one.jpg"];`+"',25,0,''.split('|'))";
 assert.equal(d.parseDmPage(packed('https://manhua1036zjcdn26.cdndm5.com/9/9901/9902'),'9901','9902','9').pathname,'/9/9901/9902/one.jpg');
 assert.throws(()=>d.parseDmPage(packed('https://evil.test/9/9901/9902'),'9901','9902','9'),/核准/);assert.throws(()=>d.parseDmPage(packed('https://manhua1036zjcdn26.cdndm5.com/9/9999/9902'),'9901','9902','9'),/核准/);
 globalThis.dmExecuted=false;assert.throws(()=>d.parseDmPage('globalThis.dmExecuted=true','9901','9902','9'));assert.equal(globalThis.dmExecuted,false);delete globalThis.dmExecuted;
});
test('reading settings migrate old preferences and reject corrupted positions across chapters',()=>{
 assert.deepEqual(prefs.readingPreferences({fontSize:24,theme:'dark',layout:'page'}),{...prefs.DEFAULT_READING_PREFERENCES,fontSize:24,theme:'dark',layout:'page'});
 const v=prefs.readingPreferences({fontSize:Infinity,lineHeight:99,width:-10,theme:'unknown'});assert.equal(v.fontSize,20);assert.equal(v.lineHeight,2.6);assert.equal(v.width,600);assert.equal(v.theme,'paper');
 assert.equal(prefs.readingPosition({key:'chapter-a',ratio:.5},'chapter-b'),undefined);assert.equal(prefs.readingPosition({key:'chapter-a',ratio:NaN},'chapter-a'),undefined);assert.equal(prefs.readingPosition({key:'chapter-a',ratio:.5,anchor:'paragraph-12',offset:.2},'chapter-a').anchor,'paragraph-12');
});

test('DM5 search excludes unrelated recommendations and keeps the real exact result',()=>{const html='<input id="txtKeywords"><div class="banner_detail_form"><p class="title"><a href="/manhua-sample/">星空骑士</a></p></div><div class="mh-list"><div class="mh-item"><h2 class="title"><a href="/manhua-other/">无关漫画</a></h2></div></div>';assert.deepEqual(d.parseDmList(html,1,'星空').items.map(w=>w.sourceId),['sample']);assert.equal(d.parseDmList(html,1,'不存在').items.length,0);});
