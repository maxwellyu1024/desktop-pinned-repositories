# 设计文档：固定仓库（Pinned Repositories）功能

- 日期：2026-07-08
- 状态：已批准，待实现

## 需求

1. 在仓库下拉列表（界面左侧上方）中，于"最近"（Recent）分组之前增加一个"固定"（Pinned）分组，用户可以把仓库固定在该分组中。
2. 列表项最右侧增加一个图钉图标按钮，用于固定/取消固定仓库。

## 已确认的设计决定

| 决定点 | 结论 |
| --- | --- |
| 图钉按钮显示时机 | 未固定项：行悬停或键盘聚焦时显示；已固定项：常驻显示（active 样式） |
| 分组行为 | 重复显示——固定的仓库同时出现在"固定"分组和原分组中（与 Recent 分组行为一致） |
| 存储方式 | 仓库数据库字段——在 IndexedDB 的 Repository 记录上增加 `isPinned` 字段（参照 `alias` 字段的模式） |
| 分组显示条件 | "固定"分组不受"仓库总数 > 7"阈值限制，只要存在固定仓库就显示 |
| 分组标题 | `Pinned`（与现有英文 UI 一致） |

## 实现方案

### 一、数据层

1. **`app/src/lib/databases/repositories-database.ts`**
   - `IDatabaseRepository` 接口增加 `readonly isPinned?: boolean`。
   - `isPinned` 不需要索引，Dexie 只对索引字段声明 schema，因此**不需要数据库版本迁移**；旧记录读出为 `undefined`，视为 `false`。

2. **`app/src/models/repository.ts`**
   - `Repository` 构造函数末尾增加参数 `isPinned: boolean = false`（放在最后，避免影响现有调用方）。
   - 将 `isPinned` 加入 `hash` 计算，保证固定状态变化后依赖 hash 的缓存和比较正确失效。

3. **`app/src/lib/stores/repositories-store.ts`**
   - 新增 `updateRepositoryPinned(repository: Repository, isPinned: boolean)`：更新 DB 记录 + `emitUpdatedRepositories()`（与 `updateRepositoryAlias` 同构）。
   - `toRepository()` 及其余 5 处 `new Repository(...)` 调用点补传 `isPinned`。

### 二、状态流转

4. **`app/src/ui/dispatcher/dispatcher.ts`** 新增 `changeRepositoryPinned(repository, isPinned)`。
5. **`app/src/lib/stores/app-store.ts`** 新增 `_changeRepositoryPinned`，调用 `repositoriesStore.updateRepositoryPinned`。
   - DB 更新后 `emitUpdatedRepositories` 自动触发仓库列表刷新，不需要新增独立状态字段——固定状态在 `Repository` 对象上随 props 自然流到列表组件。

### 三、分组逻辑（`app/src/ui/repositories-list/group-repositories.ts`）

6. `RepositoryListGroup` 联合类型增加 `kind: 'pinned'`。
7. `getGroupKey` 为 pinned 返回 `0:pinned`，其余组顺延：recent → `1:`、dotcom → `2:`、enterprise → `3:`、other → `4:`。分组 key 的字典序排序机制自动保证"固定"组排在"最近"组之前。
8. `groupRepositories()` 遍历时，`repo instanceof Repository && repo.isPinned` 为真则同时加入 pinned 组（与 recent 组的重复添加逻辑并列）。
9. 重名消歧：pinned 组与 recent 组同等对待——统计名称计数时跳过 pinned 组；组内条目在任意组存在重名时显示 `owner/` 前缀。

### 四、UI 层

10. **`app/src/ui/repositories-list/repositories-list.tsx`**
    - `getGroupLabel` 增加 `'pinned'` → `'Pinned'`。
    - `renderItem` 向列表项传入 `onTogglePin` 回调（内部调用 `dispatcher.changeRepositoryPinned`）。

11. **`app/src/ui/repositories-list/repository-list-item.tsx`**
    - 在右侧 `repo-indicators` 区域前渲染图钉按钮（octicon `pin`）：
      - 未固定项：默认隐藏，行 `:hover` 或 `:focus-within` 时显示，点击固定。
      - 已固定项：常驻显示并加 `active` 样式，点击取消固定。
      - 点击时 `stopPropagation`，避免触发选中仓库。
    - `CloningRepository` 无 `isPinned`，不渲染图钉按钮。
    - **修改 `shouldComponentUpdate`**：目前只比较仓库 id 与 matches，固定状态变化不会触发重绘；改为比较 `repository.hash`。

12. **样式**：在 `app/styles/ui/` 的仓库列表样式文件中增加图钉按钮的悬停显隐与 active 状态规则。

13. **右键菜单（`app/src/ui/repositories-list/repository-list-item-context-menu.ts`）**
    - 增加 "Pin repository / Unpin repository" 菜单项，作为悬停按钮的无障碍兜底（纯键盘和屏幕阅读器用户）。

### 五、测试

14. 扩展 `groupRepositories` 的现有单元测试，覆盖：
    - 固定组排在所有分组最前；
    - 固定组不受 7 个仓库阈值限制；
    - 固定的仓库同时出现在固定组和原分组；
    - 固定组内的重名消歧行为。

## 边界情况

- **已固定的仓库被删除**：`isPinned` 随 DB 记录整体删除，无残留。
- **克隆中的仓库**（`CloningRepository`）：不可固定，图钉按钮不渲染，与 recent 组只接收 `Repository` 实例的行为一致。
- **过滤搜索时**：固定组正常参与 FilterList 的过滤，无需额外处理。
- **旧数据兼容**：已有仓库记录无 `isPinned` 字段，读出为 `undefined`，等价于未固定。
