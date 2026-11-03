import {PUBLIC_SOURCES,publicSourceEnabled} from './public-reading';
import {bridgeConfigured,novelBridgeSource} from './bridge';
import {serviceConfigured} from './reader-services';
import {type Work,type Chapter} from './model';
import {chineseKey,titleKeys} from './chinese';
import {mangaDexEnabled} from './sources';
import {sourceFailure} from './source-errors';

/** Discovery includes configured readers only; metadata and blocked adapters are
 * deliberately absent. Explicit source diagnostics remain available separately. */
export function readingSources(kind:'novel'|'manga',includeOtherLanguages=false):string[]{
 const direct=Object.entries(PUBLIC_SOURCES).filter(([id,s])=>s.kind===kind&&publicSourceEnabled(id as keyof typeof PUBLIC_SOURCES)).map(([id])=>id);
 if(kind==='manga')return ['mangadex',...(includeOtherLanguages&&mangaDexEnabled('mangadex-en')?['mangadex-en']:[]),...direct,...(['suwayomi','maki'] as const).filter(serviceConfigured)];
 return [...direct,...(bridgeConfigured()?['bridge',...['wenku8','bilinovel','esj','masiro'].filter(s=>!!novelBridgeSource(s))]:[])];
}

export type ReadingCandidate={work:Work;chapterCount:number;firstChapter:Chapter};
type Reader={id:string;search:(query:string)=>Promise<{items:Work[]}>;detail?:(id:string)=>Promise<Work>;chapters:(id:string)=>Promise<{items:Chapter[];total:number}>};
function authorKey(author:string){return !author||/待补充|未知|未标注|unknown/i.test(author)?'':chineseKey(author);}
/** Same-title matches are choices, never silent associations or body guarantees.
 * A catalog must contain an unlocked in-app chapter before a choice is offered. */
export async function findReadingCandidates(metadata:Work, readers:Reader[], manualQuery=''){
 const names = [metadata.title, metadata.originalTitle, ...(metadata.aliases || [])];
 const aliases = names.flatMap(name => {
  const alternate = name.match(/[（(]([^（）()]+)[）)]/);
  if (!alternate || !/[\p{Script=Han}]/u.test(alternate[1]) || /[卷巻册冊]|番外|外傳|外传|文庫版|文库版/.test(alternate[1])) return [name];
  return [name, name.replace(alternate[0], ''), alternate[1]];
 });
 const sorted = [...aliases.filter(name => /[\p{Script=Han}]/u.test(name)), ...aliases.filter(name => !/[\p{Script=Han}]/u.test(name))];
 const queries = [...new Set([manualQuery, ...sorted].map(name => name.trim()).filter(name => name && name.length <= 100))];
 const titleSet = new Set(queries.flatMap(titleKeys));
 const matchesTitle = (work:Work) => [work.title, work.originalTitle, ...(work.aliases || [])]
  .some(name => titleKeys(name).some(key => titleSet.has(key)));
 const results = await Promise.all(readers.map(async reader => {
  try {
   const matches = new Map<string,Work>();
   for (const query of queries.slice(0, 3)) {
    const data = await reader.search(query);
    for (const work of data.items) {
     if (work.kind === metadata.kind && work.readable && matchesTitle(work)) matches.set(work.id, work);
    }
    if (matches.size) break;
   }
   const items: ReadingCandidate[] = [];
   let lastError: unknown;
   for (const match of [...matches.values()].slice(0, 3)) {
    try {
     const work = reader.detail ? await reader.detail(match.sourceId) : match;
     if (work.kind !== metadata.kind || !work.readable || !matchesTitle(work)) continue;
     // Keep same-title original novels by different authors separate.
     if (metadata.kind === 'novel' && (!authorKey(metadata.author) || authorKey(metadata.author) !== authorKey(work.author))) continue;
     const catalog = await reader.chapters(work.sourceId);
     const firstChapter = catalog.items.find(chapter => !chapter.locked && !chapter.externalUrl);
     if (firstChapter) items.push({work, chapterCount: catalog.total, firstChapter});
    } catch (error) {
     lastError = error;
    }
   }
   if (!items.length && lastError) throw lastError;
   return {items, status: {source: reader.id, ok: true, message: items.length ? '已找到同名作品目录' : '未找到同名可读目录'}};
  } catch (error) {
   return {items: [], status: {source: reader.id, ok: false, ...sourceFailure(error)}};
  }
 }));
 return {items: results.flatMap(result => result.items), statuses: results.map(result => result.status), checkedSources: readers.map(reader => reader.id)};
}
