import { IIdentity } from '../../models/identity'
import {
  formatSSHAliasURL,
  IRemoteLocation,
  parseRemoteLocation,
} from './remote-location'

/** The local config key marking which identity was applied to a repository. */
export const IdentityMarkerKey = 'ghdock.identity'

/** The keys an identity with signing writes. */
const SigningKeys = ['user.signingkey', 'gpg.format', 'commit.gpgsign']

/**
 * A repository's local Git configuration, keys as Git lists them: section and
 * variable names lower case, subsection names as written.
 */
export type LocalGitConfig = ReadonlyMap<string, string>

/** A repository's default remote as configured locally. */
export interface IConfiguredRemote {
  readonly name: string
  readonly url: string
}

/** One local config value an identity changes. */
export interface IIdentityChange {
  readonly key: string
  /** The local value now, null when unset. */
  readonly current: string | null
  /** The value to write, null to unset it. */
  readonly next: string | null
  /**
   * True for changes the identity doesn't require, i.e. switching an HTTPS
   * remote to the identity's SSH host alias. They're only made on request.
   */
  readonly optional: boolean
}

/** What applying an identity to a repository changes. */
export interface IIdentityPlan {
  readonly identity: IIdentity
  readonly changes: ReadonlyArray<IIdentityChange>
  /**
   * Whether the identity was applied to the repository before, so the values
   * it would replace are ones it wrote.
   */
  readonly applied: boolean
  /** Why something the identity asks for can't be applied. */
  readonly warnings: ReadonlyArray<string>
}

/** The remote Git uses by default: `origin`, else the first one by name. */
export function getConfiguredRemote(
  config: LocalGitConfig
): IConfiguredRemote | null {
  const remotes = new Array<IConfiguredRemote>()
  for (const [key, url] of config) {
    const match = /^remote\.(.+)\.url$/.exec(key)
    if (match !== null && url.length > 0) {
      remotes.push({ name: match[1], url })
    }
  }

  return (
    remotes.find(r => r.name === 'origin') ??
    remotes.sort((a, b) => a.name.localeCompare(b.name))[0] ??
    null
  )
}

const isTrue = (value: string | null) =>
  value !== null && /^(true|yes|on|1)$/i.test(value)

/** Whether a change replaces or removes a value that's set now. */
export function isOverwrite(change: IIdentityChange) {
  return change.current !== null
}

/**
 * Whether a change is selected without asking. Switching to SSH never is.
 * Otherwise a change is when it sets a value that isn't set yet, when the
 * value it replaces was written by the same identity, or when the user chose
 * the identity for the repository.
 *
 * @param explicit Whether the user chose the identity for the repository,
 *                 rather than it being matched by rules.
 */
export function isSelectedByDefault(
  change: IIdentityChange,
  plan: IIdentityPlan,
  explicit: boolean
) {
  return !change.optional && (explicit || plan.applied || !isOverwrite(change))
}

/**
 * Work out the local config changes that make a repository use an identity.
 *
 * @param resolveHost The real host SSH connects to for a host or host alias.
 */
export function computeIdentityChanges(
  identity: IIdentity,
  config: LocalGitConfig,
  resolveHost: (host: string) => string
): IIdentityPlan {
  const changes = new Array<IIdentityChange>()
  const warnings = new Array<string>()

  const applied = config.get(IdentityMarkerKey) === identity.id
  const change = (key: string, next: string | null, optional = false) => {
    const current = config.get(key) ?? null
    if (current !== next) {
      changes.push({ key, current, next, optional })
    }
  }

  change('user.name', identity.authorName)
  change('user.email', identity.authorEmail)

  if (identity.signing !== undefined) {
    change('user.signingkey', identity.signing.key)
    change('gpg.format', identity.signing.format)
    if (!isTrue(config.get('commit.gpgsign') ?? null)) {
      change('commit.gpgsign', 'true')
    }
  } else if (applied) {
    // The signing settings were written when the identity still had them.
    for (const key of SigningKeys) {
      change(key, null)
    }
  }

  const remote = getConfiguredRemote(config)
  const alias = identity.sshHostAlias
  const location = remote === null ? null : parseRemoteLocation(remote.url)

  if (remote !== null && location !== null && alias !== undefined) {
    const rewrite = getAliasRewrite(location, alias, resolveHost)
    if (typeof rewrite === 'string') {
      change(`remote.${remote.name}.url`, rewrite, location.protocol !== 'ssh')
    } else if (rewrite !== null) {
      warnings.push(rewrite.warning)
    }
  }

  return { identity, changes, applied, warnings }
}

/**
 * The remote URL that goes through the alias, null when the remote already
 * does, or a warning when the alias connects to a different host.
 */
function getAliasRewrite(
  location: IRemoteLocation,
  alias: string,
  resolveHost: (host: string) => string
): string | null | { readonly warning: string } {
  if (location.protocol === 'ssh' && location.host === alias) {
    return null
  }

  const remoteHost =
    location.protocol === 'ssh' ? resolveHost(location.host) : location.host
  const aliasHost = resolveHost(alias)

  if (aliasHost.toLowerCase() !== remoteHost.toLowerCase()) {
    return {
      warning: `SSH host ${alias} connects to ${aliasHost}, not ${remoteHost}, so the remote is left unchanged.`,
    }
  }

  return formatSSHAliasURL(alias, location.fullPath)
}

/** The changes that make the repository diverge from its identity. */
export function getRequiredChanges(plan: IIdentityPlan) {
  return plan.changes.filter(c => !c.optional)
}
