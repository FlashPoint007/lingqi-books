'use client';

import {useEffect, useRef, useState} from 'react';
import {Check, Layers, RefreshCw, Search} from 'lucide-react';
import {catalogRequest} from '../lib/books/catalog-client';
import type {Work} from '../lib/books/model';
import type {ReadingCandidate} from '../lib/books/reading-discovery';

type Provider = {id: string; name: string; kind: string; readingEnabled: boolean};
type CheckResult = {
  state: 'queued' | 'checking' | 'found' | 'empty' | 'error';
  items: ReadingCandidate[];
  message: string;
  until: number;
};
type Props = {
  work: Work; current: Work; providers: Provider[]; currentCount?: number;
  active?: boolean; busy?: boolean; error?: string; notice?: string;
  onSelect: (candidate: ReadingCandidate) => void; onCancel?: () => void;
};

const completed = new Map<string, CheckResult>();
const queued: CheckResult = {state: 'queued', items: [], message: '等待检测', until: 0};
const labels = {queued: '待检测', checking: '检测中', found: '有目录', empty: '暂无匹配', error: '暂不可用'};

export function ReadingSourcePicker(props: Props) {
  const {work, current, active, providers, busy} = props;
  const [query, setQuery] = useState(''), [input, setInput] = useState('');
  const [onlyFound, setOnlyFound] = useState(false), [expanded, setExpanded] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{scope: string; checks: Record<string, CheckResult>}>({scope: '', checks: {}});
  const enabled = providers.filter(provider => provider.readingEnabled && provider.kind === work.kind);
  const scope = JSON.stringify([work.id, current.id, enabled.map(provider => provider.id), query, revision]);
  const latest = useRef(scope);
  latest.current = scope;
  const refresh = useRef(false);

  useEffect(() => {
    if (active === false) return;
    const controller = new AbortController();
    const key = (source: string) => JSON.stringify([work.id, query, source]);
    const checks: Record<string, CheckResult> = {};
    for (const provider of enabled) {
      if (provider.id === current.source) continue;
      const cached = completed.get(key(provider.id));
      checks[provider.id] = !refresh.current && cached && cached.until > Date.now() ? cached : queued;
    }
    refresh.current = false;
    setResult({scope, checks});
    const pending = enabled.filter(provider => checks[provider.id]?.state === 'queued');
    const update = (source: string, value: CheckResult) => {
      if (controller.signal.aborted || latest.current !== scope) return;
      setResult(previous => previous.scope === scope
        ? {scope, checks: {...previous.checks, [source]: value}} : previous);
    };
    let next = 0;
    const run = async () => {
      while (next < pending.length && !controller.signal.aborted) {
        const provider = pending[next++];
        update(provider.id, {...queued, state: 'checking', message: '正在查找并核对目录…'});
        let checked: CheckResult;
        try {
          const data = await catalogRequest({
            action: 'reading-candidates', source: work.source, id: work.sourceId,
            lookup: work.title.slice(0, 100), kind: work.kind, target: provider.id, q: query,
          }, controller.signal, 60000);
          const items: ReadingCandidate[] = data.items || [];
          const status = data.statuses?.[0];
          checked = {
            state: status?.ok === false ? 'error' : items.length ? 'found' : 'empty',
            items,
            message: status?.ok === false
              ? [status.message, status.hint].filter(Boolean).join('。')
              : items.length ? '找到 ' + items.length + ' 个版本' : '暂未找到同作品可读目录',
            until: Date.now() + 300000,
          };
        } catch (error) {
          checked = {state: 'error', items: [], message: error instanceof Error ? error.message : '来源暂未响应', until: Date.now() + 60000};
        }
        if (controller.signal.aborted) return;
        if (completed.size >= 80) completed.delete(completed.keys().next().value!);
        completed.set(key(provider.id), checked);
        update(provider.id, checked);
      }
    };
    void Promise.all(Array.from({length: Math.min(3, pending.length)}, run));
    return () => controller.abort();
  }, [scope, active]);

  const checks = result.scope === scope ? result.checks : {};
  const found = enabled.filter(p => p.id === current.source || checks[p.id]?.state === 'found').length;
  const pending = enabled.filter(p => p.id !== current.source && ['queued', 'checking'].includes((checks[p.id] || queued).state)).length;
  return <section className="reading-source-picker" aria-label="选择阅读源">
    <div className="source-picker-heading">
      <h3><Layers size={17}/>选择阅读源</h3>
      <button type="button" disabled={busy || active === false || !!pending} aria-label="重新检测阅读源" onClick={() => {refresh.current = true; setRevision(value => value + 1);}}>
        <RefreshCw size={14} className={pending && active !== false ? 'reading-spinner' : ''}/>{active === false ? '等待当前目录' : pending ? '检测中 ' + pending : '重新检测'}
      </button>
    </div>
    <p className="source-picker-note">各源章节和译名可能不同，选择前可以核对作者与版本。</p>
    {props.notice && <p className="source-picker-message" role="status">{props.notice}</p>}
    {props.error && <p className="source-picker-error" role="alert">{props.error}</p>}
    <div className="source-picker-filters">
      <button type="button" aria-pressed={!onlyFound} onClick={() => setOnlyFound(false)}>全部 {enabled.length}</button>
      <button type="button" aria-pressed={onlyFound} onClick={() => setOnlyFound(true)}>有目录 {found}</button>
    </div>
    {!enabled.length && <p role="status">{providers.length ? '暂无已启用的同类阅读源' : '正在读取已启用的来源…'}</p>}
    <div className="source-picker-grid">{enabled.map(provider => {
      const selected = provider.id === current.source;
      const check = checks[provider.id] || queued;
      if (onlyFound && !selected && check.state !== 'found') return null;
      const single = check.items.length === 1 ? check.items[0] : undefined;
      const select = () => single ? props.onSelect(single) : setExpanded(old => old === provider.id ? '' : provider.id);
      return <article key={provider.id} className={'source-choice ' + (selected ? 'is-current' : check.state)}>
        <button type="button" className="source-choice-main" aria-pressed={selected}
          aria-label={selected ? provider.name + '，当前阅读源' : '选择 ' + provider.name + ' 作为阅读源'}
          disabled={busy || selected || check.state !== 'found'} onClick={select}>
          <span className="source-choice-name"><i/>{provider.name}</span>
          <span className="source-choice-status">{selected ? <><Check size={13}/>当前源</> : labels[check.state]}</span>
          <small>{selected ? current.title + (props.currentCount ? ' · ' + props.currentCount + ' 章' : '') : single?.work.title || check.message}</small>
        </button>
        {!selected && single && <p className="source-choice-credit">{single.work.author || '作者未标注'} · {single.work.language} · {single.chapterCount} 章</p>}
        {check.items.length > 1 && expanded === provider.id && <div className="source-choice-versions">{check.items.map(candidate =>
          <button type="button" disabled={busy} key={candidate.work.id} onClick={() => props.onSelect(candidate)}>
            <strong>{candidate.work.title}</strong>
            <small>{candidate.work.author || '作者未标注'} · {candidate.work.language} · {candidate.chapterCount} 章</small>
          </button>,
        )}</div>}
      </article>;
    })}</div>
    {onlyFound && found === 0 && <p role="status">{pending ? '正在检测可读目录…' : '暂无匹配，可以换个译名查找。'}</p>}
    <form className="source-alias-search" onSubmit={event => {event.preventDefault(); setQuery(input.trim()); setExpanded('');}}>
      <label>换个书名查找<input aria-label="换源检索书名" maxLength={100} placeholder={work.title.slice(0, 50)} value={input} onChange={event => setInput(event.target.value)}/></label>
      <button type="submit" disabled={busy}><Search size={14}/>查找</button>
      {query && <button type="button" onClick={() => {setInput(''); setQuery('');}}>清除</button>}
    </form>
    {busy && <div className="source-picker-switching" role="status">正在读取所选来源…<button type="button" onClick={props.onCancel}>取消</button></div>}
  </section>;
}
