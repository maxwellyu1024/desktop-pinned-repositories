/* eslint-disable no-sync */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as Fs from 'fs'
import * as Path from 'path'
import { pathToFileURL } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { createTempDirectory } from '../../helpers/temp'
import {
  findRepositoryRoot,
  resolveRepositoryRoots,
} from '../../../src/lib/repository-sources/find-repository-root'
import {
  parseVSCodeWorkspace,
  readVSCodeFolders,
} from '../../../src/lib/repository-sources/vscode'
import {
  getJetBrainsProductName,
  parseJetBrainsRecentProjects,
  readJetBrainsProjects,
} from '../../../src/lib/repository-sources/jetbrains'
import { readZedWorkspaces } from '../../../src/lib/repository-sources/zed'
import { parseSublimeSession } from '../../../src/lib/repository-sources/sublime-text'
import { findRepositorySources } from '../../../src/lib/repository-sources'

const writeFile = (path: string, contents: string) => {
  Fs.mkdirSync(Path.dirname(path), { recursive: true })
  Fs.writeFileSync(path, contents)
}

const makeRepository = (path: string) =>
  Fs.mkdirSync(Path.join(path, '.git'), { recursive: true })

describe('repository sources', () => {
  describe('findRepositoryRoot', () => {
    it('resolves folders inside a repository to the repository', async t => {
      const home = await createTempDirectory(t)
      const repository = Path.join(home, 'dev', 'repo')
      makeRepository(repository)
      Fs.mkdirSync(Path.join(repository, 'src', 'lib'), { recursive: true })

      assert.equal(await findRepositoryRoot(repository, home), repository)
      assert.equal(
        await findRepositoryRoot(Path.join(repository, 'src', 'lib'), home),
        repository
      )
    })

    it('does not climb to a repository in the home directory', async t => {
      const home = await createTempDirectory(t)
      makeRepository(home)
      Fs.mkdirSync(Path.join(home, 'notes'))

      assert.equal(
        await findRepositoryRoot(Path.join(home, 'notes'), home),
        null
      )
      assert.equal(await findRepositoryRoot(home, home), home)
    })

    it('returns null for missing paths and files', async t => {
      const home = await createTempDirectory(t)
      writeFile(Path.join(home, 'file.txt'), '')

      assert.equal(
        await findRepositoryRoot(Path.join(home, 'nope'), home),
        null
      )
      assert.equal(
        await findRepositoryRoot(Path.join(home, 'file.txt'), home),
        null
      )
    })

    it('drops duplicates and paths outside repositories', async t => {
      const home = await createTempDirectory(t)
      const a = Path.join(home, 'a')
      const b = Path.join(home, 'b')
      makeRepository(a)
      makeRepository(b)
      Fs.mkdirSync(Path.join(a, 'sub'))
      Fs.mkdirSync(Path.join(home, 'plain'))

      assert.deepEqual(
        await resolveRepositoryRoots(
          [b, Path.join(a, 'sub'), Path.join(home, 'plain'), a, b],
          home
        ),
        [b, a]
      )
    })
  })

  describe('VS Code', () => {
    it('reads local folders from workspace storage', async t => {
      const data = await createTempDirectory(t)
      const storage = Path.join(data, 'User', 'workspaceStorage')
      const folder = Path.join(data, 'project')
      writeFile(
        Path.join(storage, '1', 'workspace.json'),
        JSON.stringify({ folder: pathToFileURL(folder).toString() })
      )
      writeFile(
        Path.join(storage, '2', 'workspace.json'),
        JSON.stringify({ folder: 'vscode-remote://ssh-remote+host/srv/app' })
      )
      writeFile(
        Path.join(storage, '3', 'workspace.json'),
        JSON.stringify({ workspace: 'file:///tmp/a.code-workspace' })
      )
      writeFile(Path.join(storage, '4', 'workspace.json'), '{')

      assert.deepEqual(await readVSCodeFolders(data), [folder])
    })

    it('decodes file URLs', () => {
      assert.equal(
        parseVSCodeWorkspace(
          JSON.stringify({
            folder: pathToFileURL('/tmp/with space').toString(),
          })
        ),
        Path.resolve('/tmp/with space')
      )
    })

    it('returns nothing without workspace storage', async t => {
      const data = await createTempDirectory(t)
      assert.deepEqual(await readVSCodeFolders(data), [])
    })
  })

  describe('JetBrains', () => {
    const xml = `<application>
  <component name="RecentProjectsManager">
    <option name="additionalInfo">
      <map>
        <entry key="$USER_HOME$/dev/a &amp; b">
          <value><RecentProjectMetaInfo /></value>
        </entry>
        <entry key="$APPLICATION_CONFIG_DIR$/light-edit">
          <value><RecentProjectMetaInfo hidden="true" /></value>
        </entry>
        <entry key="/opt/c">
          <value><RecentProjectMetaInfo /></value>
        </entry>
      </map>
    </option>
  </component>
</application>`

    it('reads project paths and expands the home directory', () => {
      assert.deepEqual(parseJetBrainsRecentProjects(xml, '/Users/me'), [
        Path.normalize('/Users/me/dev/a & b'),
        Path.normalize('/opt/c'),
      ])
    })

    it('reads the older recent paths list', () => {
      const old = `<application><component name="RecentProjectsManager">
  <option name="recentPaths">
    <list>
      <option value="$USER_HOME$/old" />
    </list>
  </option>
</component></application>`

      assert.deepEqual(parseJetBrainsRecentProjects(old, '/Users/me'), [
        Path.normalize('/Users/me/old'),
      ])
    })

    it('names products from configuration folders', () => {
      assert.equal(
        getJetBrainsProductName('IntelliJIdea2026.2'),
        'IntelliJ IDEA'
      )
      assert.equal(
        getJetBrainsProductName('PyCharmCE2024.1'),
        'PyCharm Community Edition'
      )
      assert.equal(
        getJetBrainsProductName('AndroidStudio2024.3'),
        'Android Studio'
      )
      assert.equal(getJetBrainsProductName('consentOptions'), null)
    })

    it('merges versions of a product, newest first', async t => {
      const appData = await createTempDirectory(t)
      const recent = (path: string) =>
        `<application><component><option name="additionalInfo"><map><entry key="${path}" /></map></option></component></application>`
      writeFile(
        Path.join(
          appData,
          'JetBrains',
          'GoLand2025.1',
          'options',
          'recentProjects.xml'
        ),
        recent('/old')
      )
      writeFile(
        Path.join(
          appData,
          'JetBrains',
          'GoLand2025.2',
          'options',
          'recentProjects.xml'
        ),
        recent('/new')
      )
      Fs.mkdirSync(Path.join(appData, 'JetBrains', 'consentOptions'))

      const projects = await readJetBrainsProjects(appData, '/home')
      assert.deepEqual([...projects], [['GoLand', ['/new', '/old']]])
    })
  })

  describe('Zed', () => {
    it('reads local workspace folders, most recent first', async t => {
      const directory = await createTempDirectory(t)
      const path = Path.join(directory, 'db.sqlite')
      const database = new DatabaseSync(path)
      database.exec(`CREATE TABLE workspaces (
        workspace_id INTEGER PRIMARY KEY,
        paths TEXT,
        remote_connection_id INTEGER,
        timestamp TEXT
      )`)
      database.exec(`INSERT INTO workspaces VALUES
        (1, '/old', NULL, '2026-01-01 00:00:00'),
        (2, '/new/a' || char(10) || '/new/b', NULL, '2026-02-01 00:00:00'),
        (3, '/remote', 7, '2026-03-01 00:00:00'),
        (4, NULL, NULL, '2026-04-01 00:00:00')`)
      database.close()

      assert.deepEqual(readZedWorkspaces(path), ['/new/a', '/new/b', '/old'])
    })
  })

  describe('Sublime Text', () => {
    it('reads open folders followed by the folder history', () => {
      const session = JSON.stringify({
        windows: [{ folders: [{ path: '/open' }, { name: 'no path' }] }, {}],
        folder_history: ['/history', 3],
      })

      assert.deepEqual(parseSublimeSession(session), ['/open', '/history'])
      assert.deepEqual(parseSublimeSession('not json'), [])
    })
  })

  describe('findRepositorySources', () => {
    it('collects repositories per app and skips its own data', async t => {
      const appData = await createTempDirectory(t)
      const home = await createTempDirectory(t)
      const repository = Path.join(home, 'repo')
      makeRepository(repository)
      Fs.mkdirSync(Path.join(home, 'plain'))

      Fs.mkdirSync(Path.join(appData, 'GitHub Desktop', 'IndexedDB'), {
        recursive: true,
      })
      Fs.mkdirSync(Path.join(appData, 'GHDock', 'IndexedDB'), {
        recursive: true,
      })
      writeFile(
        Path.join(
          appData,
          'Code',
          'User',
          'workspaceStorage',
          '1',
          'workspace.json'
        ),
        JSON.stringify({
          folder: pathToFileURL(Path.join(home, 'plain')).toString(),
        })
      )
      writeFile(
        Path.join(
          appData,
          'Cursor',
          'User',
          'workspaceStorage',
          '1',
          'workspace.json'
        ),
        JSON.stringify({ folder: pathToFileURL(repository).toString() })
      )

      const read = new Array<string>()
      const sources = await findRepositorySources({
        appDataPath: appData,
        userDataPath: Path.join(appData, 'GHDock'),
        homeDirectory: home,
        readDesktopRepositories: async dataPath => {
          read.push(dataPath)
          return [repository, Path.join(home, 'missing')]
        },
      })

      assert.deepEqual(read, [Path.join(appData, 'GitHub Desktop')])
      assert.deepEqual(sources, [
        { name: 'GitHub Desktop', paths: [repository] },
        { name: 'Cursor', paths: [repository] },
      ])
    })
  })
})
