import { Repository } from '../../models/repository'
import { getRemotes } from '../../lib/git/remote'
import { findDefaultRemote } from '../../lib/stores/helpers/find-default-remote'
import { parseRemote, resolveRemoteHostAliases } from '../../lib/remote-parsing'

/** Where a repository's default remote is hosted. */
export interface IRepositoryRemote {
  /** The real host, with SSH host aliases resolved. */
  readonly host: string
  readonly owner: string
  readonly name: string
}

/** How many repositories have their remotes read at the same time. */
const Concurrency = 8

/**
 * Read the default remote, normally `origin`, of each repository.
 *
 * A repository without a remote, or with one that isn't `owner/name` on a
 * host, maps to null. Repositories whose remotes can't be read, e.g. because
 * they no longer exist, are left out.
 */
export async function loadRepositoryRemotes(
  paths: ReadonlyArray<string>
): Promise<ReadonlyMap<string, IRepositoryRemote | null>> {
  const urls = new Map<string, string | null>()
  let next = 0

  const readNext = async () => {
    while (next < paths.length) {
      const path = paths[next++]
      try {
        const remotes = await getRemotes(new Repository(path, -1, null, false))
        urls.set(path, findDefaultRemote(remotes)?.url ?? null)
      } catch (e) {
        log.warn(`Could not read the remotes of ${path}`, e)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Concurrency, paths.length) }, readNext)
  )

  await resolveRemoteHostAliases(
    [...urls.values()].filter((url): url is string => url !== null)
  )

  const remotes = new Map<string, IRepositoryRemote | null>()
  for (const [path, url] of urls) {
    const parsed = url === null ? null : parseRemote(url)
    remotes.set(
      path,
      parsed === null
        ? null
        : { host: parsed.hostname, owner: parsed.owner, name: parsed.name }
    )
  }
  return remotes
}
