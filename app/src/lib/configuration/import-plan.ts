import { Repository } from '../../models/repository'
import {
  AutomaticIdentityBinding,
  bindingsEqual,
  IIdentity,
  RepositoryIdentityBinding,
} from '../../models/identity'
import { matchExistingRepository } from '../repository-matching'
import { formatRules } from '../identity/identity-rules'
import {
  IConfiguration,
  IConfigurationIdentity,
  IConfigurationRepository,
} from './configuration-file'
import { Settings } from './settings'

/**
 * - `merge`: add and update the repositories in the file, keep the others.
 * - `replace`: additionally remove repositories that aren't in the file.
 */
export type ImportMode = 'merge' | 'replace'

/** A configuration file entry together with where it resolved to on disk. */
export interface IResolvedRepositoryEntry {
  readonly entry: IConfigurationRepository

  /**
   * The working directory of the repository, which can differ from the path
   * in the file when that points inside a repository. Null when the path
   * isn't an existing Git repository.
   */
  readonly path: string | null
}

/** The alias, pin order and identity a repository should end up with. */
export interface IRepositoryLayout {
  readonly path: string
  readonly alias: string | null
  readonly pinOrder: number | null

  /** How the repository chooses its identity, left out to keep it. */
  readonly identity?: RepositoryIdentityBinding
}

export interface IImportPlan {
  readonly mode: ImportMode

  /** Paths of repositories to add. */
  readonly toAdd: ReadonlyArray<string>

  /**
   * All identities in order once imported, null when they don't change. Ones
   * matching an existing identity by label keep its ID.
   */
  readonly identities: ReadonlyArray<IIdentity> | null

  /** Labels of the identities to add, update and remove. */
  readonly identitiesToAdd: ReadonlyArray<string>
  readonly identitiesToUpdate: ReadonlyArray<string>
  readonly identitiesToRemove: ReadonlyArray<string>

  /** Existing repositories whose alias, pinned position or identity changes. */
  readonly toUpdate: ReadonlyArray<Repository>

  /** Existing repositories to remove from the list. */
  readonly toRemove: ReadonlyArray<Repository>

  /** Paths from the file that aren't Git repositories. */
  readonly skipped: ReadonlyArray<string>

  /** What to apply to each repository once they have been added. */
  readonly layout: ReadonlyArray<IRepositoryLayout>

  /** Settings to write, empty when the file has none. */
  readonly settings: Settings
}

/** The position of each pinned repository, starting from 0. */
function getPinnedRanks(repositories: ReadonlyArray<Repository>) {
  const pinned = repositories
    .filter(r => r.pinOrder !== null)
    .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0))
  return new Map(pinned.map((r, rank) => [r.id, rank]))
}

/** A comparable form of the fields an identity has in a configuration file. */
function identityFields(identity: IConfigurationIdentity) {
  return JSON.stringify([
    identity.label,
    identity.authorName,
    identity.authorEmail,
    identity.signing?.format ?? null,
    identity.signing?.key ?? null,
    identity.sshHostAlias ?? null,
    formatRules(identity.rules),
  ])
}

const findByLabel = <T extends { readonly label: string }>(
  items: ReadonlyArray<T>,
  label: string
) => items.find(i => i.label.toLowerCase() === label.toLowerCase())

/**
 * Work out the identities after importing. Identities from the file come
 * first in file order. When merging, the others follow in their current order.
 */
function planIdentities(
  file: ReadonlyArray<IConfigurationIdentity> | undefined,
  current: ReadonlyArray<IIdentity>,
  mode: ImportMode,
  createId: () => string
) {
  if (file === undefined) {
    return { identities: null, toAdd: [], toUpdate: [], toRemove: [] }
  }

  const toAdd = new Array<string>()
  const toUpdate = new Array<string>()
  const imported = file.map(identity => {
    const existing = findByLabel(current, identity.label)
    if (existing === undefined) {
      toAdd.push(identity.label)
    } else if (identityFields(existing) !== identityFields(identity)) {
      toUpdate.push(identity.label)
    }
    return { ...identity, id: existing?.id ?? createId() }
  })

  const others = current.filter(i => findByLabel(file, i.label) === undefined)
  const toRemove = mode === 'replace' ? others.map(i => i.label) : []
  const identities = mode === 'replace' ? imported : [...imported, ...others]

  const reordered = identities.some((i, index) => current[index]?.id !== i.id)
  const changed =
    toAdd.length + toUpdate.length + toRemove.length > 0 || reordered

  return { identities: changed ? identities : null, toAdd, toUpdate, toRemove }
}

