import {normalizeTitle, type Chapter, type Work} from './model';

export type PreferredSources = Record<string, Work>;

export function preferredSources(value: unknown): PreferredSources {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(-100).filter(([key, work]) =>
    key.includes(':') && work?.readable === true && ['novel', 'manga'].includes(work.kind)
    && typeof work.source === 'string' && !['local', 'bangumi', 'narou'].includes(work.source)
    && typeof work.sourceId === 'string' && work.sourceId.length <= 1500
    && work.id === work.source + ':' + work.sourceId
    && ['title', 'originalTitle', 'author', 'summary', 'cover', 'url', 'language'].every(field => typeof work[field] === 'string')
    && Array.isArray(work.tags) && work.tags.every((tag: unknown) => typeof tag === 'string'),
  ));
}

export function rememberSource(previous: PreferredSources, origin: Work, target: Work): PreferredSources {
  if (origin.kind !== target.kind || !target.readable) return previous;
  const next = {...previous};
  for (const [key, work] of Object.entries(next)) {
    if (work.id === origin.id || work.id === target.id) next[key] = target;
  }
  next[origin.id] = target;
  next[target.id] = target;
  return Object.fromEntries(Object.entries(next).slice(-100));
}

export function preferredWork(work: Work, preferences: PreferredSources) {
  const selected = preferences[work.id];
  return selected?.kind === work.kind ? selected : work;
}

function chapterNumber(value: string | undefined) {
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const digits = '零一二三四五六七八九';
  const units: Record<string, number> = {'十': 10, '百': 100, '千': 1000};
  let total = 0, digit = 0;
  for (const character of value.replace(/〇/g, '零').replace(/两/g, '二')) {
    const position = digits.indexOf(character);
    if (position >= 0) digit = position;
    else if (units[character]) {
      total += (digit || 1) * units[character];
      digit = 0;
    } else return undefined;
  }
  return total + digit;
}

function chapterIdentity(title: string) {
  const normalized = title.normalize('NFKC');
  const number = normalized.match(/第\s*([\d零〇一二两三四五六七八九十百千.]+)\s*[章話话回]/)?.[1]
    || normalized.match(/(?:chapter|chap\.?)\s*(\d+(?:\.\d+)?)/i)?.[1];
  const volume = normalized.match(/第\s*([\d零〇一二两三四五六七八九十百千]+)\s*[卷巻]/)?.[1];
  return {
    title: normalizeTitle(normalized), number: chapterNumber(number), volume: chapterNumber(volume),
    extra: /番外|特典|插[图圖]|illustration|extra|omake/i.test(normalized),
  };
}

export function correspondingChapter(title: string, chapters: Chapter[], kind: Work['kind']): number {
  const origin = chapterIdentity(title);
  const available = chapters.flatMap((chapter, index) => chapter.locked || chapter.externalUrl
    ? [] : [{index, identity: chapterIdentity(chapter.title)}]);
  const exact = available.filter(chapter => chapter.identity.title === origin.title);
  if (origin.title && exact.length === 1 && (kind === 'manga' || origin.title.length >= 4 || origin.volume !== undefined)) {
    return exact[0].index;
  }
  // Chapter indexes can differ across editions. Align only explicit chapter numbers.
  if (origin.number === undefined || origin.extra || (kind === 'novel' && origin.volume === undefined)) return -1;
  const matches = available.filter(({identity}) => !identity.extra && identity.number === origin.number
    && (origin.volume === undefined || identity.volume === origin.volume));
  return matches.length === 1 ? matches[0].index : -1;
}
