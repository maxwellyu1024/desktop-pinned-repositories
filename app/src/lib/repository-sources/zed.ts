import * as Path from 'path'
import { existsSync } from 'fs'
import { DatabaseSync, DatabaseSyncOptions } from 'node:sqlite'

/** Zed's release channels with their database folder names. */
const Channels: ReadonlyArray<{ name: string; folder: string }> = [
  { name: 'Zed', folder: '0-stable' },
  { name: 'Zed (Preview)', folder: '0-preview' },
]

/** Where Zed keeps its databases on the current platform. */
export function getZedDatabaseDirectory(
  appDataPath: string,
  homeDirectory: string
) {
  if (__DARWIN__) {
    return Path.join(appDataPath, 'Zed', 'db')
  }

  if (__WIN32__) {
    const localAppData =
      process.env.LOCALAPPDATA ?? Path.join(homeDirectory, 'AppData', 'Local')
    return Path.join(localAppData, 'Zed', 'db')
  }

  const dataHome =
    process.env.XDG_DATA_HOME ?? Path.join(homeDirectory, '.local', 'share')
  return Path.join(dataHome, 'zed', 'db')
}

/**
 * Read the local folders of the workspaces Zed remembers, most recent first.
 * Each workspace stores its folders as newline separated paths.
 */
export function readZedWorkspaces(databasePath: string): ReadonlyArray<string> {
  // The bundled Node.js supports `readOnly`, the installed type definitions
  // predate it.
  const options: DatabaseSyncOptions & { readonly readOnly: boolean } = {
    readOnly: true,
  }
  const database = new DatabaseSync(databasePath, options)

  try {
    const rows = database
      .prepare(
        `SELECT paths FROM workspaces
         WHERE remote_connection_id IS NULL AND paths IS NOT NULL
         ORDER BY timestamp DESC`
      )
      .all() as ReadonlyArray<{ readonly paths?: unknown }>

    return rows.flatMap(row =>
      typeof row.paths === 'string'
        ? row.paths.split('\n').filter(p => p.length > 0)
        : []
    )
  } finally {
    database.close()
  }
}

/** Read the workspace folders of each installed Zed channel. */
export function readZedProjects(
  appDataPath: string,
  homeDirectory: string
): ReadonlyMap<string, ReadonlyArray<string>> {
  const directory = getZedDatabaseDirectory(appDataPath, homeDirectory)
  const projects = new Map<string, ReadonlyArray<string>>()

  for (const { name, folder } of Channels) {
    const databasePath = Path.join(directory, folder, 'db.sqlite')
    if (!existsSync(databasePath)) {
      continue
    }

    try {
      projects.set(name, readZedWorkspaces(databasePath))
    } catch (e) {
      log.warn(`Could not read Zed workspaces from ${databasePath}`, e)
    }
  }

  return projects
}
