# 固定仓库（Pinned Repositories）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库下拉列表中增加"固定"（Pinned）分组（排在 Recent 之前），列表项右侧提供悬停显示的图钉按钮用于固定/取消固定仓库，状态持久化到 IndexedDB 的 Repository 记录。

**Architecture:** 参照现有 `alias` 字段的模式：`IDatabaseRepository.isPinned` → `Repository.isPinned`（含 hash）→ `RepositoriesStore.updateRepositoryPinned` → dispatcher/app-store 转发 → `groupRepositories` 增加 `pinned` 分组（复用 recent 组的"重复显示"机制）→ 列表项渲染图钉按钮。

**Tech Stack:** TypeScript + React 类组件、Dexie（IndexedDB）、node:test 单元测试、SCSS。

**设计文档:** `docs/plans/2026-07-08-pinned-repositories-design.md`

## Global Constraints

- 分组标题文案：`Pinned`；右键菜单文案：`Pin Repository` / `Unpin Repository`（macOS 标题式大小写，其他平台 `Pin repository` / `Unpin repository`，用 `__DARWIN__` 区分，参照现有菜单项写法）
- "固定"分组不受"仓库总数 > 7"阈值限制（该阈值仅作用于 Recent 组）
- 固定的仓库同时出现在"固定"分组和原分组（重复显示，与 Recent 组一致）
- `CloningRepository` 不可固定（不渲染图钉按钮）
- 不需要 Dexie schema 版本迁移（`isPinned` 非索引字段）
- 所有代码必须通过 prettier 检查（`yarn lint` 包含 prettier --check）
- 单测命令：`yarn test app/test/unit/repositories-list-grouping-test.ts`；类型检查：`npx tsc -P app --noEmit`

---

### Task 1: 数据层 —— `isPinned` 字段贯通

**Files:**
- Modify: `app/src/lib/databases/repositories-database.ts:49-57`（IDatabaseRepository）
- Modify: `app/src/models/repository.ts:39-70`（构造函数 + hash）
- Modify: `app/src/lib/stores/repositories-store.ts`（6 处 `new Repository(...)` + 新增 update 方法）

**Interfaces:**
- Produces: `Repository.isPinned: boolean`（构造函数第 9 个参数，默认 `false`，参与 hash）；`RepositoriesStore.updateRepositoryPinned(repository: Repository, isPinned: boolean): Promise<void>`

- [x] **Step 1: `IDatabaseRepository` 增加字段**

在 `app/src/lib/databases/repositories-database.ts` 的 `IDatabaseRepository` 接口中（`alias` 字段之后）增加：

```ts
  /** Whether the user has pinned this repository in the repository list */
  readonly isPinned?: boolean
```

- [x] **Step 2: `Repository` 构造函数增加参数并纳入 hash**

`app/src/models/repository.ts`，构造函数末尾（`gitDir` 参数之后）增加参数：

```ts
    /**
     * Whether the user has pinned this repository in the repository list.
     */
    public readonly isPinned: boolean = false
```

`createEqualityHash` 调用增加最后一项 `this.isPinned`：

```ts
    this.hash = createEqualityHash(
      path,
      this.id,
      gitHubRepository?.hash,
      this.missing,
      this.alias,
      this.workflowPreferences.forkContributionTarget,
      this.isTutorialRepository,
      this.isPinned
    )
```

- [x] **Step 3: `repositories-store.ts` 的 6 处 `new Repository(...)` 补传 `isPinned`**

行号（修改前）：146、288、309、366、413、562。

`toRepository()`（146 行）在 `repo.gitDir` 之后追加 `repo.isPinned`：

```ts
    return new Repository(
      repo.path,
      repo.id,
      repo.gitHubRepositoryID !== null
        ? await this.findGitHubRepositoryByID(repo.gitHubRepositoryID)
        : await Promise.resolve(null), // Dexie gets confused if we return null
      repo.missing,
      repo.alias,
      repo.workflowPreferences,
      repo.isTutorialRepository,
      repo.gitDir,
      repo.isPinned
    )
```

其余 5 处均为从现有 `repository`/`repo` 对象重建，统一在最后一个参数（`gitDir` 或其局部变量）之后追加 `repository.isPinned`（562 行处为 `repo.isPinned`）。例如 288 行处：

