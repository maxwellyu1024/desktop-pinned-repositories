import pLimit from 'p-limit'
import { Repository } from '../../models/repository'
import { IIdentity } from '../../models/identity'
import {
  IRepositoryIdentityState,
  loadRepositoryIdentityState,
} from './repository-identity'
import { getRequiredChanges } from './identity-changes'

/** How many repositories have their config read at the same time. */
const Concurrency = 4

/** What a repository's identity state was computed from. */
const getStateKey = (repository: Repository) =>
  [
    repository.path,
    repository.identity.kind,
    repository.identity.kind === 'identity' ? repository.identity.id : '',
  ].join('\n')

/**
 * Load the identity state of each repository that exists on disk. Repositories
 * whose config can't be read are left out.
 */
export async function loadRepositoryIdentityStates(
  repositories: ReadonlyArray<Repository>,
  identities: ReadonlyArray<IIdentity>
): Promise<ReadonlyMap<number, IRepositoryIdentityState>> {
  const limit = pLimit(Concurrency)
  const states = new Map<number, IRepositoryIdentityState>()

  await Promise.all(
    repositories
      .filter(r => !r.missing)
      .map(repository =>
        limit(async () => {
          try {
            states.set(
              repository.id,
              await loadRepositoryIdentityState(
                repository.path,
                repository.identity,
                identities
              )
            )
          } catch (e) {
            log.warn(`Could not read the Git config of ${repository.path}`, e)
          }
        })
      )
  )

  return states
}

/** Whether the repository's config differs from its identity. */
export function hasIdentityMismatch(
  state: IRepositoryIdentityState | undefined
) {
  return state?.plan != null && getRequiredChanges(state.plan).length > 0
}

/**
 * Keeps the identities and, while there are any, which identity each
 * repository uses and whether its config matches.
 */
export class RepositoryIdentityTracker {
  private identities: ReadonlyArray<IIdentity> = []
  private states: ReadonlyMap<number, IRepositoryIdentityState> = new Map()
  private keys = new Map<number, string>()

  public constructor(private readonly onChange: () => void) {}

  public getIdentities() {
    return this.identities
  }

  /** The identity state of each repository, empty without identities. */
  public getStates() {
    return this.states
  }

  /** Use new identities and recheck every repository. */
  public setIdentities(
    identities: ReadonlyArray<IIdentity>,
    repositories: ReadonlyArray<Repository>
  ) {
    this.identities = identities
    this.keys.clear()
    this.onChange()
    return this.update(repositories)
  }

  /**
   * Check repositories that are new or now choose their identity differently,
   * and forget the ones that are gone.
   */
  public update(repositories: ReadonlyArray<Repository>) {
    const stale = repositories.filter(
      r => this.keys.get(r.id) !== getStateKey(r)
    )
    const ids = new Set(repositories.map(r => r.id))
    const removed = [...this.states.keys()].some(id => !ids.has(id))
    return this.check(stale, ids, removed)
  }

  /** Recheck the given repositories, e.g. after their config changed. */
  public refresh(repositories: ReadonlyArray<Repository>) {
    return this.check(repositories, null, false)
  }

  private async check(
    repositories: ReadonlyArray<Repository>,
    keep: ReadonlySet<number> | null,
    removed: boolean
  ) {
    if (this.identities.length === 0) {
      this.keys.clear()
      if (this.states.size > 0) {
        this.states = new Map()
        this.onChange()
      }
      return
    }

    if (repositories.length === 0 && !removed) {
      return
    }

    const identities = this.identities
    const loaded = await loadRepositoryIdentityStates(repositories, identities)

    // Identities changed while loading, a newer check is underway.
    if (identities !== this.identities) {
      return
    }

    const states = new Map(this.states)
    for (const repository of repositories) {
      const state = loaded.get(repository.id)
      this.keys.set(repository.id, getStateKey(repository))
      if (state === undefined) {
        states.delete(repository.id)
      } else {
        states.set(repository.id, state)
      }
    }

    if (keep !== null) {
      for (const id of [...states.keys()]) {
        if (!keep.has(id)) {
          states.delete(id)
          this.keys.delete(id)
        }
      }
    }

    this.states = states
    this.onChange()
  }
}
