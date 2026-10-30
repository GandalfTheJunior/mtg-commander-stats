import type { ButtonHTMLAttributes } from 'react'
import { useId } from 'react'
import './waxSeal.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { symbol: 'check' | 'play' | 'reset' }

// Local, decorative vector relief. The visible label and seal form ONE native
// button, preserving repeated activation, disabled and aria-pressed semantics.
export function WaxSealButton({ symbol, children, ...props }: Props) {
  const id = useId()
  return <button type="button" {...props} className="wax-button">
    <svg className="wax-seal" viewBox="0 0 120 128" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-rim`} x2=".7" y2="1">
          <stop stopColor="#f58b77"/><stop offset=".12" stopColor="#a7273e"/><stop offset=".35" stopColor="#580d20"/><stop offset=".6" stopColor="#9c2336"/><stop offset=".8" stopColor="#3e0a17"/><stop offset="1" stopColor="#d85c53"/>
        </linearGradient>
        <radialGradient id={`${id}-core`} cx=".35" cy=".25" r=".8">
          <stop stopColor="#902336"/><stop offset="1" stopColor="#500e20"/>
        </radialGradient>
      </defs>
      <path className="wax-drop" d="M91 96 Q97 104 96 112 Q95 116 99 119 Q104 123 106 117 Q107 113 102 108 L100 96 M82 103 Q86 109 83 118 Q79 125 85 125 Q92 126 89 119 L90 101" fill={`url(#${id}-rim)`}/>
      <path d="M59 6 C69 3 74 11 83 12 C95 12 98 20 101 29 C103 37 112 40 111 51 C110 62 115 67 109 77 C104 85 104 95 94 99 C85 102 82 111 71 110 C62 109 55 115 46 110 C37 106 28 109 23 99 C18 91 9 88 10 77 C10 68 3 63 7 53 C11 44 8 35 17 29 C25 24 25 15 36 14 C47 14 49 6 59 6Z" fill={`url(#${id}-rim)`} stroke="#3b0915" strokeWidth="2"/>
      <circle cx="60" cy="59" r="45" fill="#430b19" stroke="#ed8b70" strokeOpacity=".65"/>
      <circle cx="60" cy="59" r="41" fill={`url(#${id}-core)`} stroke="#ba4850" strokeWidth="2"/>
      <circle cx="60" cy="59" r="37" fill="none" stroke="#e1a16e" strokeOpacity=".32"/>
      <g className="wax-symbol" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        {symbol === 'check' ? <path d="m43 59 12 12 23-25"/> : symbol === 'play' ? <path d="m50 42 26 17-26 17Z" fill="currentColor" strokeWidth="1"/> : <><path d="M43 49a21 21 0 1 1-3 20 M43 38v14H30"/></>}
      </g>
    </svg>
    <span className="wax-label">{children}</span>
  </button>
}
