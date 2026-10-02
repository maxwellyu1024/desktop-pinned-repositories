import { execFile } from 'child_process'

/** How long to wait for `ssh -G` before giving up on a host, in milliseconds */
const ResolveTimeout = 5000

/**
 * Reads the effective hostname for the given SSH host, or null if it can't be
 * determined.
 */
export type SSHHostnameReader = (host: string) => Promise<string | null>

/**
 * Read the effective hostname for an SSH host using `ssh -G`, which evaluates
 * the user's SSH configuration (including `Include`, `Match` and wildcard
 * `Host` blocks) exactly as it would when Git connects, without connecting.
 */
export function readSSHHostname(host: string): Promise<string | null> {
  return new Promise(resolve => {
    execFile(
      'ssh',
      ['-G', '--', host],
      { timeout: ResolveTimeout, windowsHide: true },
      (error, stdout) => {
        if (error) {
          log.debug(`Unable to resolve SSH host '${host}'`, error)
          resolve(null)
          return
        }

        const match = /^hostname (.+)$/m.exec(stdout)
        resolve(match !== null ? match[1].trim() : null)
      }
    )
  })
}

/**
 * Resolves SSH host aliases (e.g. `Host work` → `HostName github.com` in
 * `~/.ssh/config`) to the hostname SSH actually connects to, so remote URLs
 * using an alias can be matched against GitHub endpoints.
 *
 * Resolution is asynchronous and cached; lookups are synchronous and return
 * the host unchanged until it has been resolved.
 */
export class SSHHostAliasResolver {
  private readonly hostnames = new Map<string, string>()
  private readonly pending = new Map<string, Promise<void>>()

  public constructor(
    private readonly readHostname: SSHHostnameReader = readSSHHostname
  ) {}

  /** Resolve and cache the effective hostname of each of the given hosts. */
  public async resolve(hosts: ReadonlyArray<string>): Promise<void> {
    await Promise.all([...new Set(hosts)].map(host => this.resolveHost(host)))
  }

  /**
   * Get the effective hostname for a host, or the host itself if it hasn't
   * been resolved.
   */
  public getHostname(host: string): string {
    return this.hostnames.get(host) ?? host
  }

  private resolveHost(host: string): Promise<void> {
    if (this.hostnames.has(host)) {
      return Promise.resolve()
    }

    const existing = this.pending.get(host)
    if (existing !== undefined) {
      return existing
    }

    const promise = this.readHostnameSafely(host).then(hostname => {
      // 解析失败也缓存原值，避免每次读取远程都重新启动 ssh 进程
      this.hostnames.set(host, hostname ?? host)
      this.pending.delete(host)
    })
    this.pending.set(host, promise)
    return promise
  }

  private async readHostnameSafely(host: string): Promise<string | null> {
    // 以 - 开头的主机名会被 ssh 当作选项解析，直接拒绝
    if (host.length === 0 || host.startsWith('-')) {
      return null
    }

    try {
      const hostname = await this.readHostname(host)
      return hostname !== null && hostname.length > 0 ? hostname : null
    } catch (e) {
      log.debug(`Unable to resolve SSH host '${host}'`, e)
      return null
    }
  }
}

/** The resolver shared by all remote URL parsing in the app */
export const sshHostAliasResolver = new SSHHostAliasResolver()
