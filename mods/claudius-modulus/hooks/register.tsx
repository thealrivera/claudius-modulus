import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
} from 'claude-code'

import type { Limit, Override } from '../types'
import { CM_USAGE, nextEffort, nextModel, parseCm, resolveModel, sameModel } from './cycle'
import type { Dir } from './cycle'
import {
  FIVE_HOUR,
  heavySetting,
  isFocusHeld,
  isSimplePrompt,
  nextStreak,
  prettyModel,
  pushSample,
  SEVEN_DAY,
  warnings,
  usageBreakdown,
  worstRank,
} from './logic'
import { recordDone, recordSpawn, summarize } from './work'
import { band, onBandButton } from './view'
import { LSOF_ARGS, SERVERS_EVERY_MS, cwdArgs, devServerUrl, devServers, pidsInProject, summarizeDevServers } from './servers'

const model = atom({ plugin: 'claudius-modulus', key: 'model' } as const, null)
const effort = atom({ plugin: 'claudius-modulus', key: 'effort' } as const, null)
const override = atom({ plugin: 'claudius-modulus', key: 'override' } as const, null)
// An override from the band stands until the person changes the engine's own model or
// effort (/model, the picker, the effort slider): then the engine's choice wins and the
// override clears. The `engine` atom holds what the last main-loop step named, and
// `toasted` the highest warning rank already toasted, so each level toasts once.
const engine = atom({ plugin: 'claudius-modulus', key: 'engine' } as const, { model: null, effort: null })
const toasted = atom({ plugin: 'claudius-modulus', key: 'toasted' } as const, 0)
const simpleRun = atom({ plugin: 'claudius-modulus', key: 'simpleRun' } as const, 0)
const isUltracode = atom({ plugin: 'claudius-modulus', key: 'isUltracode' } as const, false)
const isPlan = atom({ plugin: 'claudius-modulus', key: 'isPlan' } as const, false)
const isCollapsed = atom({ plugin: 'claudius-modulus', key: 'isCollapsed' } as const, false)
const isQuiet = atom({ plugin: 'claudius-modulus', key: 'isQuiet' } as const, false)
const agents = atom({ plugin: 'claudius-modulus', key: 'agents' } as const, [])
const limits = atom({ plugin: 'claudius-modulus', key: 'limits' } as const, [])
const samples = atom({ plugin: 'claudius-modulus', key: 'samples' } as const, [])
const costUsd = atom({ plugin: 'claudius-modulus', key: 'costUsd' } as const, null)
const ctxPercent = atom({ plugin: 'claudius-modulus', key: 'ctxPercent' } as const, null)
const tick = atom({ plugin: 'claudius-modulus', key: 'tick' } as const, 0)
const servers = atom({ plugin: 'claudius-modulus', key: 'servers' } as const, null)
// When the focus last moved onto, or pressed, one of the band's buttons (0: not on the
// band). While that hold lasts (`isFocusHeld`) the band's own timers and the usage refresh
// hold off; only what the press itself changes redraws it.
const focusedAt = atom({ plugin: 'claudius-modulus', key: 'focusedAt' } as const, 0)

async function holding($: EngineInterface): Promise<boolean> {
  return isFocusHeld(await read($, focusedAt), await $.clock.now())
}

// A press on the band keeps the hold, so a run of clicks lands on steady buttons.
async function hold($: EngineInterface) {
  const now = await $.clock.now()
  await update($, focusedAt, () => now)
}

type Measured = {
  context: SessionContextUsage
  rateLimits: SessionRateLimit[]
  cost?: SessionCost
}

const ULTRACODE_WORD = /\bultracode\b/i
// How often the band redraws on its own. Expanded: one step of the cursor's blink and the
// rule's breathing (the desktop's level icon loops inside its own SVG, so nothing needs a
// faster redraw). A quicker redraw makes the band flash and drops clicks that land while a
// button is rebuilt. Collapsed: only the reset countdown shows, in minutes. While the
// keyboard focus sits on one of the band's buttons, nothing redraws it on its own (see
// `focusedAt`), so a press lands on the button it was aimed at.
const REDRAW_EVERY_MS = 1000
const COLLAPSED_REDRAW_MS = 30_000
const TIMER_SLACK_MS = 100

