import { expect, test } from 'claude-code/testing'

import type { Limit, Sample } from '../types'
import {
  TRACK,
  barCells,
  barWithMarkers,
  BURN_MARK,
  MARK,
  PACE_MARK,
  dim,
  fmtDur,
  fmtPct,
  heavySetting,
  isSimplePrompt,
  nextStreak,
  forecast,
  prettyModel,
  shortEffort,
  shortModel,
  pushSample,
  ramp,
  warnings,
  weekPace,
  weekSummary,
  isFocusHeld,
  FOCUS_HOLD_MS,
} from '../hooks/logic'
import { QUIPS, ROTATE_MS, rowFor } from '../hooks/quips'
import { pieGlyph, recordDone, recordSpawn, ringSvg, summarize } from '../hooks/work'
import { FRAMES, FRAME_MS, ICONS, iconFrame, iconLoopSvg, iconSvg } from '../hooks/icons'
import {
  EFFORTS,
  MODELS,
  isModelName,
  modelFamily,
  nextEffort,
  nextModel,
  parseCm,
  resolveModel,
  sameModel,
} from '../hooks/cycle'
import { onBandButton } from '../hooks/view'
import { LEVEL_NAMES, levelColor, levelGlyph, levelMeter, pacingLevel } from '../hooks/sprites'
import { VERSION, versionLabel } from '../hooks/version'

const MIN = 60_000
const NOW = Date.parse('2026-10-11T20:00:00Z')
const at = (mins: number) => NOW + mins * MIN
const five = (percentUsed: number, resetInMin = 120): Limit => ({
  kind: 'five_hour',
  percentUsed,
  resetsAt: new Date(at(resetInMin)).toISOString(),
})
const sample = (minsAgo: number, p: number): Sample => ({ t: at(-minsAgo), p })

test('no reading means no forecast', () => {
  expect(forecast([], undefined, NOW).state).toBe('none')
})

test('a window that just opened has no pace yet', () => {
  // 5 minutes in: too early for the window average, one reading is no trend.
  expect(forecast([sample(1, 10)], five(10, 295), NOW).state).toBe('calibrating')
})

test('the window average gives a forecast from the very first reading', () => {
  // 28% used, window opened 59 minutes ago: about 28.5%/h.
  const f = forecast([sample(0, 28)], five(28, 241), NOW)
  expect(Math.round(f.ratePerHour * 10) / 10).toBe(28.5)
  expect(f.state).toBe('danger')
})

test('one big turn cannot swing the pace: the burst is spread over at least 15 minutes', () => {
  // 21% -> 28% in 5 minutes would read 84%/h; spread over 15 minutes it is 28%/h,
  // and the blend with the 28.5%/h window average stays near 28%/h.
  const f = forecast([sample(5, 21), sample(0, 28)], five(28, 241), NOW)
  expect(Math.round(f.ratePerHour)).toBe(28)
  expect(Math.round((f.msToEmpty ?? 0) / MIN)).toBe(153)
})

test('a fast pace that cannot last to the reset says it runs out, and when', () => {
  // Window average 16.7%/h, last 30 minutes 60%/h: blend 38.3%/h, dry in 78 minutes.
  const f = forecast([sample(30, 20), sample(0, 50)], five(50, 120), NOW)
  expect(f.state).toBe('danger')
  expect(Math.round(f.ratePerHour * 10) / 10).toBe(38.3)
  expect(Math.round((f.msToEmpty ?? 0) / MIN)).toBe(78)
})

test('a gentle pace lands under the limit and is on pace', () => {
  // Average 5.3%/h, recent 12%/h: blend 8.7%/h, two hours left adds 17 points.
  const f = forecast([sample(30, 10), sample(0, 16)], five(16, 120), NOW)
  expect(f.state).toBe('ok')
  expect(Math.round(f.projected)).toBe(33)
})

test('a pace that finishes the window near the limit is tight', () => {
  // Average 16.7%/h, recent 20%/h: blend 18.3%/h, projected about 87%.
  const f = forecast([sample(30, 40), sample(0, 50)], five(50, 120), NOW)
  expect(f.state).toBe('tight')
  expect(Math.round(f.projected)).toBe(87)
})

