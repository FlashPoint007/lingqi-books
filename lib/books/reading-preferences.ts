export const READING_FONTS = {
  serif: { name: '宋体 / 明朝体', css: '"Noto Serif CJK SC", "Songti SC", SimSun, serif' },
  sans: { name: '黑体 / 无衬线', css: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif' },
  kai: { name: '楷体', css: '"Kaiti SC", STKaiti, KaiTi, serif' },
  rounded: { name: '圆体', css: '"Yuanti SC", YouYuan, system-ui, sans-serif' },
  mono: { name: '等宽字体', css: 'Consolas, "Liberation Mono", monospace' },
} as const;

export type ReadingPreferences = {
  fontSize: number; lineHeight: number; width: number;
  fontFamily: keyof typeof READING_FONTS;
  theme: 'paper' | 'white' | 'green' | 'dark' | 'custom';
  layout: 'scroll' | 'page';
  imageQuality: 'original' | 'saver';
  preload: boolean;
  backgroundColor: string; textColor: string; paragraphSpacing: number; indent: boolean;
};
export type ReadingPosition = { key: string; ratio: number; anchor?: string; offset?: number };
export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  fontSize: 20, lineHeight: 2, width: 780, fontFamily: 'serif', theme: 'paper', layout: 'scroll', imageQuality: 'original', preload:true,
  backgroundColor: '#f5f0e5', textColor: '#464839', paragraphSpacing: 1.15, indent: true,
};
export function isReadingColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
export function readingPreferences(value: unknown): ReadingPreferences {
  const prefs = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: string, min: number, max: number, fallback: number) => {
    const candidate = prefs[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate)) : fallback;
  };
  return {
    fontSize: number('fontSize', 14, 36, 20),
    lineHeight: number('lineHeight', 1.6, 2.6, 2),
    width: number('width', 600, 1000, 780),
    fontFamily: typeof prefs.fontFamily === 'string' && Object.hasOwn(READING_FONTS, prefs.fontFamily)
      ? prefs.fontFamily as ReadingPreferences['fontFamily'] : 'serif',
    theme: ['paper', 'white', 'green', 'dark', 'custom'].includes(String(prefs.theme))
      ? prefs.theme as ReadingPreferences['theme'] : 'paper',
    layout: prefs.layout === 'page' ? 'page' : 'scroll',
    imageQuality: prefs.imageQuality === 'saver' ? 'saver' : 'original',
    preload:typeof prefs.preload==='boolean'?prefs.preload:true,
    backgroundColor: isReadingColor(prefs.backgroundColor) ? prefs.backgroundColor.toLowerCase() : '#f5f0e5',
    textColor: isReadingColor(prefs.textColor) ? prefs.textColor.toLowerCase() : '#464839',
    paragraphSpacing: number('paragraphSpacing', 0.4, 2, 1.15),
    indent: typeof prefs.indent === 'boolean' ? prefs.indent : true,
  };
}
function luminance(color: string) {
  const channels = color.slice(1).match(/../g)!.map(pair => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function colorContrast(a: string, b: string) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export function readableTextColor(background: string) {
  return colorContrast(background, '#000000') >= colorContrast(background, '#ffffff') ? '#000000' : '#ffffff';
}
export function readingPalette(prefs: ReadingPreferences) {
  const themes = {
    paper: ['#f5f0e5', '#464839'], white: ['#ffffff', '#333333'],
    green: ['#dce8d8', '#354633'], dark: ['#1c211f', '#c5cdc5'],
    custom: [prefs.backgroundColor, prefs.textColor],
  };
  const [background, text] = themes[prefs.theme];
  const dark = readableTextColor(background) === '#ffffff';
  const uiText = dark ? '#edf2ed' : '#202720';
  return {
    background, text, uiText, panel: dark ? '#272e29' : '#fafbf6',
    muted: dark ? '#a5b29f' : '#68745f', border: uiText + '33',
    accent: dark ? '#adc599' : '#526c42', contrast: colorContrast(background, text),
  };
}
export function readingPosition(value: unknown, key: string): ReadingPosition | undefined {
  if (!value || typeof value !== 'object') return;
  const p = value as Record<string, unknown>;
  if (p.key !== key || typeof p.ratio !== 'number' || !Number.isFinite(p.ratio)) return;
  return {
    key, ratio: Math.max(0, Math.min(1, p.ratio)),
    anchor: typeof p.anchor === 'string' && /^[a-z]+-\d+$/.test(p.anchor) ? p.anchor : undefined,
    offset: typeof p.offset === 'number' && Number.isFinite(p.offset) ? Math.max(0, Math.min(1, p.offset)) : 0,
  };
}
