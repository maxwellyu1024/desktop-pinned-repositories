# 仓库列表显示当前分支

## 目标

仓库列表（侧栏与工具栏 Current Repository 下拉）每个仓库名旁显示当前检出的分支名，无需切换仓库即可知道各仓库停在哪个分支；额外 git 调用数为 0。

## 设计

### 数据来源

列表状态指示（ahead/behind、未提交改动）刷新时已执行 `git status --porcelain=2 --branch`，其结果 `IStatusResult.currentBranch` 即当前分支名（HEAD 分离时为空）。直接复用，不新增 git 调用。

- `ILocalRepositoryState` 新增 `currentBranch: string | null`，`null` 表示 HEAD 分离。
- `AppStore.updateSidebarIndicator` 写入 `status.currentBranch ?? null`；后台 fetch 只更新 ahead/behind，保留已有分支名。
- 刷新时机与现有状态指示一致：当前仓库在每次刷新时更新；其他仓库由 `RepositoryIndicatorUpdater` 周期刷新（受 Advanced 设置中的仓库状态指示开关控制）。

### 展示

- `IRepositoryListItem` 新增 `currentBranch`，`RepositoryListItem` 在名称后渲染 `.branch-name`：次要文字色、小号字体、单行省略；空间不足时以 1000 倍收缩系数先于仓库名截断。HEAD 分离或状态未知时不显示。
- 鼠标悬停提示与行聚焦提示增加 “Branch: <name>”。
- `shouldComponentUpdate` 比较 `currentBranch`，分支变化时重绘。

## 测试

- `repositories-list-grouping-test.ts`：分支名从状态表传入列表项，缺失或分离时为 `null`。
- `ui/repository-list-item-test.tsx`：渲染分支名、`null` 时不渲染、悬停提示包含分支。
