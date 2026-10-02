import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { assertNever } from '../../lib/fatal-error'
import { isDotCom } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'

export type RepositoryListGroup =
  | {
      kind: 'pinned' | 'recent' | 'other'
    }
  | {
      kind: 'dotcom'
      owner: Owner
    }
  | {
      kind: 'enterprise'
      host: string
    }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind } = group
  switch (kind) {
    case 'pinned':
      return `0:pinned`
    case 'recent':
      return `1:recent`
    case 'dotcom':
      return `2:dotcom:${group.owner.login}`
    case 'enterprise':
      return `3:enterprise:${group.host}`
    case 'other':
      return `4:other`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  /** The group of the repository list this item is displayed in */
  readonly group: RepositoryListGroup
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  /** The currently checked out branch, null when detached or unknown */
  readonly currentBranch: string | null
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (repo: Repositoryish): RepositoryListGroup => {
  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isDotCom(repo.gitHubRepository.endpoint)
      ? { kind: 'dotcom', owner: repo.gitHubRepository.owner }
      : { kind: 'enterprise', host: getHostForRepository(repo) }
  }
  return { kind: 'other' }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined
  const groups = new Map<string, RepoGroupItem>()

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const repo of repositories) {
    if (repo instanceof Repository && repo.isPinned) {
      addToGroup({ kind: 'pinned' }, repo)
    }

    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent' }, repo)
    }

    addToGroup(getGroupForRepository(repo), repo)
  }

  return Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey, yKey))
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups
      ),
    }))
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const compareDisplayTitles = (x: Repositoryish, y: Repositoryish) =>
  caseInsensitiveCompare(getDisplayTitle(x), getDisplayTitle(y))

/**
 * Compares repositories by their position in the pinned group, falling back
 * to the display title for repositories with the same position.
 */
const comparePinnedRepositories = (x: Repositoryish, y: Repositoryish) => {
  const xOrder = x instanceof Repository ? x.pinOrder : null
  const yOrder = y instanceof Repository ? y.pinOrder : null
  return (
    (xOrder ?? Infinity) - (yOrder ?? Infinity) || compareDisplayTitles(x, y)
  )
}

/** Returns the pinned repositories in the order of the pinned group. */
export function getPinnedRepositories(
  repositories: ReadonlyArray<Repositoryish>
): ReadonlyArray<Repository> {
  return repositories
    .filter((r): r is Repository => r instanceof Repository && r.isPinned)
    .sort(comparePinnedRepositories)
}

/**
 * Moves a repository to the given insertion point of the pinned group.
 *
 * @param pinnedRepositories  The pinned repositories in their current order.
 * @param repository          The pinned repository to move.
 * @param insertionIndex      The position to insert the repository at, from 0
 *                            (before the first repository) to the number of
 *                            pinned repositories (after the last one).
 * @returns The new order, or null if the repository wouldn't move.
 */
export function movePinnedRepository(
  pinnedRepositories: ReadonlyArray<Repository>,
  repository: Repository,
  insertionIndex: number
): ReadonlyArray<Repository> | null {
  const index = pinnedRepositories.findIndex(r => r.id === repository.id)
  if (index === -1) {
    return null
  }

  // 插入点位于自身之后时，移除自身后插入点前移一位
  const targetIndex = Math.min(
    Math.max(insertionIndex > index ? insertionIndex - 1 : insertionIndex, 0),
    pinnedRepositories.length - 1
  )
  if (targetIndex === index) {
    return null
  }

  const order = pinnedRepositories.filter(r => r.id !== repository.id)
  order.splice(targetIndex, 0, pinnedRepositories[index])
  return order
}

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>
): IRepositoryListItem[] => {
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent and pinned groups are by definition present in
    // another group and therefore we don't want to count them.
    if (
      groupItem.group.kind === 'recent' ||
      groupItem.group.kind === 'pinned'
    ) {
      continue
    }

    for (const title of groupItem.repos.map(getDisplayTitle)) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  return repositories
    .map(r => {
      const repoState = localRepositoryStateLookup.get(r.id)
      const title = getDisplayTitle(r)

      return {
        text: r instanceof Repository ? [title, nameOf(r)] : [title],
        id: r.id.toString(),
        repository: r,
        group,
        needsDisambiguation:
          // If the repository is in the enterprise group and has a duplicate
          // name in the group, we need to disambiguate it. We don't have to
          // disambiguate repositories in the 'dotcom' group because they are
          // already grouped by owner. If the repository is in the 'recent' or
          // 'pinned' group and has a duplicate name in any group, we need to
          // disambiguate it.
          ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
          ((allNames.get(title) ?? 0) > 1 &&
            (group.kind === 'recent' || group.kind === 'pinned')),
        aheadBehind: repoState?.aheadBehind ?? null,
        changedFilesCount: repoState?.changedFilesCount ?? 0,
        currentBranch: repoState?.currentBranch ?? null,
      }
    })
    .sort(({ repository: x }, { repository: y }) =>
      group.kind === 'pinned'
        ? comparePinnedRepositories(x, y)
        : compareDisplayTitles(x, y)
    )
}
