import { useId } from 'react'
import type { HallDeck } from './hallData'

// Original vector studies: no downloaded artwork, fonts, textures or API assets.
export function HallArtwork({ deck }: { deck: HallDeck }) {
  const id = useId().replace(/:/g, '')
  return <svg className="hall-art" viewBox="0 0 480 280" role="img" aria-label={`Fiktive Illustration: ${deck.name}`}>
    <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor={deck.sky}/><stop offset="1" stopColor="#101e28"/></linearGradient></defs>
    <path fill={`url(#${id})`} d="M0 0H480V280H0Z"/>
    <g fill={deck.ink} opacity=".65">{[45, 110, 165, 310, 385, 430].map((x, i) => <circle key={x} cx={x} cy={28 + i % 3 * 19} r={i % 2 ? 1 : 2}/>)}</g>
    {deck.motif === 'sun' && <g fill={deck.ink}><circle cx="240" cy="97" r="57" opacity=".25"/><circle cx="240" cy="97" r="39"/><path d="M0 223L80 160L137 210L205 163L290 225L365 166L480 235V280H0Z" opacity=".3"/></g>}
    {deck.motif === 'tower' && <g fill={deck.ink}><path d="M205 209L214 75L240 35L266 75L275 209ZM184 209V139L197 119L208 139V209ZM273 209V131L287 110L299 131V209Z" opacity=".7"/><path d="M226 89H233V110H226ZM245 89H252V110H245Z" fill="#203344"/></g>}
    {deck.motif === 'forest' && <g fill={deck.ink}>{[55, 130, 240, 350, 425].map((x,i) => <path key={x} d={`M${x} ${40 + i % 2 * 35}l-48 120h30l-40 58h116l-40-58h30Z`} opacity={i === 2 ? .8 : .3}/>)}</g>}
    {deck.motif === 'moon' && <g fill={deck.ink}><path d="M284 40A65 65 0 1 0 284 163A58 58 0 0 1 284 40Z"/><path d="M45 240L95 148L125 240M345 240L382 125L438 240" opacity=".25"/></g>}
    {deck.motif === 'mountain' && <g><path d="M35 252L210 55L298 182L350 100L480 257Z" fill={deck.ink} opacity=".6"/><path d="M170 104L210 55L245 105L222 94L211 110L195 93Z" fill="#ffe4ad"/><path d="M210 112L229 159L210 195L248 249" fill="none" stroke="#f6a15e" strokeWidth="5"/></g>}
    {deck.motif === 'sea' && <g fill="none" stroke={deck.ink} strokeWidth="3">{[145, 175, 205, 235].map(y => <path key={y} d={`M0 ${y}Q60 ${y-30} 120 ${y}T240 ${y}T360 ${y}T480 ${y}`} opacity=".4"/>)}<path d="M228 100V52L275 100ZM205 108H283L267 126H221Z" fill={deck.ink}/></g>}
    <path d="M0 255Q100 219 185 252T340 245T480 238V280H0Z" fill="#101c20"/>
    <g fill="#17252a" stroke={deck.ink} strokeWidth="1.5"><circle cx="240" cy="173" r="14"/><path d="M218 191Q240 180 262 191L283 265H197Z"/><path d="M213 202L186 229L182 221L209 190M267 201L293 221L299 214L274 189"/></g>
    <path d="M235 198L240 211L245 198" fill="none" stroke={deck.ink} strokeWidth="2"/>
  </svg>
}

export type Honor = 'laurel' | 'banner' | 'crown'
export function HonorOrnament({ kind }: { kind: Honor }) {
  const id = useId().replace(/:/g, '')
  return <svg className={`hall-honor hall-honor--${kind}`} viewBox="0 0 240 90" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x2=".2" y2="1"><stop stopColor="#fff0ba"/><stop offset=".35" stopColor="#ad8038"/><stop offset=".55" stopColor="#efd08b"/><stop offset="1" stopColor="#5a3519"/></linearGradient></defs>
    <g fill={`url(#${id})`} stroke="#765127" strokeWidth="1">
      {kind === 'laurel' && <>{[false,true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(240) scale(-1 1)' : undefined}><path d="M117 76Q54 72 33 15" fill="none" stroke="#dfbb69" strokeWidth="3"/>{[0,1,2,3,4].map(i => <g key={i} transform={`translate(${36+i*13} ${24+i*10}) rotate(${-35+i*13})`}><path d="M0 0Q-21-24-27-9Q-25 4 0 0Q-1-29 12-23Q22-14 0 0Z"/><path d="M-22-9L0 0L10-19" fill="none" stroke="#ffdc94"/></g>)}</g>)}<path d="M110 69L120 63L130 69L120 80Z"/></>}
      {kind === 'banner' && <><path d="M32 24H208L197 39L208 54H32L43 39Z" fill="#652d34"/><path d="M32 24H208M32 54H208" fill="none" stroke="#d6b570" strokeWidth="3"/><path d="M87 12H153V49Q150 70 120 83Q90 70 87 49Z"/><path d="M94 20H146V49Q144 63 120 75Q96 63 94 49Z" fill="#382e3d"/><path d="M120 26L127 40L142 43L130 53L132 66L120 59L108 66L110 53L98 43L113 40Z"/></>}
      {kind === 'crown' && <><path d="M67 62L53 22L86 39L100 9L120 36L140 9L154 39L187 22L173 62ZM67 66H173V78H67Z"/><path d="M81 57L76 43M105 57L102 32M135 57L138 32M159 57L164 43" stroke="#fff1ba" strokeWidth="2"/>{[54,100,140,186].map((x,i) => <circle key={x} cx={x} cy={i===0||i===3?19:8} r="4"/>)}<path d="M103 71l4-5l4 5l-4 5ZM120 66V77M116 69L124 74M134 66L129 71L134 76" fill="none" stroke="#b8d8d0" strokeWidth="2"/></>}
    </g>
  </svg>
}
