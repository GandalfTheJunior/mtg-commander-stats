import { useId, useRef } from 'react'
import { Ambience } from './Ambience'

// Original procedural artwork, drawn as separate materials and geometry. One
// continuous closed path supplies every frame layer, including the right arch.
const arch = 'M56 766 Q38 766 38 748 V310 C38 148 180 38 360 38 H640 C820 38 962 148 962 310 V748 Q962 766 944 766 Z'

export function LoungeWindow({ flies }: { flies: boolean }) {
  const caption = useRef<HTMLDivElement>(null)
  const id = useId().replaceAll(':', '')
  const url = (name: string) => `url(#${id}-${name})`
  return <section className="lounge-window" aria-label="Messinggerahmtes Abendfenster">
    <svg className="window-art" viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <path id={`${id}-arch`} d={arch} />
        <clipPath id={`${id}-glass`}><path d={arch} /></clipPath>
        <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#0e1a29"/><stop offset=".55" stopColor="#34434b"/><stop offset="1" stopColor="#17292d"/></linearGradient>
        <radialGradient id={`${id}-moonlight`}><stop stopColor="#d1dcd0" stopOpacity=".15"/><stop offset="1" stopColor="#d1dcd0" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${id}-brass`} x1=".1" y1="0" x2=".8" y2="1"><stop stopColor="#e8cc8c"/><stop offset=".18" stopColor="#9c773d"/><stop offset=".36" stopColor="#d8b878"/><stop offset=".55" stopColor="#66735b"/><stop offset=".68" stopColor="#ac854d"/><stop offset=".88" stopColor="#6e4f2e"/><stop offset="1" stopColor="#d3ae6c"/></linearGradient>
        <linearGradient id={`${id}-walnut`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#6d4431"/><stop offset=".35" stopColor="#35251f"/><stop offset=".55" stopColor="#59372a"/><stop offset="1" stopColor="#261d1a"/></linearGradient>
        <linearGradient id={`${id}-bevel`} x2=".8" y2="1"><stop stopColor="#f5dfaa"/><stop offset=".45" stopColor="#8b7049"/><stop offset="1" stopColor="#362a20"/></linearGradient>
        <linearGradient id={`${id}-reflection`} x2="1" y2=".45"><stop stopColor="#d8e6e1" stopOpacity=".02"/><stop offset=".5" stopColor="#d8e6e1" stopOpacity=".11"/><stop offset="1" stopColor="#d8e6e1" stopOpacity="0"/></linearGradient>
        <radialGradient id={`${id}-amber`} cx="1" cy=".8" r="1"><stop stopColor="#ffb556" stopOpacity=".8"/><stop offset=".5" stopColor="#ff8f39" stopOpacity=".2"/><stop offset="1" stopColor="#ff8f39" stopOpacity="0"/></radialGradient>
        <pattern id={`${id}-brush`} width="21" height="13" patternUnits="userSpaceOnUse"><path d="M0 2h18 M4 5h17 M0 10h9" stroke="#fbe7ac" strokeOpacity=".13" strokeWidth=".7"/></pattern>
        <pattern id={`${id}-grain`} width="34" height="160" patternUnits="userSpaceOnUse"><path d="M3 0q10 40 0 80t0 80 M10 0q-4 50 3 80t-3 80 M24 0q8 50 0 80t0 80" fill="none" stroke="#d59b67" strokeOpacity=".13" strokeWidth="1.5"/></pattern>
        <pattern id={`${id}-glass-grain`} width="37" height="43" patternUnits="userSpaceOnUse"><path d="M4 10h2 M23 29h1 M12 38h2" stroke="#d6e6dd" strokeOpacity=".09" strokeWidth="1"/></pattern>
        <mask id={`${id}-metal-mask`}><use href={`#${id}-arch`} fill="none" stroke="white" strokeWidth="22"/></mask>
        <mask id={`${id}-wood-mask`}><use href={`#${id}-arch`} fill="none" stroke="white" strokeWidth="60"/></mask>
      </defs>
      <g clipPath={url('glass')}>
        <path fill={url('sky')} d="M0 0h1000v800H0z"/>
        <ellipse cx="720" cy="195" rx="280" ry="260" fill={url('moonlight')}/>
        <g fill="#eee1b0"><circle cx="720" cy="170" r="41"/><circle cx="230" cy="162" r="1.5"/><circle cx="470" cy="108" r="2"/><circle cx="844" cy="260" r="1.5"/><circle cx="560" cy="224" r="1"/></g>
        <path d="M0 430Q130 300 270 377T520 385T760 340T1000 390V800H0Z" fill="#293c40"/>
        <path d="M0 530Q140 400 340 480T640 440T1000 425V800H0Z" fill="#1a3032"/>
        <path d="M0 590Q180 500 390 540T760 500T1000 540V800H0Z" fill="#112729"/>
        <path d="M95 540l20-70 20 70h-13v35h-14v-35 M817 480l23-95 23 95h-16v46h-14v-46 M864 505l16-68 16 68h-10v30h-12v-30" fill="#102529"/>
        <Ambience enabled={flies} caption={caption} />
        <path d="M220 0H330L590 800H460Z M380 0h30L680 800h-35Z" fill={url('reflection')}/>
        <path d="M0 415H1000" stroke="#0d191b" strokeWidth="18"/><path d="M0 410H1000" stroke="#8d794f" strokeOpacity=".5" strokeWidth="5"/>
        <path d="M500 0V800" stroke="#0e191c" strokeWidth="17"/><path d="M496 0V800" stroke="#9f8b5e" strokeOpacity=".6" strokeWidth="4"/>
        <rect width="1000" height="800" fill={url('glass-grain')}/>
        <rect className="fire-glass" width="1000" height="800" fill={url('amber')}/>
      </g>
      <use href={`#${id}-arch`} fill="none" stroke="#140f10" strokeWidth="68"/>
      <use href={`#${id}-arch`} fill="none" stroke={url('walnut')} strokeWidth="60"/>
      <rect width="1000" height="800" fill={url('grain')} mask={url('wood-mask')}/>
      <use href={`#${id}-arch`} fill="none" stroke="#201a16" strokeWidth="31"/>
      <use href={`#${id}-arch`} fill="none" stroke={url('bevel')} strokeWidth="27"/>
      <use href={`#${id}-arch`} fill="none" stroke={url('brass')} strokeWidth="20"/>
      <rect width="1000" height="800" fill={url('brush')} mask={url('metal-mask')}/>
      <use className="fire-brass" href={`#${id}-arch`} fill="none" stroke={url('amber')} strokeWidth="22"/>
      <use href={`#${id}-arch`} fill="none" stroke="#f3d697" strokeOpacity=".35" strokeWidth="2"/>
    </svg>
    <div ref={caption} className="window-caption"><span className="overline">Die Commander Lounge</span><h2>Der Abend gehört euch.</h2><p>Draußen wird es still. Hier ist noch ein Platz frei.</p></div>
  </section>
}
