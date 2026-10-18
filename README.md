<div align="center">

<img src="docs/promo/social.png" alt="Claudius Modulus: your usage in one glance, your model in one click" width="100%">

# claudius-modulus

**A live band above your Claude Code prompt.**<br>
See what is answering, how hard it is thinking, and when you will run out. Click a chip to change it.

[**Install in one paste**](#install-in-one-step) &nbsp;·&nbsp; [Clicks saved](#how-many-clicks-it-saves) &nbsp;·&nbsp; [Features](#highlights) &nbsp;·&nbsp; [Landing page](https://thealrivera.github.io/claudius-modulus/)

![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.295%2B-7d66ff?style=flat-square)
![Auto-update](https://img.shields.io/badge/auto--update-on-6ee7a8?style=flat-square)
![Free](https://img.shields.io/badge/price-free-9d8dff?style=flat-square)

</div>

---

```
 ◆ Sonnet 5.5  ◉ xhigh  Session ████████░░░░░░░░ 31%  resets 3h 55m · runs out in ~2h 30m
 ▌ claudius-modulus_ v1.9.3 - “A token burned is a token earned.”
```

## Why

Claude Code makes you dig for the two things you check most.

- **Usage** is a command you type, read and dismiss.
- **Effort** is three actions: open the model picker, open the Effort submenu, choose.
- **Model** is its own path, with older models hidden under *More models*.

This mod puts all of it in one band that is always on screen. You glance to see where you stand and click a chip to change it.

## How many clicks it saves

<img src="docs/promo/clicks.png" alt="Built in: 3, 3 and 2 actions. With the band: 0, 1 and 1." width="100%">

| Task | Built in | With the band |
| --- | :---: | :---: |
| Check usage | 3 (type `/usage`, Enter, close) | **0** (always visible) |
| Change effort | 3 (open, Effort, choose) | **1** (click the chip) |
| Change model | 2 (open, choose) | **1** (click the chip) |

For a heavy user (12 usage checks, 6 effort changes and 4 model changes a day) that is roughly **40 fewer clicks a day**, about 10,000 a year. This is an estimate from counting menu actions, not measured telemetry. The chips step to the next option, so we assume two clicks on average per change. `/cm model opus` or `/cm effort max` jumps straight there. Model changes come out roughly even on click count; the win is not hunting through menus. Try your own numbers on the [landing page](https://thealrivera.github.io/claudius-modulus/#clicks).

## Highlights

| | |
| --- | --- |
| **Click to switch** | Model and effort chips step to the next option for your next request. |
| **Run-out forecast** | Your 5-hour usage bar shows where your current pace ends the window. |
| **Overkill toast** | One gentle nudge when max effort is more than a tiny question needs. |
| **Background work ring** | Progress and time left while sub-agents and workflows run. |
| **Level meter** | From *You have work to do* to *Tokenzilla*. |
| **Pep talks** | Ten rotating one-liners. `/cm quips off` silences them. |

## Install in one step

Paste this to Claude Code:

> Go to https://github.com/thealrivera/claudius-modulus and follow the install steps in the README.

That's all. The steps below are what it will follow, so you can also run them yourself.

## Install steps

*Claude: do these in order, using the Bash tool. Stop and tell the user if a step fails.*

1. **Check the version.** Run `claude --version`. It must be 2.1.295 or newer. If it is older, find a newer
   `claude` binary and use it for steps 2, 3 and 5. The Claude desktop app keeps one under
   `~/Library/Application Support/Claude/claude-code/<version>/`. Tell the user which one you used.
2. **Add the marketplace.**
   ```bash
   claude plugin marketplace add thealrivera/claudius-modulus
   ```
3. **Install the mod** for the user (every session):
   ```bash
   claude plugin install claudius-modulus@claudius-modulus --scope user
   ```
4. **Turn on auto-update**, so every change merged to `main` reaches this user. Third-party marketplaces have it off by
   default and the repo cannot switch it on for them, so set it in the user's settings. Open `~/.claude/settings.json`
   (or `settings.json` in the folder `CLAUDE_CONFIG_DIR` points to, if it is set). Step 2 already wrote
   `extraKnownMarketplaces.claudius-modulus` there. Add `"autoUpdate": true` to that entry and change nothing else:
   ```json
   "extraKnownMarketplaces": {
     "claudius-modulus": {
       "source": { "source": "github", "repo": "thealrivera/claudius-modulus" },
       "autoUpdate": true
     }
   }
   ```
   Tell the user you did this. They can undo it in `/plugin`, under Marketplaces, by choosing Disable auto-update.
5. **Confirm.** `claude plugin list` should show `claudius-modulus@claudius-modulus` as `enabled`.
6. **Tell the user** to start a new session, or run `/reload-plugins` in an open one. The band appears above the prompt.

Install from a terminal, not from inside the desktop app's Code tab: `/plugin install` is not available there, but the
`claude plugin ...` commands above work from any terminal or from Claude's Bash tool.

<details>
<summary><b>Full feature reference</b></summary>

### What it shows (v1.9.3)

- **Model and effort chips:** what is answering, and how hard it is thinking.
- **Session bar (Claude plans):** share of your 5-hour usage window used. Solid is used, dim is where your current
  pace ends the window, dark is free. The text says when it resets and whether you will run out first. The week
  shows when its pace so far would use it up before it resets (`week out ~11h`), or once it passes 50%. Click the reset
  time for a toast with the week's usage, where its pace ends it, and when it resets. Context shows past 85%, with a
  `/compact` hint.
- **Second row:** ten token-maxxing one-liners, switching every 30 seconds. When a warning applies (extra `xhigh`
  or `max` effort, an ultracode or Workflow run, a full usage window) it takes every other switch, and a toast
  announces it the first time. `/cm quips off` turns the one-liners off and leaves the brand and its cursor;
  `/cm quips on` brings them back. The choice is remembered between sessions, and other open sessions follow it
  within a couple of seconds.
- **Overkill toast:** after two short, plain questions in a row (no code, paths or work verbs) under ultracode,
  `xhigh` or `max` effort, one toast says the setting is more than the task needs. It is a guess from the prompt's
  text, fires once per run, starts over after any real task, and stays off with `/cm quips off`.
- **API billing:** there are no plan limits, so it shows session cost instead of the bar.
- **Level icon:** on the desktop a pixel icon for the level sits beside the chips, and it moves: the moon's star twinkles, the cup steams, the chevrons march, the bolt sparks, the flame flickers.
- **Cycle the model and effort:** click the model chip or the effort chip to step to the next model (Fable, Opus, Sonnet, Haiku) or the next effort (low to max) for your next request. The chips change at once and a toast confirms it. The same from the prompt: `/cm model next`, `/cm model opus`, `/cm model claude-opus-4-1`, `/cm effort prev`, `/cm effort max`, and `/cm off` to drop the override. A model name it does not know is refused, so a typo never rides on your requests. The band's choice rides on each request until you change the model or effort yourself (`/model`, the picker, the effort slider); then the engine's choice wins. The built-in picker keeps showing the session's own setting, not the band's.
- **Level meter:** a five-bar symbol under the model chip (`▂▃▅▇█`, one bar lit to all five) with a name (You have work to do, Warming Up, Tokenizing, Tokenmaxxing, Tokenzilla), shown as "Level N - name": how well you are pacing toward using every token.
- **Background work ring:** while sub-agents, workflow agents or background agents run, a ring in the middle shows how many have finished and an estimated time to completion (a pie and a count in a terminal).
- **Collapse:** the button at the top left (`− Less` on the desktop, `[ − ]` in a terminal) folds the band to one line (a tiny level glyph, the model and effort chips, the bar and the reset time). The same spot (`+ More`, `[ + ]`) brings it back. It sits at the left so it is never mistaken for Claude Code's own `[-]` at the right end, which collapses the whole band. The choice is remembered between sessions, and other open sessions fold or open with it within a couple of seconds. Collapsed, the chips shorten (`S 5.5`, `Low`), the session % leads the bar, and a short `Projected:` forecast sits beside it when there is room.
- **Brand and version:** a blinking cursor, `claudius-modulus` and the version lead the quote row at the lower left, and a rule below it breathes slowly in the cursor's colours; on the top row, left of the collapse button, the band shows how many local dev servers are listening (python, node, workerd and the like, on a port from 1024 to 9999, counted with lsof every 15 seconds).

</details>

## Updates

With auto-update on (step 4), a merge to `main` reaches users on its own: in a session, a few minutes after the first
message, Claude Code fetches the new commit and shows `Plugin updated: claudius-modulus · Run /reload-plugins to apply`.
Run `/reload-plugins` to switch to it now, or it loads the next time Claude Code starts. Auto-update is off if the user
sets `DISABLE_AUTOUPDATER=1` or `DISABLE_UPDATES=1`.

To update by hand:

```bash
claude plugin marketplace update claudius-modulus
claude plugin update claudius-modulus@claudius-modulus
```

```bash
claude plugin uninstall claudius-modulus@claudius-modulus
```

## Versions

Installed copies are versioned by commit, so users always follow `main`.

Releases are tagged (`v1.0.0`) and listed under [Releases](https://github.com/thealrivera/claudius-modulus/releases).
`v1.0.0` is the locked first release (published as `usage-band`, renamed `claudeus-maximus` then `claudius-maximus` in v1.1.0, and `claudius-modulus` after that); `main` may move ahead of it.

## For the maintainer

- Each mod lives in `mods/<name>/` and is listed in `.claude-plugin/marketplace.json`.
- Do not set `version` in `plugin.json` or in the marketplace entry. Without one, Claude Code uses the commit SHA, so every
  merge to `main` is an update for installed users. A pinned version would keep everyone on the old copy until it changes.
- The label on the band comes from `mods/<name>/hooks/version.ts`. Change it only for a visible release, then cut it:
  `git tag -a vX.Y.Z -m "..."`, `git push origin vX.Y.Z`, `gh release create vX.Y.Z`.
- Check a mod before pushing:
  ```bash
  claude plugin validate mods/claudius-modulus
  claude plugin test mods/claudius-modulus
  ```

---

<sub>Claudius Modulus is an independent community mod and is not affiliated with Anthropic.</sub>
