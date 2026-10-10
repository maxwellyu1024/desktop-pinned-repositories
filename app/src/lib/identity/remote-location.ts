/** Where a remote URL points: the host as written and the repository path. */
export interface IRemoteLocation {
  readonly protocol: 'ssh' | 'http' | 'git'

  /**
   * The host as written in the URL. For SSH remotes this can be a host alias
   * from the user's SSH configuration rather than the real host.
   */
  readonly host: string

  /**
   * The repository path without a leading slash or `.git` suffix, e.g.
   * `octocat/hello-world` or `group/subgroup/project`.
   */
  readonly fullPath: string
}

const urlPatterns: ReadonlyArray<{
  readonly protocol: IRemoteLocation['protocol']
  readonly regex: RegExp
}> = [
  {
    protocol: 'ssh',
    regex:
      /^(?:ssh|git\+ssh|ssh\+git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/,
  },
  {
    protocol: 'http',
    regex: /^https?:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/,
  },
  { protocol: 'git', regex: /^git:\/\/([^/:]+)(?::\d+)?\/(.+)$/ },
  // scp-like syntax, e.g. git@github.com:octocat/hello-world.git
  { protocol: 'ssh', regex: /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)(.+)$/ },
]

/**
 * Parse a remote URL into its host and repository path. Namespaces can be
 * nested to any depth. Returns null for local paths and unknown formats.
 */
export function parseRemoteLocation(url: string): IRemoteLocation | null {
  for (const { protocol, regex } of urlPatterns) {
    const match = regex.exec(url.trim())
    if (match === null) {
      continue
    }

    const fullPath = match[2]
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')

    return fullPath.length === 0 || match[1].length === 0
      ? null
      : { protocol, host: match[1], fullPath }
  }

  return null
}

/** The SSH URL that reaches `fullPath` through an SSH host alias. */
export function formatSSHAliasURL(alias: string, fullPath: string) {
  return `git@${alias}:${fullPath}.git`
}

/**
 * Whether `namespace` is a whole-segment prefix of the namespace part of
 * `fullPath`, compared case-insensitively.
 */
export function isInNamespace(fullPath: string, namespace: string) {
  const path = fullPath.toLowerCase().split('/')
  const prefix = namespace
    .toLowerCase()
    .split('/')
    .filter(s => s.length > 0)

  // The last segment is the repository name, not part of a namespace.
  return (
    prefix.length < path.length &&
    prefix.every((segment, i) => path[i] === segment)
  )
}