```ts
    return new Repository(
      repository.path,
      repository.id,
      repository.gitHubRepository,
      missing,
      repository.alias,
      repository.workflowPreferences,
      repository.isTutorialRepository,
      repository.gitDir,
      repository.isPinned
    )
```

309、366、413、562 行处同样在末尾追加（各处前面的参数保持原样，413 行处是 `repository:` 属性内的构造调用，562 行处变量名是 `repo`）。

注意：`app/src/lib/desktop-fake-repository.ts` 和 `app/src/ui/lib/test-ui-components/test-ui-components.ts` 中的 `new Repository(...)` 使用默认值即可，不需要修改。

- [x] **Step 4: 新增 `updateRepositoryPinned` 方法**

`app/src/lib/stores/repositories-store.ts`，紧跟 `updateRepositoryAlias`（327-334 行）之后：

```ts
  /**
   * Update the pinned state for the specified repository.
   *
   * @param repository  The repository to update.
   * @param isPinned    Whether the repository should be pinned.
   */
  public async updateRepositoryPinned(
    repository: Repository,
    isPinned: boolean
  ): Promise<void> {
    await this.db.repositories.update(repository.id, { isPinned })

    this.emitUpdatedRepositories()
  }
```

- [x] **Step 5: 类型检查与现有测试**

```powershell
npx tsc -P app --noEmit
yarn test app/test/unit/repositories-list-grouping-test.ts
```

预期：tsc 无错误；现有 3 个分组测试全部 PASS。

- [x] **Step 6: Commit**

```powershell
git add app/src/lib/databases/repositories-database.ts app/src/models/repository.ts app/src/lib/stores/repositories-store.ts
git commit -m "feat: Repository 模型与数据库增加 isPinned 字段"
```

---

### Task 2: 分组逻辑 —— pinned 分组（TDD）

**Files:**
- Modify: `app/src/ui/repositories-list/group-repositories.ts`
- Test: `app/test/unit/repositories-list-grouping-test.ts`

**Interfaces:**
- Consumes: `Repository.isPinned`（Task 1）；`new Repository(path, id, ghRepo, missing, alias, workflowPreferences, isTutorialRepository, gitDir, isPinned)`
- Produces: `RepositoryListGroup` 联合类型新增 `kind: 'pinned'`；`getGroupKey({kind:'pinned'})` 返回 `'0:pinned'`；`groupRepositories` 签名不变（isPinned 从 Repository 对象读取，无需新参数）

- [x] **Step 1: 编写失败的测试**

在 `app/test/unit/repositories-list-grouping-test.ts` 的 `describe` 块末尾追加：

```ts
  it('includes isPinned in the repository hash', () => {
    const unpinned = new Repository('repo', 1, null, false)
    const pinned = new Repository(
      'repo',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      true
    )
    assert.notEqual(pinned.hash, unpinned.hash)
  })

  it('places pinned repositories in a pinned group before all others', () => {
    // 总数 <= 7，Recent 组不显示，但 Pinned 组应始终显示
    const pinnedRepo = new Repository(
      'pinned-repo',
      4,
      null,
      false,
      null,
      {},
      false,
      undefined,
      true
    )
    const grouped = groupRepositories(
      [...repositories, pinnedRepo],
      cache,
      []
    )

    assert.equal(grouped.length, 4)
    assert.equal(grouped[0].identifier.kind, 'pinned')
    assert.equal(grouped[0].items.length, 1)
    assert.equal(grouped[0].items[0].repository.path, 'pinned-repo')
  })

  it('shows pinned repositories in both the pinned group and their original group', () => {
    const pinnedDotComRepo = new Repository(
      'pinned-dotcom',
      4,
      gitHubRepoFixture({ owner: 'me', name: 'pinned-dotcom' }),
      false,
      null,
      {},
      false,
      undefined,
      true
    )
    const grouped = groupRepositories(
      [...repositories, pinnedDotComRepo],
      cache,
      []
    )

    const pinnedGroup = grouped.find(g => g.identifier.kind === 'pinned')
    const dotComGroup = grouped.find(g => g.identifier.kind === 'dotcom')

    assert(pinnedGroup !== undefined)
    assert(dotComGroup !== undefined)
    assert(
      pinnedGroup.items.some(i => i.repository.path === 'pinned-dotcom')
    )
    assert(
      dotComGroup.items.some(i => i.repository.path === 'pinned-dotcom')
    )
  })

  it('orders the pinned group before the recent group', () => {
    // 9 个仓库超过阈值 7，Recent 组显示
    const many = [
      new Repository('r1', 1, null, false),
      new Repository('r2', 2, null, false),
      new Repository('r3', 3, null, false),
      new Repository('r4', 4, null, false),
      new Repository('r5', 5, null, false),
      new Repository('r6', 6, null, false),
      new Repository('r7', 7, null, false),
      new Repository('r8', 8, null, false),
      new Repository('r9', 9, null, false, null, {}, false, undefined, true),
    ]
    const grouped = groupRepositories(many, cache, [1])

    assert.equal(grouped[0].identifier.kind, 'pinned')
    assert.equal(grouped[1].identifier.kind, 'recent')
    assert.equal(grouped[0].items[0].repository.path, 'r9')
    assert.equal(grouped[1].items[0].repository.path, 'r1')
  })

  it('disambiguates pinned repositories with duplicate names', () => {
    const repoA = new Repository(
      'dup',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'dup' }),
      false,
      null,
      {},
      false,
      undefined,
      true
    )
    const repoB = new Repository(
      'dup',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'dup' }),
      false
    )
    const grouped = groupRepositories([repoA, repoB], cache, [])

    const pinnedGroup = grouped.find(g => g.identifier.kind === 'pinned')
    assert(pinnedGroup !== undefined)
    assert.equal(pinnedGroup.items.length, 1)
    assert(pinnedGroup.items[0].needsDisambiguation)
  })
```