test('nothing new for twenty minutes is idle', () => {
  expect(forecast([sample(25, 30)], five(30), NOW).state).toBe('idle')
  expect(forecast([sample(5, 30)], five(30), NOW).state).not.toBe('idle')
})

test('a full window is the limit', () => {
  expect(forecast([], five(100), NOW).state).toBe('limit')
})

test('a window that rolls over drops the old readings', () => {
  const old: Sample[] = [{ t: at(-200), p: 90, r: at(-30) }]
  const next = pushSample(old, NOW, five(3, 300))
  expect(next.length).toBe(1)
  expect(next[0]?.p).toBe(3)
})

test('an unchanged reading is not stored again within five minutes', () => {
  const first = pushSample([], NOW, five(10))
  expect(pushSample(first, at(2), five(10)).length).toBe(1)
  expect(pushSample(first, at(6), five(10)).length).toBe(2)
})

test('extra effort warns, max effort outranks it, ultracode outranks both', () => {
  expect(warnings('high', false, [])).toEqual([])
  expect(warnings('xhigh', false, [])[0]?.kind).toBe('extra')
  expect(warnings('max', false, [])[0]?.kind).toBe('max')
  const all = warnings('max', true, [])
  expect(all.map(w => w.kind)).toEqual(['ultracode', 'max'])
})

test('a full usage window warns that further use may be extra', () => {
  expect(warnings('medium', false, [five(100)])[0]?.kind).toBe('overage')
  expect(warnings('medium', false, [five(60)])).toEqual([])
})

test('durations read short', () => {
  expect(fmtDur(20 * 1000)).toBe('<1m')
  expect(fmtDur(14 * MIN)).toBe('14m')
  expect(fmtDur(134 * MIN)).toBe('2h 14m')
  expect(fmtDur(120 * MIN)).toBe('2h')
  expect(fmtDur(30 * 60 * MIN)).toBe('1d 6h')
})

test('percentages drop the decimal once they are two digits', () => {
  expect(fmtPct(43.2)).toBe('43%')
  expect(fmtPct(7.4)).toBe('7.4%')
  expect(fmtPct(7)).toBe('7%')
})

