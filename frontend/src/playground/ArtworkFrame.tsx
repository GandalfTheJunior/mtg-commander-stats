import { useId, type CSSProperties, type ReactNode } from 'react'
import type { MagicColor } from '../api'
import { frameFinish, type FrameTone } from './frameFinish'
import './artworkFrame.css'

// One material recipe and silhouette; only these restrained metal colours differ.
const metals: Record<FrameTone, readonly [string, string, string, string, string]> = {
  gold: ['#302012', '#705024', '#b58b44', '#e8c87b', '#fff0be'],
  silver: ['#202730', '#59616b', '#9ca7af', '#dce4e6', '#ffffff'],
  W: ['#383127', '#8b7e61', '#c4bba1', '#eee4cb', '#fff9e8'],
  U: ['#10222f', '#344f68', '#698ca5', '#b9d5df', '#e8f7ff'],
  B: ['#100f15', '#34303c', '#62586a', '#a99cae', '#e4dae7'],
  R: ['#31151a', '#6d363b', '#a76a61', '#e7b8a0', '#fff0d4'],
  G: ['#12271e', '#365849', '#6f9480', '#bfd5af', '#eff8d7'],
}

export function ArtworkFrame({ colors, children }: { colors: readonly MagicColor[]; children: ReactNode }) {
  const finish = frameFinish(colors)
  return <div className="art-frame-space">
    <div className="art-frame" data-finish={finish.kind} data-left={finish.left} data-right={finish.right}>
      <div className="art-frame-opening">{children}</div>
      <Metalwork side="left" tone={finish.left} />
      <Metalwork side="right" tone={finish.right} />
    </div>
  </div>
}

