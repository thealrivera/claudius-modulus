// Local dev servers listening on this machine: the ones a preview pane holds open. Counted
// from lsof, which lists every listening TCP socket with the command that owns it.

// Commands that run a dev server, matched without case: lsof shows Python with a capital P.
// workerd serves `wrangler dev`; the node process beside it is the wrangler CLI, which only
// listens on ports the system hands out.
const DEV_COMMAND = /^(python3?|node|bun|deno|ruby|php|workerd)$/i

// The ports dev servers take (3000, 5173, 8000, 8080 and the like). Tools that listen on a
// port the system hands out (an editor's helper, a debug bridge) sit above this range.
const DEV_PORTS = { min: 1024, max: 9999 }

// lsof's machine-readable output: a `p` line with the pid and a `c` line with the command for
// each process, then an `f` line and an `n` line with the address (`*:3000`, `[::1]:5173`)
// for each listening socket.
export const LSOF_ARGS = ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']

// The dev servers in lsof output: the processes whose command runs a dev server and that
// listen on a dev port, each with the lowest dev port it listens on. A process with several
// listening sockets counts once.
export function devServers(out: string): { pid: string; port: number }[] {
  const ports = new Map<string, number>()
  let pid = ''
  let isDev = false
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) {
      pid = line.slice(1)
      isDev = false
    } else if (line.startsWith('c')) {
      isDev = DEV_COMMAND.test(line.slice(1))
    } else if (line.startsWith('n') && isDev) {
      const port = Number(line.slice(line.lastIndexOf(':') + 1))
      if (port >= DEV_PORTS.min && port <= DEV_PORTS.max) ports.set(pid, Math.min(port, ports.get(pid) ?? port))
    }
  }
  return [...ports].map(([p, port]) => ({ pid: p, port }))
}

// The pids in lsof's cwd listing (`-d cwd -Fpn`) whose working directory is the project root
// or inside it.
export function pidsInProject(cwdOut: string, root: string): Set<string> {
  const base = root.replace(/\/+$/, '')
  const here = new Set<string>()
  let pid = ''
  for (const line of cwdOut.split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1)
    else if (line.startsWith('n')) {
      const dir = line.slice(1)
      if (base && (dir === base || dir.startsWith(base + '/'))) here.add(pid)
    }
  }
  return here
}

// The lsof call that lists the working directory of each given pid.
export const cwdArgs = (pids: string[]): string[] => ['lsof', '-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]

// How many dev servers are listening, and the port the band opens (null when none): the lowest
// port among the servers running in this project when there are any, else the lowest overall.
export function summarizeDevServers(out: string, inProject?: Set<string>): { count: number; port: number | null } {
  const found = devServers(out)
  const mine = inProject ? found.filter(f => inProject.has(f.pid)) : []
  const pool = mine.length ? mine : found
  return { count: found.length, port: pool.length ? Math.min(...pool.map(f => f.port)) : null }
}

export function countDevServers(out: string): number {
  return devServers(out).length
}

// The address the band opens: this project's dev server, else the lowest-port one.
export const devServerUrl = (port: number): string => `http://localhost:${port}`

// How often the count is taken. lsof is quick, but there is no need to ask more often.
export const SERVERS_EVERY_MS = 15_000
