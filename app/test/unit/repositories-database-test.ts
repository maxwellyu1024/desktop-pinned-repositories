import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
  IDatabaseOwner,
  IDatabaseRepository,
  getOwnerKey,
} from '../../src/lib/databases'

describe('RepositoriesDatabase', () => {
  it('migrates from version 2 to 4 by deleting duplicate GitHub repositories', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 2)
    await db.delete()
    await db.open()

    const gitHubRepo: IDatabaseGitHubRepository = {
      ownerID: 1,
      name: 'desktop',
      private: false,
      htmlURL: 'http://github.com/desktop/desktop',
      cloneURL: 'http://github.com/desktop/desktop.git',
      parentID: null,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    }
    const originalId = await db.gitHubRepositories.add({ ...gitHubRepo })
    const duplicateId = await db.gitHubRepositories.add({ ...gitHubRepo })
    db.close()

    db = new RepositoriesDatabase(dbName, 4)
    await db.open()

    const original = await db.gitHubRepositories.get(originalId)
    assert(original !== undefined)

    const dupe = await db.gitHubRepositories.get(duplicateId)
    assert(dupe === undefined)

    await db.delete()
  })

  it('migrates from version 8 to 9 by deleting duplicate owners', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 8)
    await db.delete()
    await db.open()

    type OwnersModelBeforeUpgrade = Omit<IDatabaseOwner, 'key'>
    const ownersTableBeforeUpgrade = db.table<OwnersModelBeforeUpgrade, number>(
      'owners'
    )
    const endpoint = 'A'

    const ownerA = await ownersTableBeforeUpgrade.add({
      endpoint,
      login: 'desktop',
    })
    const ownerB = await ownersTableBeforeUpgrade.add({
      endpoint,
      login: 'DeskTop',
    })

    const originalRepoA: IDatabaseGitHubRepository = {
      ownerID: ownerA,
      name: 'desktop',
      private: false,
      htmlURL: 'http://github.com/desktop/desktop',
      cloneURL: 'http://github.com/desktop/desktop.git',
      parentID: null,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    }
    const originalRepoB: IDatabaseGitHubRepository = {
      ownerID: ownerB,
      name: 'dugite',
      private: false,
      htmlURL: 'http://github.com/desktop/dugite',
      cloneURL: 'http://github.com/desktop/dugite.git',
      parentID: null,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    }

    const repoAId = await db.gitHubRepositories.add(originalRepoA)
    const repoBId = await db.gitHubRepositories.add(originalRepoB)

    assert.equal(await db.gitHubRepositories.count(), 2)
    assert.equal(await db.owners.count(), 2)

    db.close()

    db = new RepositoriesDatabase(dbName, 9)
    await db.open()

    assert.equal(await db.gitHubRepositories.count(), 2)
    assert.equal(await db.owners.count(), 1)

    const migratedRepoA = await db.gitHubRepositories.get(repoAId)
    assert.deepStrictEqual(migratedRepoA, originalRepoA)

    const migratedRepoB = await db.gitHubRepositories.get(repoBId)
    assert.notDeepStrictEqual(migratedRepoB, originalRepoB)

    const migratedOwner = await db.owners.toCollection().first()

    assert(migratedOwner !== undefined)
    assert.deepStrictEqual(migratedRepoA?.ownerID, migratedOwner?.id)
    assert.deepStrictEqual(migratedOwner?.endpoint, endpoint)
    assert.deepStrictEqual(migratedOwner?.key, getOwnerKey(endpoint, 'DeskTop'))

    await db.delete()
  })

  it('migrates from version 9 to 10 by numbering pinned repositories', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 9)
    await db.delete()
    await db.open()

    type RepositoryBeforeUpgrade = Omit<IDatabaseRepository, 'pinOrder'> & {
      isPinned?: boolean
    }
    const repositoriesBeforeUpgrade = db.table<RepositoryBeforeUpgrade, number>(
      'repositories'
    )

    const ghRepoId = await db.gitHubRepositories.add({
      ownerID: 1,
      name: 'middle',
      private: false,
      htmlURL: null,
      cloneURL: null,
      parentID: null,
      lastPruneDate: null,
    })

    const addRepository = (
      path: string,
      isPinned: boolean | undefined,
      alias: string | null = null,
      gitHubRepositoryID: number | null = null
    ) =>
      repositoriesBeforeUpgrade.add({
        path,
        alias,
        gitHubRepositoryID,
        missing: false,
        ...(isPinned !== undefined && { isPinned }),
      })

    const zeta = await addRepository('/repos/zeta', true)
    const alpha = await addRepository('/repos/Alpha', true)
    const middle = await addRepository('/repos/gh', true, null, ghRepoId)
    const beta = await addRepository('/repos/aliased', true, 'beta')
    const unpinned = await addRepository('/repos/unpinned', false)
    const legacy = await addRepository('/repos/legacy', undefined)
    db.close()

    db = new RepositoriesDatabase(dbName, 10)
    await db.open()

    const pinOrders = new Map(
      (await db.repositories.toArray()).map(r => [r.id, r.pinOrder])
    )
    assert.deepStrictEqual(
      [alpha, beta, middle, zeta, unpinned, legacy].map(id =>
        pinOrders.get(id)
      ),
      [0, 1, 2, 3, null, null]
    )

    const records = await db.table('repositories').toArray()
    assert(records.every(r => !('isPinned' in r)))

    await db.delete()
  })
})
