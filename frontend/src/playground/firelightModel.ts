import { smooth } from './flight'

export type FireSignal = { slow: number; flutter: number; flare: number }
type Flare = { start: number; amplitude: number; attack: number; decay: number }

// Fast rounded rise, soft longer release; overlapping events never step on/off.
export function flareEnvelope(age: number, attack: number, decay: number) {
  if (age < 0 || age >= attack + decay) return 0
  return age < attack ? smooth(age / attack) : 1 - smooth((age - attack) / decay)
}

// Reference-informed dynamics, not a replay of the 25s clip. Call with increasing
// visible-page elapsed milliseconds; random injection makes regression tests exact.
export function createFirelightModel(rng: () => number = Math.random) {
  const between = (min: number, max: number) => min + rng() * (max - min)
  const drift = (amplitude: number, min: number, max: number) => ({
    from: 0, to: between(-amplitude, amplitude), start: 0,
    duration: between(min, max), amplitude, min, max,
  })
  const baseline = drift(.04, 4500, 12500)
  const details = [drift(.022, 150, 500), drift(.01, 350, 900)]
  let flares: Flare[] = []
  let nextFlare = between(800, 2800)
  const value = (channel: typeof baseline, time: number) => {
    if (time - channel.start >= channel.duration) {
      channel.from = channel.to
      // May continue upward/downward or hold nearby: no forced high/low alternation.
      channel.to = between(-channel.amplitude, channel.amplitude)
      channel.start = time; channel.duration = between(channel.min, channel.max)
    }
    return channel.from + (channel.to - channel.from) * smooth((time - channel.start) / channel.duration)
  }
  return {
    sample(time: number): FireSignal {
      flares = flares.filter(f => time - f.start < f.attack + f.decay)
      if (time >= nextFlare) {
        const rounded = rng() < .2
        if (flares.length < 3) flares.push({ start: time, amplitude: between(.06, .16),
          attack: between(150, 350), decay: rounded ? between(350, 650) : between(550, 1200) })
        // Occasional clusters and longer quiet gaps; no repeating event schedule.
        nextFlare = time + (rng() < .22 ? between(650, 1500) : between(2800, 7500))
      }
      return { slow: value(baseline, time), flutter: details.reduce((sum, c) => sum + value(c, time), 0),
        flare: flares.reduce((sum, f) => sum + f.amplitude * flareEnvelope(time - f.start, f.attack, f.decay), 0) }
    },
  }
}

export function reflectedLevels(signal: FireSignal, strong: boolean) {
  const shared = signal.slow + signal.flutter + signal.flare
  const diffuse = signal.slow + signal.flutter * .6 + signal.flare * .9
  // Preserve positive base glow; soft compression retains peak detail. Strong A
  // stays below .465 * the existing 2.1 CSS gain = .9765, avoiding opacity clipping.
  return strong
    ? { a: .34 + .125 * Math.tanh(shared / .12), b: .28 + .09 * Math.tanh(diffuse / .13) }
    : { a: .4 + .09 * Math.tanh(shared / .12), b: .3 + .065 * Math.tanh(diffuse / .13) }
}
