import { expect, mock, test } from 'claude-code/testing'

import { FRAMES, ICON_NUDGE, iconSvg } from '../hooks/icons'
import { countDevServers, cwdArgs, devServerUrl, pidsInProject, summarizeDevServers } from '../hooks/servers'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 110,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const

test('the band draws on the terminal and the desktop before any reading arrives', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'claudius-modulus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })
    expect(await ui.find({ type: 'Text', text: /usage shows after your first response/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /^v1\.9\.3$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /claudius-modulus/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⚠/ })).toBeUndefined()
    await ui.unmount()
  }
})

const T0 = Date.parse('2026-10-11T20:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const reading = (five: number, week: number) => ({
  context: { window: 200000, tokens: 76000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: iso(T0 + 120 * 60_000) },
    { kind: 'seven_day', percentUsed: week, resetsAt: iso(T0 + 3 * 86_400_000) },
  ],
  cost: { usd: 1.84 },
  changed: ['rateLimits', 'cost', 'context'] as ('rateLimits' | 'cost' | 'context')[],
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`readings fill the band, a hot pace forecasts the run-out, and max effort warns (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    mock.store(on)
    const toasts: string[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined } as never
    })
    on('turn.step', async function* () {
      return {
        turnId: 't1',
        index: 0,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: null,
      }
    })

    const ui = await $.ui.mount({
      plugin: 'claudius-modulus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })

    await $.session.measure(reading(20, 90))
    await clock.advance(30 * 60_000)
    await $.session.measure(reading(50, 90))
    await ui.redraw()

    expect(await ui.find({ type: 'Text', text: /50%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Burned 50%/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /resets in 1h 30m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Pace Burn/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /50% *used|^50%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Tokenzilla/ })).toBeDefined()
    // a plan never shows cost, and context only shows once it is nearly full
    expect(await ui.find({ type: 'Text', text: /\$1\.84/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Limit in ~/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^week out ~11h$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeUndefined()
    expect(toasts.length).toBe(0)

    for await (const _chunk of $.turn.step({
      turnId: 't1',
      index: 0,
      model: 'claude-opus-5-5',
      effort: 'max',
      messageCount: 3,
    })) {
      // drain the stream
    }
    await ui.redraw()

    // T0 sits on an even switch, and 30 minutes is a whole number of them
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()

    // the next switch is a quip's turn, the one after is the warning's again
    await clock.advance(30_000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeUndefined()
    // the quip has its own line, so it shows even in a normal-width band
    expect(await ui.find({ type: 'Text', text: /Limit in ~/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /^v1\.9\.3$/ })).toBeDefined()
    await clock.advance(30_000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeDefined()
    // the version rides after the brand, so it gives way to the warning
    expect(await ui.find({ type: 'Link', text: /^v1\.9\.3$/ })).toBeUndefined()
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toMatch(/MAX EFFORT/)
    await ui.unmount()
  })
}

test('API billing has no plan limits, so it shows cost instead of a bar', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.measure({
    context: { window: 200000, tokens: 1000, percent: 1 },
    rateLimits: [],
    cost: { usd: 3.89 },
    changed: ['cost'],
  })
  await ui.redraw()

  expect(await ui.find({ type: 'Text', text: /\$3\.89 this session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  await ui.unmount()
})

test('a plan is remembered, so cost stays hidden before the first reading of a later session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { 'claudius-modulus:isPlan': true })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

test('the quip and the verdict both show, in a wide band too', async ($, on) => {
  mock.clock(on, { now: T0 + 30_000 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...PROPS, bodyColumns: 240 },
  })
  await $.session.measure(reading(20, 30))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Projecting|Limit in/ })).toBeDefined()
  await ui.unmount()
})

test('the toggle collapses the band to one line and remembers it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.measure(reading(20, 30))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()

  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /resets in/ })).toBeDefined()
  // there is room, so the short forecast shows beside the bar, and the session % leads the bar
  expect(await ui.find({ type: 'Text', text: /^\d+(\.\d)?% $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Projected/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ ?\?? $| \? |S 5/ })).toBeDefined()

  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeDefined()
  await ui.unmount()
})

test('a collapsed band stays collapsed in the next session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { 'claudius-modulus:isCollapsed': true })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on('session.usage', () =>
    ({ value: { startedAt: T0, context: { window: 200000 }, rateLimits: [] } }) as never,
  )
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeUndefined()
  await ui.unmount()
})

for (const [cols, hasMessage] of [
  [62, true],
  [34, false],
] as const) {
  test(`a ${cols}-column collapsed band ${hasMessage ? 'keeps the projected message and shrinks the bar' : 'drops the message but keeps the bar and the reset time'}`, async ($, on) => {
    mock.clock(on, { now: T0 })
    mock.store(on, { 'claudius-modulus:isCollapsed': true })
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
    on('session.usage', () =>
      ({ value: { startedAt: T0, context: { window: 200000 }, rateLimits: [] } }) as never,
    )
    const ui = await $.ui.mount({
      plugin: 'claudius-modulus',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { ...PROPS, bodyColumns: cols },
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await $.session.measure(reading(20, 30))
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /resets/ })).toBeDefined()
    const message = await ui.find({ type: 'Text', text: /Projected/ })
    expect(message !== undefined).toBe(hasMessage)
    await ui.unmount()
  })
}

test('the cursor after the brand blinks on its own as the clock runs', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: PROPS,
  })
  const seen = new Set<string>()
  for (let i = 0; i < 4; i++) {
    const el = await ui.find({ type: 'Text', text: /^_$/ })
    seen.add(JSON.stringify(el))
    await clock.advance(1000)
    await ui.redraw()
  }
  expect(seen.size).toBeGreaterThan(1)
  await ui.unmount()
})

test('the expanded band draws the weekly bar under the session bar', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.measure(reading(20, 52))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /▃/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▔/ })).toBeUndefined()
  await ui.unmount()
})

test('the band cycles the model and effort, and the override rides on the next request', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  const seen: { model: string; effort?: unknown }[] = []
  on('turn.step', async function* (_$, e) {
    seen.push({ model: e.model, effort: e.effort })
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  const cm = async (args: string) =>
    (
      await $.command.run({
        command: 'cm',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 110 },
      })
    ).text
  const step = async (model: string, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max') => {
    for await (const _chunk of $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 })) {
      // drain
    }
  }

  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await step('claude-fable-5-1', 'high')
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /Fable 5.1/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'modelChip' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'effortChip' })).toBeDefined()

  // a press on the model button: the chip changes at once, the next request uses it
  await ui.press({ key: 'modelChip' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()
  expect(toasts.at(-1)).toMatch(/Model: Opus 5.5/)
  await step('claude-fable-5-1', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })

  // the effort button steps the effort; the model override stays
  await ui.press({ key: 'effortChip' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /xhigh/ })).toBeDefined()
  await step('claude-fable-5-1', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })

  // the chips cycle too
  await ui.press({ key: 'modelChip' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /Sonnet 5.5/ })).toBeDefined()
  await ui.press({ key: 'effortChip' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /max/ })).toBeDefined()
  await ui.press({ key: 'modelChip' })
  await ui.press({ key: 'modelChip' })
  await ui.press({ key: 'modelChip' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()
  await step('claude-fable-5-1', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'max' })

  // the person changes the model themselves: the engine's choice wins and the override clears
  await step('claude-sonnet-5-5', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /Sonnet 5.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /xhigh/ })).toBeUndefined()

  // the slash command: a name, a direction, and off
  expect(await cm('effort max')).toMatch(/Effort: max/)
  await step('claude-sonnet-5-5', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'max' })
  expect(await cm('model prev')).toMatch(/Model: Opus 5.5/)
  await step('claude-sonnet-5-5', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'max' })
  expect(await cm('off')).toMatch(/cleared/)
  await step('claude-sonnet-5-5', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  expect(await cm('nonsense')).toMatch(/Usage/)

  // a model name it cannot send is refused, and the next request keeps the session's model
  expect(await cm('model opuss')).toMatch(/Usage/)
  await step('claude-sonnet-5-5', 'high')
  expect(seen.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the collapse toggle sits at the top right in both shapes (${surface})`, async ($, on) => {
    mock.clock(on, { now: T0 })
    mock.store(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    const ui = await $.ui.mount({
      plugin: 'claudius-modulus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })
    await $.session.measure(reading(20, 30))
    await ui.redraw()
    // expanded, the toggle is drawn on its own row above the chips; collapsed, it ends the line
    const order = async () => (await ui.findAll({ type: 'Button' })).map(b => b.key)
    // the desktop's native button gets a word beside its sign; the terminal's [ − ] is wide already
    const less = surface === 'desktop' ? /^− Less$/ : /^−$/
    const more = surface === 'desktop' ? /^\+ More$/ : /^\+$/
    expect((await order())[0]).toBe('toggle')
    expect(await ui.find({ type: 'Button', key: 'toggle', text: less })).toBeDefined()
    await ui.press({ key: 'toggle' })
    await ui.redraw()
    expect((await order()).at(-1)).toBe('toggle')
    expect(await ui.find({ type: 'Button', key: 'toggle', text: more })).toBeDefined()
    await ui.press({ key: 'toggle' })
    await ui.redraw()
    expect(await ui.find({ type: 'Button', key: 'toggle', text: less })).toBeDefined()
    await ui.unmount()
  })
}

test('the quips turn off and stay off, leaving the brand and its cursor', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const cm = async (args: string) =>
    (
      await $.command.run({
        command: 'cm',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 110 },
      })
    ).text
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeDefined()
  expect(await cm('quips off')).toMatch(/Quips off/)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /claudius-modulus/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^_$/ })).toBeDefined()
  expect(await cm('quips')).toMatch(/Quips on/)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeDefined()
  await ui.unmount()
})