/** The binding a repository entry asks for, undefined to keep the current. */
function getEntryBinding(
  configuration: IConfiguration,
  entry: IConfigurationRepository,
  identities: ReadonlyArray<IIdentity>
): RepositoryIdentityBinding | undefined {
  if (entry.identity === undefined) {
    // Files without identities, such as version 1, don't say.
    return configuration.identities === undefined
      ? undefined
      : AutomaticIdentityBinding
  }
  if (entry.identity === null) {
    return { kind: 'none' }
  }

  const identity = findByLabel(identities, entry.identity)
  return identity === undefined
    ? AutomaticIdentityBinding
    : { kind: 'identity', id: identity.id }
}

/**
 * Work out what importing a configuration file changes.
 *
 * Pinned repositories from the file come first in file order. When merging,
 * pinned repositories that aren't in the file follow in their current order.
 *
 * @param createId  Creates the ID of an identity that doesn't exist yet.
 */
export function buildImportPlan(
  configuration: IConfiguration,
  resolved: ReadonlyArray<IResolvedRepositoryEntry>,
  current: ReadonlyArray<Repository>,
  currentIdentities: ReadonlyArray<IIdentity>,
  mode: ImportMode,
  createId: () => string = () => crypto.randomUUID()
): IImportPlan {
  const identityPlan = planIdentities(
    configuration.identities,
    currentIdentities,
    mode,
    createId
  )
  const identities = identityPlan.identities ?? currentIdentities

  const toAdd = new Array<string>()
  const skipped = new Array<string>()
  const layout = new Array<IRepositoryLayout>()
  const listed = new Set<Repository>()
  const listedPaths = new Set<string>()
  let pinOrder = 0

  for (const { entry, path } of resolved) {
    if (path === null) {
      skipped.push(entry.path)
      continue
    }

    // Two entries can resolve to the same repository, the first one wins.
    const key = __WIN32__ ? path.toLowerCase() : path
    if (listedPaths.has(key)) {
      continue
    }
    listedPaths.add(key)

    const existing = matchExistingRepository(current, path)
    if (existing === undefined) {
      toAdd.push(path)
    } else {
      listed.add(existing)
    }

    const identity = getEntryBinding(configuration, entry, identities)
    layout.push({
      path: existing?.path ?? path,
      alias: entry.alias,
      pinOrder: entry.pinned ? pinOrder++ : null,
      ...(identity !== undefined ? { identity } : {}),
    })
  }

  const toRemove = new Array<Repository>()
  const others = current.filter(r => !listed.has(r))

  if (configuration.repositories === undefined) {
    // The file has no repository section, leave the list alone.
  } else if (mode === 'replace') {
    toRemove.push(...others)
  } else {
    const pinnedOthers = others
      .filter(r => r.pinOrder !== null)
      .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0))

    for (const repository of pinnedOthers) {
      layout.push({
        path: repository.path,
        alias: repository.alias,
        pinOrder: pinOrder++,
      })
    }
  }

  const currentRanks = getPinnedRanks(current)
  const toUpdate = current.filter(repository => {
    if (!listed.has(repository)) {
      return false
    }

    const target = matchExistingRepository(layout, repository.path)
    return (
      target !== undefined &&
      (target.alias !== repository.alias ||
        target.pinOrder !== (currentRanks.get(repository.id) ?? null) ||
        (target.identity !== undefined &&
          !bindingsEqual(target.identity, repository.identity)))
    )
  })

  return {
    mode,
    identities: identityPlan.identities,
    identitiesToAdd: identityPlan.toAdd,
    identitiesToUpdate: identityPlan.toUpdate,
    identitiesToRemove: identityPlan.toRemove,
    toAdd,
    toUpdate,
    toRemove,
    skipped,
    layout,
    settings: configuration.settings ?? {},
  }
}