const PLAN_KEY = 'claudius-modulus:isPlan'
const COLLAPSE_KEY = 'claudius-modulus:isCollapsed'
const QUIET_KEY = 'claudius-modulus:isQuiet'
// The store is one file for every session of this install, and each read reads it afresh,
// so a session that looks every few seconds follows a fold or a quips switch made in another.
const SYNC_EVERY_MS = 2000

async function ingest($: EngineInterface, u: Measured) {
  const now = await $.clock.now()
  const next: Limit[] = u.rateLimits.map(l => ({
    kind: l.kind,
    percentUsed: l.percentUsed,
    resetsAt: l.resetsAt,
  }))
  await update($, limits, () => next)
  // Rate-limit windows only come with a Claude plan; remember that across sessions.
  if (next.length > 0 && !(await read($, isPlan))) {
    await update($, isPlan, () => true)
    await $.store.set(PLAN_KEY, true)
  }
  await update($, costUsd, () => u.cost?.usd ?? null)
  await update($, ctxPercent, () => u.context.percent ?? null)
  const five = next.find(l => l.kind === FIVE_HOUR)
  if (five) await update($, samples, prev => pushSample(prev, now, five))
}

// The local dev servers listening now, or null when lsof cannot say.
async function countServers($: EngineInterface): Promise<{ count: number; port: number | null } | null> {
  try {
    const { stdout } = await $.process.run([...LSOF_ARGS], { timeoutMs: 5000 })
    // Prefer the server running in this session's project; any failure falls back to the lowest port.
    let here: Set<string> | undefined
    try {
      const root = String(await $.session.cwd())
      const pids = devServers(stdout).map(f => f.pid)
      if (root && pids.length) here = pidsInProject((await $.process.run(cwdArgs(pids), { timeoutMs: 5000 })).stdout, root)
    } catch {}
    return summarizeDevServers(stdout, here)
  } catch {
    return null
  }
}

async function alertIfWorse($: EngineInterface) {
  const list = warnings(await read($, effort), await read($, isUltracode), await read($, limits))
  const rank = worstRank(list)
  if (rank > (await read($, toasted)) && list[0]) {
    $.ui.toast(`⚠ ${list[0].label}: ${list[0].detail}`, { timeoutMs: 7000 })
  }
  await update($, toasted, () => rank)
}

// Quiet by default: after a short run of plain questions under ultracode or high effort,
// one toast says the setting is more than the task needs. Any other prompt starts it over.
async function checkOverkill($: EngineInterface, text: string) {
  if (await read($, isQuiet)) return
  const heavy = heavySetting(await read($, effort), await read($, isUltracode))
  const r = nextStreak(await read($, simpleRun), isSimplePrompt(text), heavy !== null)
  await update($, simpleRun, () => r.streak)
  if (r.toast && heavy) {
    $.ui.toast(`${heavy} on quick questions: a lower setting would answer these for less`, { timeoutMs: 7000 })
  }
}

// Sets the model or effort the next request uses, shows it on the chips at once, and says so.
async function setOverride($: EngineInterface, patch: { model?: string; effort?: string }) {
  const prev = (await read($, override)) ?? { model: null, effort: null, sawModel: null, sawEffort: null }
  const seen = await read($, engine)
  const next: Override = {
    model: patch.model ?? prev.model,
    effort: patch.effort ?? prev.effort,
    sawModel: seen.model,
    sawEffort: seen.effort,
  }
  await update($, override, () => next)
  if (patch.model !== undefined) await update($, model, () => patch.model!)
  if (patch.effort !== undefined) await update($, effort, () => patch.effort!)
  await alertIfWorse($)
  const said =
    patch.model !== undefined ? `Model: ${prettyModel(patch.model)}` : `Effort: ${patch.effort}`
  $.ui.toast(`${said} from the next request`)
  return said
}