test('model ids read as names', () => {
  expect(prettyModel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(prettyModel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(prettyModel(null)).toBe('model ?')
})

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

test('an empty bar is all dark track, a full bar is all solid', () => {
  expect(barCells(0, 0, 8).every(c => c.ch === '█' && c.color === TRACK && c.bg === undefined)).toBe(true)
  expect(barCells(100, 100, 8).every(c => c.ch === '█' && c.color !== TRACK)).toBe(true)
})

test('one gradient runs across the whole bar, green at the start and red at the end', () => {
  const full = barCells(100, 100, 24)
  const [r0, g0] = rgb(full[0]!.color)
  const [r1, g1] = rgb(full[23]!.color)
  expect(g0).toBeGreaterThan(r0)
  expect(r1).toBeGreaterThan(g1)
  // a partly full bar shows only the first part of that same ramp
  expect(barCells(50, 50, 24)[11]?.color).toBe(full[11]?.color)
})

test('the used part, its ghost and the track come in that order', () => {
  const cells = barCells(30, 70, 10)
  const solid = cells.filter(c => c.ch === '█' && c.color !== TRACK && c.bg === undefined)
  expect(solid.length).toBeGreaterThanOrEqual(7)
  expect(cells[0]?.color).not.toBe(dim(cells[0]!.color))
  // the first three cells are full-strength, the next four are the dimmed ghost of the ramp
  expect(cells[2]?.color).toBe(barCells(100, 100, 10)[2]?.color)
  expect(cells[3]?.color).toBe(dim(barCells(100, 100, 10)[3]!.color))
  expect(cells[6]?.color).toBe(dim(barCells(100, 100, 10)[6]!.color))
  expect(cells[7]?.color).toBe(TRACK)
})

test('the tip is smooth: an edge inside a cell is a thin block over the colour after it', () => {
  // 35% of 10 cells is 3.5 cells: a half block in the fourth cell
  const tip = barCells(35, 35, 10)[3]!
  expect(tip.ch).toBe('▌')
  expect(tip.bg).toBe(TRACK)
  // with a ghost running on, the half block sits over the ghost instead
  const withGhost = barCells(35, 90, 10)[3]!
  expect(withGhost.ch).toBe('▌')
  expect(withGhost.bg).not.toBe(TRACK)
  // eighths: 3.125 cells puts a one-eighth sliver in the fourth cell
  expect(barCells(31.25, 31.25, 10)[3]?.ch).toBe('▏')
})

test('a bar of more cells has finer steps', () => {
  const steps = (w: number) => new Set(barCells(100, 100, w).map(c => c.color)).size
  expect(steps(36)).toBeGreaterThan(steps(12))
  expect(ramp(['#000000', '#ffffff'], 0.5)).toBe('#808080')
  expect(dim('#34d399')).not.toBe('#34d399')
})

test('the version label is the full version', () => {
  expect(versionLabel('1.0.0')).toBe('v1.0.0')
  expect(versionLabel('1.2.0')).toBe('v1.2.0')
  expect(versionLabel('1.0.1')).toBe('v1.0.1')
  expect(versionLabel(VERSION)).toBe('v1.9.3')
})

test('there are ten quips, each short, distinct and free of em dashes', () => {
  expect(QUIPS.length).toBe(10)
  expect(new Set(QUIPS).size).toBe(10)
  for (const q of QUIPS) {
    expect(q.length).toBeLessThanOrEqual(70)
    expect(q.includes('\u2014')).toBe(false)
  }
})

test('with no warning the second row steps through every quip, then starts over', () => {
  const t0 = 1000 * ROTATE_MS
  const seen = Array.from({ length: 11 }, (_, i) => rowFor(t0 + i * ROTATE_MS, false))
  expect(seen.every(r => r.kind === 'quip')).toBe(true)
  const idx = seen.map(r => (r.kind === 'quip' ? r.index : -1))
  expect(new Set(idx.slice(0, 10)).size).toBe(10)
  expect(idx[10]).toBe(idx[0])
  expect(idx[1]).toBe(((idx[0] ?? 0) + 1) % 10)
})

test('a row holds for the whole switch interval', () => {
  const t0 = 1000 * ROTATE_MS
  expect(rowFor(t0, false)).toEqual(rowFor(t0 + ROTATE_MS - 1, false))
  expect(rowFor(t0, false)).not.toEqual(rowFor(t0 + ROTATE_MS, false))
})

test('with a warning it takes every other switch and the quips carry on in order between', () => {
  const t0 = 1000 * ROTATE_MS
  const kinds = Array.from({ length: 6 }, (_, i) => rowFor(t0 + i * ROTATE_MS, true).kind)
  expect(kinds).toEqual(['alert', 'quip', 'alert', 'quip', 'alert', 'quip'])
  const quips = [1, 3, 5, 7].map(i => rowFor(t0 + i * ROTATE_MS, true))
  const idx = quips.map(r => (r.kind === 'quip' ? r.index : -1))
  expect(idx[1]).toBe(((idx[0] ?? 0) + 1) % 10)
  expect(idx[2]).toBe(((idx[1] ?? 0) + 1) % 10)
})

test('two markers: Burned where usage stands, Pace Burn where the pace ends the window', () => {
  const cells = barWithMarkers(30, 70, 40, true)
  const lines = cells.map((c, i) => (c.ch === MARK ? i : -1)).filter(i => i >= 0)
  expect(lines).toEqual([12, 28])
  expect(cells[12]?.color).toBe(BURN_MARK)
  expect(cells[28]?.color).toBe(PACE_MARK)
})

test('no pace, no second marker; a pace on top of usage shows only one', () => {
  expect(barWithMarkers(30, 70, 40, false).filter(c => c.ch === MARK).length).toBe(1)
  expect(barWithMarkers(30, 30, 40, true).filter(c => c.ch === MARK).length).toBe(1)
})

test('POTENTIAL is written across the gray section when it fits, and not when it does not', () => {
  const word = (cells: ReturnType<typeof barWithMarkers>) => cells.map(c => c.ch).join('')
  expect(word(barWithMarkers(20, 50, 40, true))).toContain('POTENTIAL')
  expect(word(barWithMarkers(20, 90, 40, true))).not.toContain('POTENTIAL')
  expect(word(barWithMarkers(20, 100, 40, true))).not.toContain('POTENTIAL')
  // the lettering sits only after the pace marker
  const cells = barWithMarkers(20, 50, 40, true)
  const pace = cells.findIndex(c => c.color === PACE_MARK)
  expect(word(cells).indexOf('POTENTIAL')).toBeGreaterThan(pace)
})

test('the two markers are different colours, and neither is a track or gradient end colour', () => {
  expect(BURN_MARK).not.toBe(PACE_MARK)
  expect(BURN_MARK).not.toBe(TRACK)
  expect(PACE_MARK).not.toBe(TRACK)
})

test('five levels, each a five-bar meter with that many bars lit, in a colour of its own', () => {
  expect(LEVEL_NAMES.length).toBe(5)
  const colors = new Set<string>()
  for (const l of [1, 2, 3, 4, 5] as const) {
    const bars = levelMeter(l)
    expect(bars.length).toBe(5)
    const lit = bars.filter(b => b.color === levelColor(l))
    expect(lit.length).toBe(l)
    expect(bars.slice(0, l).every(b => b.color === levelColor(l))).toBe(true)
    colors.add(levelColor(l))
    expect(levelGlyph(l).color).toBe(levelColor(l))
  }
  expect(colors.size).toBe(5)
  // the bars rise left to right
  expect(levelMeter(5).map(b => b.ch).join('')).toBe('▂▃▅▇█')
})

test('pacing: idle sleeps, a pace that will not last is the top level, the rest follow the projection', () => {
  expect(pacingLevel('idle', 0)).toBe(1)
  expect(pacingLevel('calibrating', 0)).toBe(2)
  expect(pacingLevel('danger', 160)).toBe(5)
  expect(pacingLevel('limit', 100)).toBe(5)
  expect(pacingLevel('ok', 10)).toBe(1)
  expect(pacingLevel('ok', 40)).toBe(2)
  expect(pacingLevel('ok', 70)).toBe(3)
  expect(pacingLevel('tight', 90)).toBe(4)
})

const SEC = 1000
test('no agents, no ring; a finished wave lingers 15 seconds, full, then goes', () => {
  expect(summarize([], 0)).toBeNull()
  let l = recordSpawn([], 'a', 0)
  l = recordDone(l, 'a', 10 * SEC)
  expect(summarize(l, 12 * SEC)?.fraction).toBe(1)
  expect(summarize(l, 12 * SEC)?.running).toBe(0)
  expect(summarize(l, 40 * SEC)).toBeNull()
})

test('a wave counts the running and the ones that finished meanwhile', () => {
  let l = recordSpawn([], 'a', 0)
  l = recordSpawn(l, 'b', 1 * SEC)
  l = recordSpawn(l, 'c', 2 * SEC)
  l = recordDone(l, 'a', 20 * SEC)
  const w = summarize(l, 20 * SEC)!
  expect(w.running).toBe(2)
  expect(w.done).toBe(1)
  expect(w.total).toBe(3)
})

test('before any agent has finished the ETA is unknown; after, it is the average pace', () => {
  let l = recordSpawn([], 'a', 0)
  l = recordSpawn(l, 'b', 0)
  expect(summarize(l, 10 * SEC)?.etaMs).toBeUndefined()
  l = recordDone(l, 'a', 30 * SEC) // one finished in 30 s
  const w = summarize(l, 40 * SEC)! // b has run 40 s, past the average: a small remainder
  expect(w.etaMs).toBeGreaterThan(0)
  expect(w.etaMs).toBeLessThanOrEqual(30 * SEC)
  // b started 10 s before "now"; with a 30 s average it has about 20 s left
  const l2 = recordSpawn(recordDone(recordSpawn([], 'a', 0), 'a', 30 * SEC), 'b', 30 * SEC)
  expect(Math.round((summarize(l2, 40 * SEC)!.etaMs ?? 0) / SEC)).toBe(20)
})

test('progress never reaches 100% while something is still running', () => {
  let l = recordSpawn([], 'a', 0)
  l = recordDone(l, 'a', 10 * SEC)
  l = recordSpawn(l, 'b', 10 * SEC)
  expect(summarize(l, 20 * 60 * SEC)?.fraction).toBeLessThan(1)
})

test('an agent never seen finishing stops counting after half an hour', () => {
  expect(summarize(recordSpawn([], 'a', 0), 31 * 60 * SEC)).toBeNull()
})

test('the ring is a valid SVG with the count and the ETA, and the pie follows the fraction', () => {
  const svg = ringSvg(0.5, '2/4', '~3m')
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('2/4')
  expect(svg).toContain('~3m')
  expect(pieGlyph(0)).toBe('○')
  expect(pieGlyph(1)).toBe('●')
})

test('collapsed chips are short: S 5.5 and Low', () => {
  expect(shortModel('claude-sonnet-5-5')).toBe('S 5.5')
  expect(shortModel('claude-opus-5-5[1m]')).toBe('O 5.5 1M')
  expect(shortModel('claude-fable-5-1')).toBe('F 5.1')
  expect(shortModel(null)).toBe('?')
  expect(shortEffort('low')).toBe('Low')
  expect(shortEffort('medium')).toBe('Med')
  expect(shortEffort('xhigh')).toBe('XHi')
  expect(shortEffort('max')).toBe('Max')
})

test('five square icons, 12 by 12, no two alike, drawn as one flat colour', () => {
  expect(ICONS.length).toBe(5)
  for (const grid of ICONS) {
    expect(grid.length).toBe(12)
    for (const row of grid) expect(row).toMatch(/^[.X]{12}$/)
  }
  expect(new Set(ICONS.map(g => g.join('|'))).size).toBe(5)
  for (const l of [1, 2, 3, 4, 5] as const) {
    const svg = iconSvg(l, '#d97757')
    expect(svg.startsWith('<svg')).toBe(true)
    // the viewBox is square and cropped to the lit pixels, so the glyph is centred in it
    const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number)
    expect(vw).toBe(vh)
    expect(vw).toBeGreaterThan(0)
    expect(Number.isFinite(vx) && Number.isFinite(vy)).toBe(true)
    expect(svg.match(/fill="/g)?.length).toBe(1)
    expect(svg).toContain('<rect')
  }
})

test('each icon is a loop of 12 by 12 frames that holds still in its box', () => {
  expect(FRAMES.length).toBe(5)
  expect(FRAME_MS.length).toBe(5)
  for (const l of [1, 2, 3, 4, 5] as const) {
    const frames = FRAMES[l - 1]!
    expect(frames.length).toBeGreaterThan(1)
    for (const grid of frames) {
      expect(grid.length).toBe(12)
      for (const row of grid) expect(row).toMatch(/^[.X]{12}$/)
    }
    // no two frames in a loop alike, and the resting frame is the icon
    expect(new Set(frames.map(g => g.join('|'))).size).toBeGreaterThan(1)
    expect(frames[0]).toBe(ICONS[l - 1])
    // the viewBox is the same for every frame, so the picture does not jitter as it loops
    const boxes = new Set<string>()
    for (let i = 0; i < frames.length; i++) {
      const svg = iconSvg(l, '#d97757', i * FRAME_MS[l - 1]!)
      boxes.add(svg.match(/viewBox="([^"]+)"/)![1]!)
    }
    expect(boxes.size).toBe(1)
    // the frame follows the clock and wraps
    expect(iconFrame(l, 0)).toBe(0)
    expect(iconFrame(l, FRAME_MS[l - 1]!)).toBe(1)
    expect(iconFrame(l, FRAME_MS[l - 1]! * frames.length)).toBe(0)
    expect(iconSvg(l, '#d97757')).toBe(iconSvg(l, '#d97757', 0))
  }
  // the calm levels loop slower than the hot ones
  expect(FRAME_MS[0]!).toBeGreaterThan(FRAME_MS[4]!)
})

test('the focus hold lasts a few seconds after the last move or press, then lapses', () => {
  expect(isFocusHeld(0, 1_000_000)).toBe(false)
  expect(isFocusHeld(1_000_000, 1_000_000)).toBe(true)
  expect(isFocusHeld(1_000_000, 1_000_000 + FOCUS_HOLD_MS - 1)).toBe(true)
  expect(isFocusHeld(1_000_000, 1_000_000 + FOCUS_HOLD_MS)).toBe(false)
})

test('a context tag does not make a different model, so a clicked override stands', () => {
  expect(sameModel('claude-opus-5-5[1m]', 'claude-opus-5-5')).toBe(true)
  expect(sameModel('claude-opus-5-5', 'claude-opus-5-5')).toBe(true)
  expect(sameModel('claude-opus-5-5', 'claude-sonnet-5-5')).toBe(false)
})

test('only the band\'s own buttons count as focus on the band', () => {
  expect(onBandButton({ element: 'modelChip' })).toBe(true)
  expect(onBandButton({ element: 'effortChip', plugin: 'claudius-modulus' })).toBe(true)
  expect(onBandButton({ element: 'toggle' })).toBe(true)
  expect(onBandButton({ element: 'servers' })).toBe(true)
  expect(onBandButton({})).toBe(false)
  expect(onBandButton({ element: 'something-else' })).toBe(false)
  expect(onBandButton({ element: 'modelChip', plugin: 'other-mod' })).toBe(false)
})

test('cycling steps through the models and efforts, wrapping at the ends', () => {
  expect(modelFamily('claude-opus-5-5[1m]')).toBe('opus')
  expect(modelFamily('sonnet')).toBe('sonnet')
  expect(modelFamily(null)).toBe(null)
  expect(nextModel('claude-fable-5-1', 'next')).toBe('claude-opus-5-5')
  expect(nextModel('claude-haiku-5-5', 'next')).toBe(MODELS[0]!.id)
  expect(nextModel('claude-fable-5-1', 'prev')).toBe('claude-haiku-5-5')
  expect(nextModel(null, 'next')).toBe(MODELS[0]!.id)
  expect(nextModel('something-else', 'prev')).toBe(MODELS[0]!.id)
  expect(nextEffort('high', 'next')).toBe('xhigh')
  expect(nextEffort('max', 'next')).toBe('low')
  expect(nextEffort('low', 'prev')).toBe('max')
  expect(nextEffort(null, 'next')).toBe(EFFORTS[0])
  expect(nextEffort(null, 'prev')).toBe('max')
  expect(resolveModel('Opus')).toBe('claude-opus-5-5')
  expect(resolveModel('claude-opus-4-1')).toBe('claude-opus-4-1')
})

test('/cm reads its words: a kind, a direction or a name, or off', () => {
  expect(parseCm('')).toEqual({ kind: 'help' })
  expect(parseCm('model')).toEqual({ kind: 'model', value: 'next' })
  expect(parseCm('m prev')).toEqual({ kind: 'model', value: 'prev' })
  expect(parseCm('model Opus')).toEqual({ kind: 'model', value: 'opus' })
  expect(parseCm('effort')).toEqual({ kind: 'effort', value: 'next' })
  expect(parseCm('e max')).toEqual({ kind: 'effort', value: 'max' })
  expect(parseCm('effort huge')).toEqual({ kind: 'help' })
  expect(parseCm('off')).toEqual({ kind: 'off' })
  expect(parseCm('reset')).toEqual({ kind: 'off' })
  expect(parseCm('bogus')).toEqual({ kind: 'help' })
  expect(parseCm('quips')).toEqual({ kind: 'quips', value: 'toggle' })
  expect(parseCm('quips off')).toEqual({ kind: 'quips', value: 'off' })
  expect(parseCm('q on')).toEqual({ kind: 'quips', value: 'on' })
  expect(parseCm('quips loud')).toEqual({ kind: 'help' })
})

test('/cm takes a model it can send, and refuses a typo that would fail every request', () => {
  expect(parseCm('model claude-opus-4-1')).toEqual({ kind: 'model', value: 'claude-opus-4-1' })
  expect(parseCm('model claude-opus-5-5[1m]')).toEqual({ kind: 'model', value: 'claude-opus-5-5[1m]' })
  expect(parseCm('model opuss')).toEqual({ kind: 'help' })
  expect(parseCm('model gpt-5')).toEqual({ kind: 'help' })
  expect(isModelName('Haiku')).toBe(true)
  expect(isModelName('claude-sonnet-5-5')).toBe(true)
  expect(isModelName('claude-')).toBe(false)
  expect(isModelName('sonet')).toBe(false)
})

test('the week summary says what is used, where the pace ends it, and when it resets', () => {
  const NOW = Date.parse('2026-10-11T20:00:00Z')
  const week = (percentUsed: number, resetInDays: number): Limit => ({
    kind: 'seven_day',
    percentUsed,
    resetsAt: new Date(NOW + resetInDays * 86_400_000).toISOString(),
  })
  expect(weekSummary(undefined, NOW)).toBe('Week: no reading yet')
  expect(weekSummary(week(30, 3), NOW)).toBe('Week 30% used, projecting 53% at reset, resets in 3d')
  expect(weekSummary(week(90, 3), NOW)).toMatch(/^Week 90% used, runs out in ~11h, resets in 3d$/)
  // too early in the week for a pace: just the use and the reset
  expect(weekSummary(week(10, 6.8), NOW)).toBe('Week 10% used, resets in 7d')
})

test('the week runs out when its pace so far will not last to the reset', () => {
  const DAY = 86_400_000
  const week = (percentUsed: number, resetInDays: number): Limit => ({
    kind: 'seven_day',
    percentUsed,
    resetsAt: new Date(NOW + resetInDays * DAY).toISOString(),
  })
  // four days in at 90%: 22.5% a day, so the last 10% lasts under half a day of the three left
  const hot = weekPace(week(90, 3), NOW)!
  expect(hot.runsOut).toBe(true)
  expect(Math.round(hot.msToEmpty / 3_600_000)).toBe(11)
  // four days in at 30%: 7.5% a day ends the week near 52%
  const calm = weekPace(week(30, 3), NOW)!
  expect(calm.runsOut).toBe(false)
  expect(Math.round(calm.projected)).toBe(53)
  // too early in the week, nothing used, or no window: no pace
  expect(weekPace(week(10, 6.8), NOW)).toBeUndefined()
  expect(weekPace(week(0, 3), NOW)).toBeUndefined()
  expect(weekPace(undefined, NOW)).toBeUndefined()
})

test('the looping icon holds every frame, each shown in its turn, in the resting frame\'s box', () => {
  for (const l of [1, 2, 3, 4, 5] as const) {
    const frames = FRAMES[l - 1]!
    const svg = iconLoopSvg(l, '#d97757')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/viewBox="([^"]+)"/)![1]).toBe(iconSvg(l, '#d97757').match(/viewBox="([^"]+)"/)![1])
    expect(svg.match(/<animate /g)?.length).toBe(frames.length)
    expect(svg).toContain(`dur="${frames.length * FRAME_MS[l - 1]!}ms"`)
    expect(svg).toContain('repeatCount="indefinite"')
    // without SMIL the resting frame shows alone
    expect(svg.match(/<g visibility="visible">/g)?.length).toBe(1)
    expect(svg.indexOf('<g visibility="visible">')).toBeLessThan(svg.indexOf('<g visibility="hidden">'))
    // one colour for the whole loop
    expect(svg.match(/fill="/g)?.length).toBe(1)
  }
})

test('short plain questions are simple; code, paths, work verbs and long prompts are not', () => {
  expect(isSimplePrompt('what does effort mean?')).toBe(true)
  expect(isSimplePrompt('thanks, and why is that?')).toBe(true)
  expect(isSimplePrompt('')).toBe(false)
  expect(isSimplePrompt('fix the login bug')).toBe(false)
  expect(isSimplePrompt('what is in src/app.ts')).toBe(false)
  expect(isSimplePrompt('what does `foo` do?')).toBe(false)
  expect(isSimplePrompt('first line\nsecond line')).toBe(false)
  expect(isSimplePrompt('why '.repeat(60))).toBe(false)
})

test('only ultracode, xhigh and max count as heavy settings', () => {
  expect(heavySetting('high', false)).toBe(null)
  expect(heavySetting(null, false)).toBe(null)
  expect(heavySetting('xhigh', false)).toBe('XHigh effort')
  expect(heavySetting('max', false)).toBe('Max effort')
  expect(heavySetting('low', true)).toBe('Ultracode')
})

test('the overkill toast fires once per streak of simple prompts under heavy settings', () => {
  let streak = 0
  const fired: boolean[] = []
  for (const [simple, heavy] of [[true, true], [true, true], [true, true], [true, true]] as const) {
    const r = nextStreak(streak, simple, heavy)
    streak = r.streak
    fired.push(r.toast)
  }
  expect(fired).toEqual([false, true, false, false])
  // a real task, or lighter settings, ends the streak, and the next streak toasts again
  expect(nextStreak(5, false, true)).toEqual({ streak: 0, toast: false })
  expect(nextStreak(5, true, false)).toEqual({ streak: 0, toast: false })
  expect(nextStreak(nextStreak(0, true, true).streak, true, true).toast).toBe(true)
})
