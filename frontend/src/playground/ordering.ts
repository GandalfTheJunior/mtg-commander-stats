export const players = [
  { id: 'mira', name: 'Mira', deck: 'Der schlafende Hain', symbol: '❧', note: 'Grüne Magie · Große Kreaturen, eine Tasse Tee.' },
  { id: 'orin', name: 'Orin', deck: 'Messing & Mondlicht', symbol: '☾', note: 'Blaue Magie · Kleine Artefakte und große Pläne. Orin hat heute ein paar neue Lieblingskarten dabei — und genug Zeit für eine gemütliche Runde.' },
  { id: 'lumi', name: 'Lumi', deck: 'Funken im Abendrot', symbol: '✧', note: 'Rote Magie · Ein kleiner Funke genügt.' },
  { id: 'fenn', name: 'Fenn', deck: 'Die letzte Laterne', symbol: '♧', note: 'Weiße Magie · Zusammen bleiben. Eine freundliche Runde mit vielen kleinen Verbündeten und einer wohlverdienten Pause.' },
]
export const initialOrder = players.map(p => p.id)
export function insert(order: string[], id: string, index: number) {
  const rest = order.filter(item => item !== id)
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id)
  return rest
}
