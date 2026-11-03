'use client';

import {useEffect, useState} from 'react';
import {
  DEFAULT_READING_PREFERENCES, READING_FONTS, isReadingColor, readingPalette, readableTextColor,
  type ReadingPreferences,
} from '../lib/books/reading-preferences';

const THEMES = [['paper','纸张'], ['white','纯白'], ['green','护眼'], ['dark','夜间'], ['custom','自定义']] as const;

function ColorField({label, value, onChange}: {label: string; value: string; onChange: (color: string) => void}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="reading-color-field"><span>{label}</span>
    <input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)}/>
    <input className="reading-color-hex" aria-label={label + '十六进制'} value={draft} maxLength={7} spellCheck={false}
      onChange={event => {
        const color = event.target.value;
        setDraft(color);
        if (isReadingColor(color)) onChange(color.toLowerCase());
      }}
      onBlur={() => {if (!isReadingColor(draft)) setDraft(value);}}/>
  </div>;
}

export function ReadingSettings({preferences, onChange, manga}: {
  preferences: ReadingPreferences; onChange: (preferences: ReadingPreferences) => void; manga: boolean;
}) {
  const p = preferences;
  const palette = readingPalette(p);
  const update = (patch: Partial<ReadingPreferences>) => onChange({...p, ...patch});
  return <div className="reading-settings-controls">
    <fieldset><legend>阅读背景</legend><div className="theme-options">{THEMES.map(([theme, label]) =>
      <button type="button" key={theme} aria-pressed={p.theme === theme} className={'theme-' + theme} onClick={() => update({theme})}>{label}</button>,
    )}</div></fieldset>
    <div className="reading-colors">
      <ColorField label="背景色" value={palette.background} onChange={backgroundColor => update({theme: 'custom', backgroundColor, textColor: palette.text})}/>
      <ColorField label="文字色" value={palette.text} onChange={textColor => update({theme: 'custom', textColor, backgroundColor: palette.background})}/>
    </div>
    {palette.contrast < 4.5 && <div className="reading-contrast-warning" role="status">
      文字和背景颜色太接近。
      <button type="button" onClick={() => update({theme: 'custom', backgroundColor: palette.background, textColor: readableTextColor(palette.background)})}>自动调整文字颜色</button>
    </div>}
    {manga ? <fieldset><legend>漫画阅读方式</legend><div className="setting-options">
      <button type="button" aria-pressed={p.layout === 'scroll'} onClick={() => update({layout: 'scroll'})}>条漫滚动</button>
      <button type="button" aria-pressed={p.layout === 'page'} onClick={() => update({layout: 'page'})}>逐页阅读</button>
    </div></fieldset> : <>
      <label className="reading-font-select">字体形式<select aria-label="阅读字体" value={p.fontFamily}
        onChange={event => update({fontFamily: event.target.value as ReadingPreferences['fontFamily']})}>
        {Object.entries(READING_FONTS).map(([id, font]) => <option key={id} value={id}>{font.name}</option>)}
      </select></label>
      <p className="reading-panel-note">优先使用设备上已有的字体。</p>
      <label className="reading-range">字号 <output>{p.fontSize} px</output><input aria-label="正文字号" type="range" min={14} max={36} step={1} value={p.fontSize} onChange={event => update({fontSize: Number(event.target.value)})}/></label>
      <label className="reading-range">行距 <output>{p.lineHeight.toFixed(1)} 倍</output><input aria-label="正文行距" type="range" min={1.6} max={2.6} step={0.1} value={p.lineHeight} onChange={event => update({lineHeight: Number(event.target.value)})}/></label>
      <label className="reading-range">段落间距 <output>{p.paragraphSpacing.toFixed(1)} 倍</output><input aria-label="段落间距" type="range" min={0.4} max={2} step={0.05} value={p.paragraphSpacing} onChange={event => update({paragraphSpacing: Number(event.target.value)})}/></label>
      <label className="reading-indent"><input type="checkbox" checked={p.indent} onChange={event => update({indent: event.target.checked})}/>首行缩进两个字</label>
      <fieldset><legend>正文宽度</legend><div className="setting-options">{([[640,'紧凑'], [780,'舒适'], [960,'宽屏']] as const).map(([width, label]) =>
        <button type="button" key={width} aria-pressed={p.width === width} onClick={() => update({width})}>{label}</button>,
      )}</div></fieldset>
      <div className="reading-style-preview" aria-label="阅读排版预览" style={{backgroundColor: palette.background, color: palette.text, fontSize: p.fontSize, fontFamily: READING_FONTS[p.fontFamily].css, lineHeight: p.lineHeight}}>
        <p style={{textIndent: p.indent ? '2em' : 0, marginBottom: p.paragraphSpacing + 'em'}}>把日常，留在书页之外。</p>
        <p style={{textIndent: p.indent ? '2em' : 0}}>下一页，还有新的故事。</p>
      </div>
    </>}
    <button type="button" className="reading-reset" onClick={() => onChange({...DEFAULT_READING_PREFERENCES, layout: p.layout})}>恢复默认排版</button>
  </div>;
}
