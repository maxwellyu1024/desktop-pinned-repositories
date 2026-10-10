import * as FSE from 'fs/promises'
import * as Os from 'os'
import * as Path from 'path'

/** How deep `Include` directives are followed, as a guard against cycles. */
const MaxIncludeDepth = 8

function expandHome(path: string) {
  return path === '~' || path.startsWith('~/')
    ? Path.join(Os.homedir(), path.substring(1))
    : path
}

/** The files an `Include` argument names, `*` and `?` in the file name only. */
async function resolveInclude(pattern: string): Promise<ReadonlyArray<string>> {
  const path = expandHome(pattern)
  const absolute = Path.isAbsolute(path)
    ? path
    : Path.join(Os.homedir(), '.ssh', path)

  const name = Path.basename(absolute)
  if (!/[*?]/.test(name)) {
    return [absolute]
  }

  const regex = new RegExp(
    '^' +
      name
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$'
  )
  const directory = Path.dirname(absolute)
  const entries = await FSE.readdir(directory).catch(() => [])
  return entries
    .filter(e => regex.test(e))
    .sort()
    .map(e => Path.join(directory, e))
}

async function readHosts(
  file: string,
  depth: number,
  hosts: Set<string>
): Promise<void> {
  const contents = await FSE.readFile(file, 'utf8').catch(() => null)
  if (contents === null) {
    return
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(\w+)\s*(?:=\s*|\s+)(.+?)\s*$/.exec(line)
    if (match === null) {
      continue
    }

    const keyword = match[1].toLowerCase()
    const args = match[2].split(/\s+/)

    if (keyword === 'host') {
      for (const host of args) {
        if (!/[*?!]/.test(host)) {
          hosts.add(host)
        }
      }
    } else if (keyword === 'include' && depth < MaxIncludeDepth) {
      for (const pattern of args) {
        for (const included of await resolveInclude(pattern)) {
          await readHosts(included, depth + 1, hosts)
        }
      }
    }
  }
}

/**
 * List the concrete `Host` names in the user's SSH configuration, following
 * `Include` directives. Wildcard patterns are left out. Read only.
 */
export async function readSSHConfigHosts(): Promise<ReadonlyArray<string>> {
  const hosts = new Set<string>()
  await readHosts(Path.join(Os.homedir(), '.ssh', 'config'), 0, hosts)
  return [...hosts]
}
