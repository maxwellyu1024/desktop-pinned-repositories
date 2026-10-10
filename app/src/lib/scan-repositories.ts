import * as Path from 'path'
import { readdir } from 'fs/promises'

/** How many directory levels below the chosen folder are searched. */
export const RepositoryScanDepth = 4

const IgnoredDirectories = new Set(['node_modules'])

/**
 * Find Git repositories in the given folder and its subfolders.
 *
 * A directory containing a `.git` directory or file is a repository and isn't
 * searched further, so submodules and nested repositories aren't listed.
 * Hidden directories, `node_modules` and symbolic links are skipped.
 *
 * @returns Repository paths sorted alphabetically.
 */
export async function scanForRepositories(
  folder: string,
  maxDepth: number = RepositoryScanDepth
): Promise<ReadonlyArray<string>> {
  const found = new Array<string>()

  const visit = async (directory: string, depth: number) => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      e => {
        log.warn(
          `Could not read ${directory} while scanning for repositories`,
          e
        )
        return []
      }
    )

    if (
      entries.some(e => e.name === '.git' && (e.isDirectory() || e.isFile()))
    ) {
      found.push(directory)
      return
    }

    if (depth >= maxDepth) {
      return
    }

    const subdirectories = entries.filter(
      e =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        !IgnoredDirectories.has(e.name)
    )

    await Promise.all(
      subdirectories.map(e => visit(Path.join(directory, e.name), depth + 1))
    )
  }

  await visit(folder, 0)

  return found.sort((a, b) => a.localeCompare(b))
}
