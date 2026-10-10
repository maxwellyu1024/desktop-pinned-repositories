import { IRemote } from '../models/remote'
import { Repository, getGitHubHtmlUrl } from '../models/repository'
import { parseRemote } from './remote-parsing'

const dotComHostname = 'github.com'

/**
 * Get the github.com page of the repository a remote URL points to, or null
 * if the remote isn't hosted on github.com.
 *
 * This only parses the URL (resolving SSH host aliases), so it works without
 * a signed in account.
 */
export function getRemoteWebURL(url: string): string | null {
  const parsed = parseRemote(url)

  if (parsed === null || parsed.hostname.toLowerCase() !== dotComHostname) {
    return null
  }

  return `https://${dotComHostname}/${parsed.owner}/${parsed.name}`
}

/**
 * Get the GitHub page of a repository: the associated GitHub repository when
 * there is one, otherwise the github.com page its remote points to.
 */
export function getRepositoryWebURL(
  repository: Repository,
  remote: IRemote | null
): string | null {
  return (
    getGitHubHtmlUrl(repository) ??
    (remote !== null ? getRemoteWebURL(remote.url) : null)
  )
}