- [x] **Step 2: 运行测试确认失败**

```powershell
yarn test app/test/unit/repositories-list-grouping-test.ts
```

预期：新增 5 个测试中，`includes isPinned in the repository hash` PASS（Task 1 已实现），其余 4 个 FAIL（尚无 `pinned` 分组）。

- [x] **Step 3: 实现分组逻辑**

`app/src/ui/repositories-list/group-repositories.ts` 四处修改：

(1) 联合类型增加 `'pinned'`（17-28 行）：

```ts
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
```

(2) `getGroupKey`（35-49 行）：

```ts
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
```

(3) `groupRepositories` 主循环（97-103 行）：

```ts
  for (const repo of repositories) {
    if (repo instanceof Repository && repo.isPinned) {
      addToGroup({ kind: 'pinned' }, repo)
    }

    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent' }, repo)
    }

    addToGroup(getGroupForRepository(repo), repo)
  }
```

(4) `toSortedListItems` 消歧逻辑：132-137 行的跳过条件和 156-164 行的 `needsDisambiguation` 均把 `pinned` 与 `recent` 同等对待：

```ts
    // All items in the recent and pinned groups are by definition present in
    // another group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent' || groupItem.group.kind === 'pinned') {
      continue
    }
```

```ts
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
```

- [x] **Step 4: 运行测试确认通过**

```powershell
yarn test app/test/unit/repositories-list-grouping-test.ts
```

预期：全部 8 个测试 PASS（3 个原有 + 5 个新增）。

- [x] **Step 5: Commit**

```powershell
git add app/src/ui/repositories-list/group-repositories.ts app/test/unit/repositories-list-grouping-test.ts
git commit -m "feat: 仓库列表增加 pinned 分组逻辑"
```

---

### Task 3: 状态流转 —— dispatcher 与 app-store

**Files:**
- Modify: `app/src/lib/stores/app-store.ts:4883-4889`（`_changeRepositoryAlias` 之后）
- Modify: `app/src/ui/dispatcher/dispatcher.ts:867-873`（`changeRepositoryAlias` 之后）

**Interfaces:**
- Consumes: `RepositoriesStore.updateRepositoryPinned`（Task 1）
- Produces: `Dispatcher.changeRepositoryPinned(repository: Repository, isPinned: boolean): Promise<void>`

- [x] **Step 1: app-store 增加方法**

`app/src/lib/stores/app-store.ts`，紧跟 `_changeRepositoryAlias` 之后：

```ts
  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeRepositoryPinned(
    repository: Repository,
    isPinned: boolean
  ): Promise<void> {
    return this.repositoriesStore.updateRepositoryPinned(repository, isPinned)
  }
```

- [x] **Step 2: dispatcher 增加方法**

`app/src/ui/dispatcher/dispatcher.ts`，紧跟 `changeRepositoryAlias` 之后：

