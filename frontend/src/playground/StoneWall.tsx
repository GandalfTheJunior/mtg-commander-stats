import { useId } from 'react'

// A finite, non-tiling masonry drawing. All geometry is built once, with no
// runtime randomness, measurements or animation clock. Alternating short/long
// courses and occasional split blocks keep the joints from forming a grid.
const courses = [180, 230, 155, 210, 190, 245, 165, 220, 175, 235, 195, 160,
  225, 185, 240, 170, 215, 200, 180, 230, 155, 220, 205, 195]
const tones = ['#453b34', '#4b4037', '#403934', '#51443a', '#473c36', '#49413a']
// Art-directed accents: 16 of 156 blocks (10.3%), with unequal gaps and no
// repeating every-nth cadence. Include central crops used on narrow screens.
const raisedStones = new Set([2, 11, 17, 25, 30, 43, 51, 61, 70, 82, 94, 103, 115, 127, 140, 152])
const stones: { x: number; y: number; w: number; h: number }[] = []
let top = -40
for (const [row, height] of courses.entries()) {
  let left = -150 - (row * 83 % 220)
  let col = 0
  while (left < 1600) {
    const width = 230 + ((row * 113 + col * 157) % 260)
    if ((row + col * 3) % 7 === 2) {
      stones.push({ x: left, y: top, w: width, h: height * .43 },
        { x: left, y: top + height * .43, w: width, h: height * .57 })
    } else stones.push({ x: left, y: top, w: width, h: height })
    left += width
    col++
  }
  top += height
}

const contours = stones.map(({ w, h }, i) => {
  const nick = 7 + i * 13 % 15, chip = 3 + i * 7 % 9
  return [[10, 8], [w * .42, 5 + i % 5], [w * .71, chip], [w - nick, 7],
    [w - 6, 19], [w - chip, h * .38], [w - 8, h * .6], [w - 12, h - 9],
    [w * .54, h - 6], [w * .22, h - chip], [8, h - 11], [chip, h * .65], [5, h * .38]]
})
const contourPath = (points: number[][], x = 0, y = 0) =>
  `M ${points.map(([px, py]) => `${px + x} ${py + y}`).join(' L ')} Z`
const joints = 'M 0 0 H 1600 V 4800 H 0 Z ' + stones.map(({ x, y }, i) => contourPath(contours[i], x, y)).join(' ')

// Paint only the negative space above diffuse room reflections. This keeps
// anthracite joints neutral under strong fire, while faces still receive warmth.
export function StoneJoints() {
  return <div className="stone-joints" aria-hidden="true">
    <svg viewBox="0 0 1600 4800" aria-hidden="true" focusable="false">
      <path d={joints} fill="#1b1e22" fillRule="evenodd" stroke="#34363a" strokeOpacity=".45" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  </div>
}

export function StoneWall() {
  const id = useId().replace(/:/g, '')
  return <div className="stone-wall" aria-hidden="true">
    <svg viewBox="0 0 1600 4800" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-face`} x1="0%" y1="0%" x2="90%" y2="100%">
          <stop stopColor="#eee1c5" stopOpacity=".07" />
          <stop offset=".5" stopColor="#eee1c5" stopOpacity="0" />
          <stop offset="1" stopColor="#100d10" stopOpacity=".17" />
        </linearGradient>
      </defs>
      {stones.map(({ x, y, w, h }, i) => {
        const raised = raisedStones.has(i)
        const depth = raised ? 34 : 5
        const nick = 7 + i * 13 % 15
        const chip = 3 + i * 7 % 9
        const outline = contourPath(contours[i])
        const opposite = `M 8 ${h - 11} L 5 ${h * .38} L 10 8 L ${w * .42} ${5 + i % 5} L ${w - nick} 7`
        const fireSide = `M ${w - nick} 7 L ${w - 6} 19 L ${w - 8} ${h * .6} L ${w - 12} ${h - 9} L ${w * .54} ${h - 6} L 8 ${h - 11}`
        return <g key={i} transform={`translate(${x} ${y})`} className={raised ? 'stone stone-raised' : 'stone'}>
          <path d={outline} transform={`translate(${-depth * .6} ${-depth * .5})`} fill="#171b21" opacity={raised ? .75 : .22} />
          <path className="stone-fire-shadow" d={opposite} transform={`translate(${-depth * .5} ${-depth * .4})`} strokeWidth={depth + 7} />
          <path d={outline} fill={tones[i % tones.length]} stroke="#1b1e22" strokeWidth="3" strokeLinejoin="round" />
          <path d={outline} fill={`url(#${id}-face)`} />
          <path d={opposite} fill="none" stroke="#1b1e22" strokeOpacity=".42" strokeWidth={depth} strokeLinejoin="round" />
          <path d={fireSide} fill="none" stroke="#b8a18a" strokeOpacity={raised ? .3 : .09} strokeWidth={depth * .7} strokeLinejoin="round" />
          {/* Broad chipped mineral planes, with a different contour per block. */}
          <path d={`M ${w * .08} ${h * .28} l ${w * .14} ${-chip} l ${w * .13} ${chip * 2} l ${w * .19} ${-chip} l ${-w * .07} ${h * .16} l ${-w * .22} ${-chip} Z M ${w * .53} ${h * .72} l ${w * .13} ${-h * .12} l ${w * .12} ${chip} l ${w * .13} ${-chip * 2} l ${-w * .06} ${h * .18} Z`} fill="#c9b99d" opacity={.025 + i % 4 * .009} />
          <path d={`M ${w * .12} ${h * .32} l ${w * .11} ${-chip} l ${w * .13} ${chip * 2} M ${w * .56} ${h * .74} l ${w * .12} ${-h * .09} l ${w * .13} ${chip}`} fill="none" stroke="#171418" strokeOpacity=".18" strokeWidth="3" />
          <path className="stone-fire-edge" d={fireSide} strokeWidth={raised ? 16 : 4} />
        </g>
      })}
    </svg>
  </div>
}
