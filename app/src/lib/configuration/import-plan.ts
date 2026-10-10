import { Repository } from '../../models/repository'
import { matchExistingRepository } from '../repository-matching'
import { IConfiguration, IConfigurationRepository } from './configuration-file'
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

/** The alias and pin order a repository should end up with. */
export interface IRepositoryLayout {
  readonly path: string
  readonly alias: string | null
  readonly pinOrder: number | null
}

export interface IImportPlan {
  readonly mode: ImportMode

  /** Paths of repositories to add. */
  readonly toAdd: ReadonlyArray<string>

  /** Existing repositories whose alias or pinned position changes. */
  readonly toUpdate: ReadonlyArray<Repository>

  /** Existing repositories to remove from the list. */
  readonly toRemove: ReadonlyArray<Repository>

  /** Paths from the file that aren't Git repositories. */
  readonly skipped: ReadonlyArray<string>

  /** The alias and pin order to apply once repositories have been added. */
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

/**
 * Work out what importing a configuration file changes.
 *
 * Pinned repositories from the file come first in file order. When merging,
 * pinned repositories that aren't in the file follow in their current order.
 */
export function buildImportPlan(
  configuration: IConfiguration,
  resolved: ReadonlyArray<IResolvedRepositoryEntry>,
  current: ReadonlyArray<Repository>,
  mode: ImportMode
): IImportPlan {
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

    layout.push({
      path: existing?.path ?? path,
      alias: entry.alias,
      pinOrder: entry.pinned ? pinOrder++ : null,
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
        target.pinOrder !== (currentRanks.get(repository.id) ?? null))
    )
  })

  return {
    mode,
    toAdd,
    toUpdate,
    toRemove,
    skipped,
    layout,
    settings: configuration.settings ?? {},
  }
}
