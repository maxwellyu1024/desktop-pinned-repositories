# Pinned 分组自定义排序

## 问题

Pinned 分组组内固定按名称字母排序（`group-repositories.ts` 的 `toSortedListItems`），用户无法决定固定仓库的先后顺序；固定仓库越多，最常用的仓库越难找到。

## 目标

Pinned 分组的顺序完全由用户决定：

- 新固定的仓库追加到分组末尾。
- 鼠标拖拽调整顺序。
- 右键菜单（仓库列表与工具栏 Current Repository 按钮）提供“移到最前 / 上移 / 下移 / 移到最后”，作为键盘与屏幕阅读器的操作路径。
- 顺序持久化在仓库数据库中，重启后保持。
- 固定状态与顺序由同一个字段表达，存储中不再保留 `isPinned` 布尔字段（并存字段数为 0）。

## 设计

### 数据层

- `IDatabaseRepository`：`isPinned?: boolean` 替换为 `pinOrder?: number | null`。`null`/缺失表示未固定，数值越小越靠前。
- 数据库版本 10 的升级函数 `migratePinnedState`：已固定的仓库按当前显示顺序（别名或名称，大小写不敏感）写入 `pinOrder = 0..n-1`，并删除所有记录上的 `isPinned` 字段。升级后用户看到的 Pinned 顺序与升级前一致。
- `Repository`：构造参数 `isPinned: boolean` 替换为 `pinOrder: number | null = null`；`isPinned` 改为由 `pinOrder !== null` 派生的 getter。`pinOrder` 参与 `hash`，顺序变化会触发列表重绘。
- `RepositoriesStore`：
  - `updateRepositoryPinned(repository, isPinned)`：固定时在事务内取当前最大 `pinOrder + 1`（已固定则保持原位）；取消固定时置 `null`。
  - `updatePinnedRepositoriesOrder(repositories)`：在一个事务内把传入顺序写为 `pinOrder = 0..n-1`。

### 排序与移动

`group-repositories.ts`：

- `comparePinnedRepositories`：按 `pinOrder` 升序，相同时按显示名称兜底。Pinned 分组使用它排序，其余分组仍按名称。
- `getPinnedRepositories(repositories)`：返回按上述顺序排列的固定仓库。
- `movePinnedRepository(pinned, repository, insertionIndex)`：把仓库移动到插入位置（插入位置语义与列表拖拽插入点一致，`0..n`），返回新顺序；位置不变时返回 `null`。拖拽和右键菜单都用它。
- `IRepositoryListItem` 新增 `group`，列表项可以知道自己所在分组。

### 状态流转

- `Dispatcher.reorderPinnedRepositories(repositories)` → `AppStore._reorderPinnedRepositories` → `RepositoriesStore.updatePinnedRepositoriesOrder`。

### 拖拽

复用提交列表已有的拖拽框架（`Draggable`、`dragAndDropManager`、`ListItemInsertionOverlay`）：

- `DragType.Repository`；`DragData` 与 `DragElement` 增加仓库类型；`RepositoryDragElement` 渲染拖拽中的仓库名称，`App.renderCurrentDragElement` 按类型分派。
- `SectionList` 新增 `canInsertAtRow`，只有返回 true 的行才包裹插入指示层。
- `SectionFilterList` 新增 `insertionDragType`、`canInsertIntoGroup`、`onDropDataInsertion(group, itemIndex, data)`：把列表行坐标换算成分组内的条目位置。
- `RepositoriesList`：Pinned 分组的条目可拖拽，插入指示只出现在 Pinned 分组内；放下后计算新顺序并派发。过滤文本非空时禁用拖拽（过滤后的条目位置与完整顺序不对应）。

### 右键菜单

仓库已固定且固定仓库不少于 2 个时，在 “Unpin repository” 后显示子菜单 “Move Pinned Repository ▸”：Move to Top / Move Up / Move Down / Move to Bottom；已在顶端或底端时对应项禁用。

## 测试

- `repositories-list-grouping-test.ts`：Pinned 分组按 `pinOrder` 排序；`pinOrder` 参与 hash；`getPinnedRepositories`；`movePinnedRepository` 各插入位置。
- `repository-list-item-context-menu-test.ts`：移动子菜单的显示条件、禁用状态与回调顺序。
- 数据库迁移：旧记录的 `isPinned` 按显示名称转换为 `pinOrder`，并移除 `isPinned`。

## 验收

- 固定、取消固定、拖拽、右键移动后，Pinned 分组顺序与操作一致，重启后保持。
- 升级后已有的 Pinned 顺序不变。
- `tsc --noEmit` 无新增错误；ESLint、Prettier 通过；相关测试通过。