test('a fold or a quips switch made in another open session reaches this one', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  // one store file for every session: this session's reads see what another session wrote
  const disk = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: disk.get(e.key) }) as never)
  on('store.set', (_$, e) => {
    disk.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on('session.usage', () =>
    ({ value: { startedAt: T0, context: { window: 200000 }, rateLimits: [] } }) as never,
  )
  on('command.register', () => ({ value: undefined }) as never)
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'toggle', text: /^− Less$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeDefined()

  // another session folds the band and turns the quips off
  disk.set('claudius-modulus:isCollapsed', true)
  disk.set('claudius-modulus:isQuiet', true)
  await clock.advance(2000)
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'toggle', text: /^\+ More$/ })).toBeDefined()

  // opened here, it stays open: the press writes the store, so the next look agrees
  await ui.press({ key: 'toggle' })
  await clock.advance(2000)
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'toggle', text: /^− Less$/ })).toBeDefined()
  expect(disk.get('claudius-modulus:isCollapsed')).toBe(false)
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeUndefined()

  // and the other session turns the quips back on
  disk.set('claudius-modulus:isQuiet', false)
  await clock.advance(2000)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeDefined()
  await ui.unmount()
})

test('quips turned off stay off in the next session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { 'claudius-modulus:isQuiet': true })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on('session.usage', () =>
    ({ value: { startedAt: T0, context: { window: 200000 }, rateLimits: [] } }) as never,
  )
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /“/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /claudius-modulus/ })).toBeDefined()
  await ui.unmount()
})