```ts
  /** Pins or unpins the repository in the repository list. */
  public changeRepositoryPinned(
    repository: Repository,
    isPinned: boolean
  ): Promise<void> {
    return this.appStore._changeRepositoryPinned(repository, isPinned)
  }
```

- [x] **Step 3: 类型检查**

```powershell
npx tsc -P app --noEmit
```

预期：无错误。

- [x] **Step 4: Commit**

```powershell
git add app/src/lib/stores/app-store.ts app/src/ui/dispatcher/dispatcher.ts
git commit -m "feat: dispatcher/app-store 增加 changeRepositoryPinned"
```

---

### Task 4: UI —— 图钉按钮、Pinned 分组标题、样式

**Files:**
- Modify: `app/src/ui/repositories-list/repository-list-item.tsx`
- Modify: `app/src/ui/repositories-list/repositories-list.tsx`
- Modify: `app/styles/ui/_repository-list.scss`

**Interfaces:**
- Consumes: `Dispatcher.changeRepositoryPinned`（Task 3）、`octicons.pin`（已存在于 `octicons.generated.ts`）
- Produces: `IRepositoryListItemProps.onTogglePin?: (repository: Repository) => void`

- [x] **Step 1: 列表项增加图钉按钮**

`app/src/ui/repositories-list/repository-list-item.tsx`：

(1) props 接口增加回调：

```ts
  /** Called when the user clicks the pin button. Not rendered when absent. */
  readonly onTogglePin?: (repository: Repository) => void
```

(2) `render()` 中，在 `renderRepoIndicators` 调用之后（`repo-indicators` div 之后、根 div 结束前）增加按钮，仅对 `Repository` 实例渲染：

```tsx
        {repository instanceof Repository &&
          this.props.onTogglePin !== undefined &&
          this.renderPinButton(repository)}
```

(3) 类中增加渲染方法与点击处理：

```tsx
  private renderPinButton(repository: Repository) {
    const label = repository.isPinned ? 'Unpin repository' : 'Pin repository'
    return (
      <button
        className={classNames('pin-button', {
          pinned: repository.isPinned,
        })}
        onClick={this.onPinButtonClick}
        aria-label={label}
        aria-pressed={repository.isPinned}
        title={label}
      >
        <Octicon symbol={octicons.pin} />
      </button>
    )
  }

  private onPinButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // 阻止点击冒泡到列表行，避免固定操作同时切换选中仓库
    event.stopPropagation()
    const { repository, onTogglePin } = this.props
    if (repository instanceof Repository && onTogglePin !== undefined) {
      onTogglePin(repository)
    }
  }
```

(4) 修改 `shouldComponentUpdate`（105-117 行）——现在只比较 id 与 matches，固定状态变化不会触发重绘，改为比较 hash：

```ts
  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (
      nextProps.repository instanceof Repository &&
      this.props.repository instanceof Repository
    ) {
      return (
        nextProps.repository.hash !== this.props.repository.hash ||
        nextProps.matches !== this.props.matches
      )
    } else {
      return true
    }
  }
```

- [x] **Step 2: 列表组件接线**

`app/src/ui/repositories-list/repositories-list.tsx`：

(1) `getGroupLabel`（243-256 行）增加分支（放在 `recent` 分支旁）：

```ts
    } else if (kind === 'pinned') {
      return 'Pinned'
```

(2) `renderItem`（156-168 行）传入回调：

```tsx
  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={repository.id}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        matches={matches}
        aheadBehind={item.aheadBehind}
        changedFilesCount={item.changedFilesCount}
        onTogglePin={this.onTogglePin}
      />
    )
  }
```

(3) 类中增加处理方法（放在 `onChangeRepositoryAlias` 附近）：

```ts
  private onTogglePin = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryPinned(
      repository,
      !repository.isPinned
    )
  }
```

- [x] **Step 3: 样式**

`app/styles/ui/_repository-list.scss`，`.repository-list-item` 规则块内（`.alias` 之后）增加：

```scss
    .pin-button {
      // 复位浏览器默认按钮样式
      border: none;
      background: transparent;
      padding: 0;

      margin-left: var(--spacing-half);
      flex-shrink: 0;
      align-items: center;
      color: var(--text-secondary-color);
      cursor: pointer;

      // 默认隐藏，行悬停/键盘聚焦时显示；已固定项常驻显示
      display: none;

      &:hover {
        color: var(--text-color);
      }

      &.pinned {
        display: flex;
        color: var(--tab-bar-active-color);
      }
    }

    &:hover .pin-button,
    &:focus-within .pin-button {
      display: flex;
    }
```

