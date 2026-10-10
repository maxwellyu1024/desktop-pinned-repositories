import { git } from '../git/core'
import { sshHostAliasResolver } from '../ssh/ssh-host-alias'
import { IIdentity, RepositoryIdentityBinding } from '../../models/identity'
import {
  computeIdentityChanges,
  getConfiguredRemote,
  IdentityMarkerKey,
  IIdentityChange,
  IIdentityPlan,
  LocalGitConfig,
} from './identity-changes'
import { IResolvedRemote, resolveIdentity } from './match-identity'
import { parseRemoteLocation } from './remote-location'

/** A repository's identity and how its local config differs from it. */
export interface IRepositoryIdentityState {
  /** The default remote with SSH host aliases resolved, null without one. */
  readonly remote: IResolvedRemote | null

  /** The identity the repository uses, null when it doesn't use one. */
  readonly plan: IIdentityPlan | null

  /** The local `user.email`, used to suggest identities. */
  readonly localEmail: string | null

  /** The local `user.name`, used to suggest identities. */
  readonly localName: string | null

  /** The SSH host the default remote is written with, alias or real host. */
  readonly sshHost: string | null
}

/** Read the repository's local Git configuration. */
export async function readLocalGitConfig(
  path: string
): Promise<LocalGitConfig> {
  const result = await git(
    ['config', '--local', '--list', '-z'],
    path,
    'readLocalGitConfig'
  )

  const config = new Map<string, string>()
  for (const entry of result.stdout.split('\0')) {
    const separator = entry.indexOf('\n')
    if (separator > 0) {
      config.set(entry.substring(0, separator), entry.substring(separator + 1))
    }
  }
  return config
}

/**
 * Work out which identity a repository uses and what applying it changes.
 * SSH host aliases are resolved with `ssh -G`.
 */
export async function loadRepositoryIdentityState(
  path: string,
  binding: RepositoryIdentityBinding,
  identities: ReadonlyArray<IIdentity>
): Promise<IRepositoryIdentityState> {
  const config = await readLocalGitConfig(path)
  const configured = getConfiguredRemote(config)
  const location =
    configured === null ? null : parseRemoteLocation(configured.url)

  const sshHost = location?.protocol === 'ssh' ? location.host : null
  if (sshHost !== null) {
    await sshHostAliasResolver.resolve([sshHost])
  }

  const remote: IResolvedRemote | null =
    location === null
      ? null
      : {
          host:
            sshHost !== null
              ? sshHostAliasResolver.getHostname(sshHost)
              : location.host,
          fullPath: location.fullPath,
        }

  const identity = resolveIdentity(binding, identities, remote)
  if (identity?.sshHostAlias !== undefined) {
    await sshHostAliasResolver.resolve([identity.sshHostAlias])
  }

  return {
    remote,
    plan:
      identity === null
        ? null
        : computeIdentityChanges(identity, config, host =>
            sshHostAliasResolver.getHostname(host)
          ),
    localEmail: config.get('user.email') ?? null,
    localName: config.get('user.name') ?? null,
    sshHost,
  }
}

/**
 * Write the given changes to the repository's local config and mark it as
 * using the identity. Nothing outside the repository is changed.
 */
export async function applyIdentityChanges(
  path: string,
  identity: IIdentity,
  changes: ReadonlyArray<IIdentityChange>
): Promise<void> {
  for (const { key, next } of changes) {
    const remote = /^remote\.(.+)\.url$/.exec(key)
    if (remote !== null && next !== null) {
      await git(
        ['remote', 'set-url', '--', remote[1], next],
        path,
        'applyIdentityChanges'
      )
    } else if (next === null) {
      await unsetLocalConfigValue(path, key)
    } else {
      await git(
        ['config', '--local', '--replace-all', key, next],
        path,
        'applyIdentityChanges'
      )
    }
  }

  await git(
    ['config', '--local', '--replace-all', IdentityMarkerKey, identity.id],
    path,
    'applyIdentityChanges'
  )
}

/** Stop marking the repository as using an identity, keeping its config. */
export function clearIdentityMarker(path: string) {
  return unsetLocalConfigValue(path, IdentityMarkerKey)
}

async function unsetLocalConfigValue(path: string, key: string) {
  // Git exits with 5 when the key isn't set.
  await git(['config', '--local', '--unset-all', key], path, 'unsetConfig', {
    successExitCodes: new Set([0, 5]),
  })
}