test('a nearly full context says how to free it, and a week that will not last says when it runs out', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...PROPS, bodyColumns: 160 },
  })
  await $.session.measure({ ...reading(20, 70), context: { window: 200000, tokens: 180000, percent: 90 } })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /context 90% full, \/compact/ })).toBeDefined()
  // four days in at 70%: the last 30% lasts under two of the three days left
  expect(await ui.find({ type: 'Text', text: /^week out ~1d \d+h$/ })).toBeDefined()
  await ui.unmount()
})

test('a week half used shows beside the bar, and a click on the bar toasts the week', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const toasts: string[] = []
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...PROPS, bodyColumns: 160 },
  })
  // four days in at 52%: the pace lasts, ending the week near 91%
  await $.session.measure(reading(20, 52))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^week 52%$/ })).toBeDefined()
  // only the reset time is the button: a desktop would bleach a bar drawn inside one
  const button = await ui.find({ type: 'Button', key: 'sessionBar' })
  expect(JSON.stringify(button)).toMatch(/resets in/)
  expect(JSON.stringify(button)).not.toMatch(/[█▓▒░▏▎▍▌▋▊▉]/)
  await ui.press({ key: 'sessionBar' })
  // the toast gives both windows in full: session on one line, week on the next
  expect(toasts.at(-1)).toBe(
    'Session 20% used, 80% left, resets in 2h, projecting 33% at reset\nWeek 52% used, 48% left, projecting 91% at reset, resets in 3d',
  )
  await ui.unmount()
})

