import { BrowserWindow, session } from 'electron'
import * as Path from 'path'
import { cp, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'

/** Reads the `path` of every row in the `repositories` table. */
const ReadRepositoriesScript = `new Promise((resolve, reject) => {
  const request = indexedDB.open('Database')
  request.onupgradeneeded = () => request.transaction.abort()
  request.onerror = () => resolve([])
  request.onsuccess = () => {
    const db = request.result
    if (!db.objectStoreNames.contains('repositories')) {
      db.close()
      resolve([])
      return
    }
    const rows = db.transaction('repositories').objectStore('repositories').getAll()
    rows.onsuccess = () => {
      db.close()
      resolve(rows.result.map(r => r.path))
    }
    rows.onerror = () => reject(rows.error)
  }
})`

/**
 * Read the repository paths stored by another GitHub Desktop installation,
 * such as the official app or a build under a former name.
 *
 * Its IndexedDB is copied to a temporary folder and opened in a hidden window
 * with a session stored there, so the other app's data is never modified and
 * it can keep running.
 *
 * @param dataPath The other app's user data directory.
 */
export async function readDesktopRepositories(
  dataPath: string
): Promise<ReadonlyArray<string>> {
  const copy = await mkdtemp(Path.join(tmpdir(), `${__CLI_NAME__}-import-`))
  let window: BrowserWindow | null = null

  try {
    await cp(Path.join(dataPath, 'IndexedDB'), Path.join(copy, 'IndexedDB'), {
      recursive: true,
      // The lock belongs to the other app's running process.
      filter: path => Path.basename(path) !== 'LOCK',
    })

    // IndexedDB is keyed by origin, the app's pages have a file:// origin.
    const page = Path.join(copy, 'empty.html')
    await writeFile(page, '')

    window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: session.fromPath(copy),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    await window.loadFile(page)

    const paths: unknown = await window.webContents.executeJavaScript(
      ReadRepositoriesScript
    )

    return Array.isArray(paths)
      ? paths.filter((p): p is string => typeof p === 'string')
      : []
  } finally {
    window?.destroy()
    await rm(copy, { recursive: true, force: true }).catch(e =>
      log.warn(`Could not remove ${copy}`, e)
    )
  }
}