function Metalwork({ side, tone }: { side: 'left' | 'right'; tone: FrameTone }) {
  const id = useId().replace(/:/g, '')
  const ref = (name: string) => `${id}-${name}`
  const paint = (name: string) => `url(#${ref(name)})`
  const [dark, shadow, base, light, glint] = metals[tone]
  const style = { '--metal-dark': dark, '--metal-shadow': shadow, '--metal-base': base, '--metal-light': light, '--metal-glint': glint } as CSSProperties
  return <div className={`frame-metalwork frame-metalwork--${side}`} style={style} aria-hidden="true">
    <svg className="frame-definitions" width="0" height="0" focusable="false"><defs>
      <linearGradient id={ref('leaf')} x1="0" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor={glint} /><stop offset=".18" stopColor={light} /><stop offset=".38" stopColor={base} />
        <stop offset=".54" stopColor={shadow} /><stop offset=".67" stopColor={light} /><stop offset=".85" stopColor={base} /><stop offset="1" stopColor={dark} />
      </linearGradient>
      <radialGradient id={ref('gem')} cx=".32" cy=".25" r=".73">
        <stop stopColor={glint} /><stop offset=".2" stopColor={light} /><stop offset=".52" stopColor={base} /><stop offset=".82" stopColor={shadow} /><stop offset="1" stopColor={dark} />
      </radialGradient>
      <linearGradient id={ref('ridge')} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor={glint} /><stop offset=".45" stopColor={base} /><stop offset="1" stopColor={shadow} />
      </linearGradient>
      <filter id={ref('relief')} x="-25%" y="-25%" width="160%" height="160%" colorInterpolationFilters="sRGB">
        <feDropShadow dx=".7" dy="1.6" stdDeviation=".75" floodColor="#080608" floodOpacity=".8" />
      </filter>
      {/* Nothing from a corner can enter the rectangular artwork opening. */}
      <clipPath id={ref('corner-silhouette')}><path d="M0 0H100V45H45V100H0Z" /></clipPath>
      <g id={ref('frond')}>
        <path d="M24 28C34 8 51 2 66 13C77 21 87 17 98 10C90 30 79 37 63 31C51 26 42 25 36 38Z" fill={paint('leaf')} stroke={shadow} strokeWidth="1" />
        <path d="M27 29C42 13 51 10 65 18C76 25 84 24 90 20M37 25C48 15 58 16 64 21" fill="none" stroke={paint('ridge')} strokeWidth="1.5" />
        <path d="M41 15C51 1 69 8 79 3C74 14 65 18 55 17M56 14C70 21 78 36 92 33C85 44 69 40 61 29" fill={paint('leaf')} stroke={shadow} strokeWidth=".7" />
        <path d="M54 14L70 10M66 28L80 35" fill="none" stroke={light} strokeWidth=".8" />
        <path d="M28 27C38 15 57 22 55 34C53 44 40 45 38 36C37 31 42 28 45 31C47 33 46 36 44 36" fill="none" stroke={dark} strokeWidth="5" />
        <path d="M28 26C38 14 57 21 55 33C53 43 40 44 38 35C37 30 42 27 45 30C47 32 46 35 44 35" fill="none" stroke={paint('ridge')} strokeWidth="3" />
        <path d="M28 16C18 14 15 6 18 0C22 10 29 10 39 7C36 15 32 20 28 23" fill={paint('leaf')} stroke={shadow} strokeWidth=".8" />
      </g>
      <g id={ref('corner')} clipPath={paint('corner-silhouette')}>
        <g filter={paint('relief')}>
          <path d="M3 3L26 11L40 26L25 42L10 28Z" fill={paint('leaf')} stroke={light} strokeWidth=".9" />
          <use href={`#${ref('frond')}`} /><use href={`#${ref('frond')}`} transform="matrix(0 1 1 0 0 0)" />
          <path d="M8 8L29 29M10 19L24 28M19 10L28 24" fill="none" stroke={glint} strokeWidth=".8" />
          <circle cx="29" cy="29" r="14.5" fill={dark} stroke={base} strokeWidth="1.5" />
          <circle cx="29" cy="29" r="12.2" fill={paint('gem')} stroke={light} strokeWidth="1.2" />
          <path d="M20 24C21 18 30 16 35 21" fill="none" stroke={glint} strokeWidth="1.1" opacity=".85" />
          <path d="M26 43L33 48L39 39L45 33L42 26L37 37Z" fill={paint('leaf')} stroke={shadow} strokeWidth=".7" />
        </g>
      </g>
      <g id={ref('wing')}>
        <path d="M77 53C61 29 46 27 18 21C28 35 36 39 48 42C34 41 20 48 4 43C19 58 38 60 58 54C46 63 35 62 26 61C38 72 59 70 77 58Z" fill={paint('leaf')} stroke={shadow} strokeWidth="1" />
        <path d="M13 48C39 54 51 39 73 53M27 28C49 33 59 39 72 51M39 63L69 56" fill="none" stroke={paint('ridge')} strokeWidth="1.2" />
        <path d="M72 51C65 36 51 41 55 51C59 60 70 61 75 57" fill="none" stroke={dark} strokeWidth="4" />
        <path d="M72 50C65 35 51 40 55 50C59 59 70 60 75 56" fill="none" stroke={light} strokeWidth="1.9" />
      </g>
      <g id={ref('crest')} filter={paint('relief')}>
        <use href={`#${ref('wing')}`} /><use href={`#${ref('wing')}`} transform="translate(160) scale(-1 1)" />
        <path d="M80 2C75 17 64 21 65 37L67 58L80 78L93 58L95 37C96 21 85 17 80 2Z" fill={paint('leaf')} stroke={shadow} strokeWidth="1" />
        <path d="M80 8L72 29L80 23L88 29ZM80 67L74 58L80 62L86 58Z" fill={paint('ridge')} stroke={light} strokeWidth=".7" />
        <ellipse cx="80" cy="43" rx="13.5" ry="17" fill={dark} stroke={light} strokeWidth="1.2" />
        <ellipse cx="80" cy="42" rx="10.8" ry="14.2" fill={paint('gem')} stroke={base} strokeWidth="1" />
        <path d="M72 36C73 30 81 28 85 32" fill="none" stroke={glint} strokeWidth="1.1" />
      </g>
      <g id={ref('side')} filter={paint('relief')}>
        <path d="M16 5C14 31 5 43 2 60C5 77 14 89 16 115C18 89 27 77 30 60C27 43 18 31 16 5Z" fill="none" stroke={paint('ridge')} strokeWidth="1.8" />
        <path d="M16 39L28 60L16 81L4 60Z" fill={paint('leaf')} stroke={light} strokeWidth=".8" />
        <path d="M16 48L23 60L16 72L9 60Z" fill={dark} stroke={base} strokeWidth="1" />
        <circle cx="16" cy="60" r="4.6" fill={paint('gem')} stroke={light} strokeWidth=".8" />
        <circle cx="16" cy="26" r="2.5" fill={paint('gem')} /><circle cx="16" cy="94" r="2.5" fill={paint('gem')} />
      </g>
      <pattern id={ref('engraving')} width="48" height="14" patternUnits="userSpaceOnUse">
        <path d="M0 7C10 7 8 1 16 2C26 3 20 13 13 10C9 8 13 5 16 7M24 7C34 7 32 13 40 12C50 11 44 1 37 4C33 6 37 9 40 7" fill="none" stroke={dark} strokeWidth=".8" opacity=".65" />
        <path d="M1 6C11 6 9 0 17 1M25 8C35 8 33 14 41 13" fill="none" stroke={glint} strokeWidth=".6" opacity=".55" />
      </pattern>
    </defs></svg>
    {(['top', 'right', 'bottom', 'left'] as const).map(edge => <div className={`frame-rail frame-rail--${edge}`} key={edge}>
      <svg className="frame-engraving" focusable="false"><rect width="100%" height="100%" fill={paint('engraving')} /></svg>
    </div>)}
    <div className="frame-outer-rim" /><div className="frame-inner-rim" />
    {(['tl', 'tr', 'br', 'bl'] as const).map(corner => <svg key={corner} className={`frame-corner frame-corner--${corner}`} viewBox="0 0 100 100" focusable="false"><use href={`#${ref('corner')}`} /></svg>)}
    {(['top', 'bottom'] as const).map(edge => <svg key={edge} className={`frame-crest frame-crest--${edge}`} viewBox="0 0 160 80" focusable="false"><use href={`#${ref('crest')}`} /></svg>)}
    {(['left', 'right'] as const).map(edge => <svg key={edge} className={`frame-side frame-side--${edge}`} viewBox="0 0 32 120" focusable="false"><use href={`#${ref('side')}`} /></svg>)}
  </div>
}