// The level icon sits in the middle of its box: the resting frame's lit pixels are centred
// in the viewBox, whatever the shape (the bolt leans).
for (const level of [1, 2, 3, 4, 5] as const) {
  test(`the level ${level} icon is centred in its box`, () => {
    const svg = iconSvg(level, '#000')
    const [vx, vy, side] = svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number, number, number]
    const rects = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)]
    const rest = FRAMES[level - 1]![0]!
    const minX = Math.min(...rects.map(r => Number(r[1])))
    const maxX = Math.max(...rects.map(r => Number(r[1]) + Number(r[3])))
    const minY = Math.min(...rects.map(r => Number(r[2])))
    const maxY = Math.max(...rects.map(r => Number(r[2]) + Number(r[4])))
    // the rects are the resting frame's lit pixels, so their bounds are the glyph's own
    expect(rest.length).toBe(12)
    const near = (n: number) => Math.round(n * 1000) / 1000
    expect(near(vx + side / 2)).toBe(near((minX + maxX) / 2 - ICON_NUDGE))
    expect(near(vy + side / 2)).toBe(near((minY + maxY) / 2))
  })
}

test('the dev servers counted from lsof are the processes that run python, node or the like on a dev port', () => {
  const out = [
    // a Python server on 8000, a node server on both stacks of 5173: two servers
    'p6119', 'cPython', 'f4', 'n*:8000',
    'p93234', 'cnode', 'f20', 'n127.0.0.1:5173', 'f21', 'n[::1]:5173',
    // wrangler dev: workerd serves 8787, the wrangler CLI beside it listens on high ports
    'p700', 'cworkerd', 'f9', 'n127.0.0.1:8787', 'f10', 'n127.0.0.1:9229',
    'p701', 'cnode', 'f32', 'n[::1]:49666',
    // not dev commands, whatever their ports
    'p500', 'cGoogle Chrome', 'f3', 'n*:3000', 'p501', 'cControlCenter', 'f10', 'n*:7000',
  ].join('\n')
  expect(countDevServers(out)).toBe(3)
  expect(countDevServers('')).toBe(0)
  // the band opens the lowest-port server
  expect(summarizeDevServers(out)).toEqual({ count: 3, port: 5173 })
  expect(summarizeDevServers('')).toEqual({ count: 0, port: null })
  expect(devServerUrl(5173)).toBe('http://localhost:5173')
})

test('the band opens the dev server running in this project, else the lowest port', () => {
  const out = ['p6119', 'cPython', 'n*:8000', 'p93234', 'cnode', 'n127.0.0.1:5173'].join('\n')
  const cwds = ['p6119', 'n/Users/a/Sites/app/api', 'p93234', 'n/Users/a/Sites/other'].join('\n')
  const here = pidsInProject(cwds, '/Users/a/Sites/app')
  expect([...here]).toEqual(['6119'])
  expect(summarizeDevServers(out, here)).toEqual({ count: 2, port: 8000 })
  // a sibling folder with the same prefix is not this project
  expect(pidsInProject('p1\nn/Users/a/Sites/app2', '/Users/a/Sites/app').size).toBe(0)
  // no server here: the lowest port overall
  expect(summarizeDevServers(out, new Set())).toEqual({ count: 2, port: 5173 })
  expect(cwdArgs(['1', '2']).slice(-2)).toEqual(['-p', '1,2'])
})