async function cycleModel($: EngineInterface, dir: Dir) {
  return setOverride($, { model: nextModel(await read($, model), dir) })
}

async function cycleEffort($: EngineInterface, dir: Dir) {
  return setOverride($, { effort: nextEffort(await read($, effort), dir) })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, model, () => null)
    const m = await $.session.model()
    await update($, engine, prev => ({ ...prev, model: m }))
    await update($, model, () => m)
    const plan = (await $.store.get(PLAN_KEY)) === true
    await update($, isPlan, () => plan)
    const collapsed = (await $.store.get(COLLAPSE_KEY)) === true
    await update($, isCollapsed, () => collapsed)
    const quiet = (await $.store.get(QUIET_KEY)) === true
    await update($, isQuiet, () => quiet)
    await ingest($, await $.session.usage())
    await $.command.register({
      name: 'cm',
      description: 'claudius-modulus: cycle the model or effort for the next request, or turn the quips off',
      argumentHint: 'model|effort [next|prev|name] | quips [on|off] | off',
      immediate: true,
    })
    // `tick` holds when the band last redrew on its own.
    $.clock.every(REDRAW_EVERY_MS, async () => {
      if (await holding($)) return
      const step = (await read($, isCollapsed)) ? COLLAPSED_REDRAW_MS : REDRAW_EVERY_MS
      const now = await $.clock.now()
      if (now - (await read($, tick)) >= step - TIMER_SLACK_MS) await update($, tick, () => now)
    })
    $.clock.every(SERVERS_EVERY_MS, async () => {
      if (await holding($)) return
      const n = await countServers($)
      await update($, servers, () => n)
    })
    void countServers($).then(n => update($, servers, () => n))
    $.clock.every(SYNC_EVERY_MS, async () => {
      if (await holding($)) return
      const collapsed = (await $.store.get(COLLAPSE_KEY)) === true
      if ((await read($, isCollapsed)) !== collapsed) await update($, isCollapsed, () => collapsed)
      const quiet = (await $.store.get(QUIET_KEY)) === true
      if ((await read($, isQuiet)) !== quiet) await update($, isQuiet, () => quiet)
    })
    return next(e)
  })

  // Skipped while the band has the focus; the next measure after it leaves catches up.
  on('session.measure', async ($, e, next) => {
    if (await holding($)) return next(e)
    await ingest($, e)
    await alertIfWorse($)
    return next(e)
  })

  // The model and effort the main loop is using right now, with the band's override laid
  // over the engine's own choice on each request.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const stepEffort = e.effort === undefined ? null : String(e.effort)
    let o = await read($, override)
    if (o) {
      const changed =
        (o.sawModel !== null && !sameModel(e.model, o.sawModel)) ||
        (o.sawEffort !== null && stepEffort !== o.sawEffort)
      if (changed) {
        o = null
        await update($, override, () => null)
      }
    }
    await update($, engine, () => ({ model: e.model, effort: stepEffort }))

    const usedModel = o?.model ?? e.model
    const usedEffort = o?.effort ?? stepEffort
    if ((await read($, model)) !== usedModel || (await read($, effort)) !== usedEffort) {
      await update($, model, () => usedModel)
      await update($, effort, () => usedEffort)
      await alertIfWorse($)
    }
    if (!o) return yield* next(e)
    const rewritten = { ...e }
    if (o.model !== null) rewritten.model = o.model
    if (o.effort !== null) rewritten.effort = o.effort as typeof e.effort
    return yield* next(rewritten)
  })

  // /cm model next, /cm effort max, /cm off.
  on('command.run', { command: 'cm' }, async ($, e) => {
    const req = parseCm(e.args)
    switch (req.kind) {
      case 'model': {
        const said =
          req.value === 'next' || req.value === 'prev'
            ? await cycleModel($, req.value)
            : await setOverride($, { model: resolveModel(req.value) })
        return { text: said }
      }
      case 'effort': {
        const said =
          req.value === 'next' || req.value === 'prev'
            ? await cycleEffort($, req.value)
            : await setOverride($, { effort: req.value })
        return { text: said }
      }
      case 'quips': {
        const wasQuiet = await read($, isQuiet)
        const quiet = req.value === 'toggle' ? !wasQuiet : req.value === 'off'
        // The store first: a sync between the two writes then agrees with the new choice.
        await $.store.set(QUIET_KEY, quiet)
        await update($, isQuiet, () => quiet)
        return { text: quiet ? 'Quips off. /cm quips on brings them back.' : 'Quips on.' }
      }
      case 'off': {
        await update($, override, () => null)
        const seen = await read($, engine)
        if (seen.model !== null) await update($, model, () => seen.model)
        await update($, effort, () => seen.effort)
        await alertIfWorse($)
        return { text: 'Override cleared: the session model and effort are back.' }
      }
      default:
        return { text: CM_USAGE }
    }
  })

  // Agents, workflow agents and background agents: when each starts and when it finishes.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = 'agentId' in started ? started.agentId : undefined
    if (id) {
      const now = await $.clock.now()
      await update($, agents, prev => recordSpawn(prev, id, now))
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await update($, agents, prev => recordDone(prev, id, now))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Ultracode is a turn-level mode: the word in a prompt, or a Workflow run.
  on('prompt.submit', async ($, e, next) => {
    // A prompt means the person is back in the composer, off the band.
    if ((await read($, focusedAt)) !== 0) await update($, focusedAt, () => 0)
    await update($, isUltracode, () => ULTRACODE_WORD.test(e.text))
    await alertIfWorse($)
    if (!e.command) await checkOverkill($, e.text)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    await update($, isUltracode, () => true)
    await alertIfWorse($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The keyboard ring moving over the band (ctrl+x tab, then the arrows).
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (onBandButton(e)) await hold($)
    else if ((await read($, focusedAt)) !== 0) await update($, focusedAt, () => 0)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // Read so the countdowns, the icon loop and the second row redraw on each tick.
    await read($, tick)

    const ui = $.ui.resolve(e)
    return band(ui, {
      model: await read($, model),
      effort: await read($, effort),
      isUltracode: await read($, isUltracode),
      isPlan: await read($, isPlan),
      isCollapsed: await read($, isCollapsed),
      isQuiet: await read($, isQuiet),
      servers: await read($, servers),
      work: summarize(await read($, agents), await $.clock.now()),
      // The store first, as for the quips; every open session follows it.
      onToggle: async () => {
        const folded = !(await read($, isCollapsed))
        await $.store.set(COLLAPSE_KEY, folded)
        await update($, isCollapsed, () => folded)
      },
      onOpenServer: async () => {
        const port = (await read($, servers))?.port
        if (port) await $.process.run(['open', devServerUrl(port)], { timeoutMs: 5000 }).catch(() => undefined)
      },
      onCycleModel: async () => {
        await hold($)
        await cycleModel($, 'next')
      },
      onCycleEffort: async () => {
        await hold($)
        await cycleEffort($, 'next')
      },
      onSessionBar: async () => {
        await hold($)
        const all = await read($, limits)
        const text = usageBreakdown(
          all.find(l => l.kind === FIVE_HOUR),
          all.find(l => l.kind === SEVEN_DAY),
          await read($, samples),
          await $.clock.now(),
        )
        $.ui.toast(text, { timeoutMs: 9000 })
      },
      limits: await read($, limits),
      samples: await read($, samples),
      costUsd: await read($, costUsd),
      ctxPercent: await read($, ctxPercent),
      now: await $.clock.now(),
      surface: e.surface,
      cols: Math.max(30, e.props.bodyColumns),
    })
  })
}