- [x] **Step 4: 类型检查与 lint**

```powershell
npx tsc -P app --noEmit
yarn prettier
```

预期：均无错误。

- [x] **Step 5: Commit**

```powershell
git add app/src/ui/repositories-list/repository-list-item.tsx app/src/ui/repositories-list/repositories-list.tsx app/styles/ui/_repository-list.scss
git commit -m "feat: 仓库列表项增加图钉按钮与 Pinned 分组标题"
```

---

### Task 5: 右键菜单 —— Pin / Unpin 菜单项

**Files:**
- Modify: `app/src/ui/repositories-list/repository-list-item-context-menu.ts`
- Modify: `app/src/ui/repositories-list/repositories-list.tsx:284-312`（`onItemContextMenu`）

**Interfaces:**
- Consumes: Task 4 的 `onTogglePin`（repositories-list.tsx 中已有同名私有方法，直接复用）
- Produces: `IRepositoryListItemContextMenuConfig.onTogglePinRepository: (repository: Repository) => void`

- [x] **Step 1: 菜单生成器增加配置与菜单项**

`app/src/ui/repositories-list/repository-list-item-context-menu.ts`：

(1) config 接口增加（`onRemoveRepositoryAlias` 之后）：

```ts
  onTogglePinRepository: (repository: Repository) => void
```

(2) `items` 数组开头、`...buildAliasMenuItems(config)` 之前插入：

```ts
    ...buildPinMenuItems(config),
```

(3) 文件末尾增加构建函数：

```ts
const buildPinMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  const label = repository.isPinned
    ? __DARWIN__
      ? 'Unpin Repository'
      : 'Unpin repository'
    : __DARWIN__
    ? 'Pin Repository'
    : 'Pin repository'

  return [
    {
      label,
      action: () => config.onTogglePinRepository(repository),
    },
  ]
}
```

- [x] **Step 2: 调用点接线**

`app/src/ui/repositories-list/repositories-list.tsx` 的 `onItemContextMenu` 中，`generateRepositoryListContextMenu({...})` 配置对象增加一行（`onRemoveRepositoryAlias` 之后）：

```ts
      onTogglePinRepository: this.onTogglePin,
```

- [x] **Step 3: 类型检查与全量单测**

```powershell
npx tsc -P app --noEmit
yarn test app/test/unit/repositories-list-grouping-test.ts
```

预期：均通过。

- [x] **Step 4: Commit**

```powershell
git add app/src/ui/repositories-list/repository-list-item-context-menu.ts app/src/ui/repositories-list/repositories-list.tsx
git commit -m "feat: 仓库右键菜单增加 Pin/Unpin 菜单项"
```

---

### Task 6: 端到端验证

**Files:** 无新增修改（验证任务；发现问题则回到对应 Task 修复）

- [x] **Step 1: 全量单元测试与 lint**

```powershell
yarn test
yarn lint
```

预期：全部通过（运行时间较长，注意 lint 含 prettier 与 eslint）。

- [x] **Step 2: 启动应用手动验证**

```powershell
yarn start
```

验证清单（对照设计文档"已确认的设计决定"）：
1. 打开左上角仓库下拉列表，悬停任一仓库行 → 行右侧出现图钉按钮
2. 点击图钉 → 出现 "Pinned" 分组且排在所有分组（含 Recent）之前；仓库同时保留在原分组
3. 已固定行的图钉常驻显示且高亮；再次点击 → 取消固定，Pinned 组消失（无固定仓库时）
4. 点击图钉不会切换当前选中的仓库
5. 右键菜单出现 "Pin repository" / "Unpin repository"，功能正确
6. 重启应用（关闭后重新 `yarn start`）→ 固定状态保持（IndexedDB 持久化）
7. 过滤框输入文字 → Pinned 组正常参与过滤
8. 仓库总数 ≤ 7 时（可用测试数据目录验证或跳过）Pinned 组仍显示

- [x] **Step 3: 修复验证中发现的问题并补交**

若有问题：定位到对应 Task 的文件，修复后重跑该 Task 的验证步骤，单独 commit。

- [x] **Step 4: 最终提交计划文档勾选状态**

```powershell
git add docs/plans/2026-07-08-pinned-repositories-plan.md
git commit -m "docs: 更新固定仓库实现计划执行状态"
```
