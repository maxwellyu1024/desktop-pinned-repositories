# 仓库右键菜单支持选择任意已安装的编辑器和终端

## 目标

仓库右键菜单（仓库列表与工具栏 Current Repository 按钮）除了设置中选定的编辑器、终端外，可以用本机检测到的任意编辑器、终端打开仓库，且不修改设置。

## 设计

### 状态

- `AppState` 新增 `availableExternalEditors: ReadonlyArray<string>` 与 `availableShells: ReadonlyArray<Shell>`。
- `AppStore.loadAvailableIntegrations` 在启动时并行调用 `getAvailableEditors` / `getAvailableShells`（两者已有进程级缓存），完成后 `emitUpdate`。

### 打开动作

- 编辑器：复用已有的 `Dispatcher.openInSelectedExternalEditor(path, editor, null)`。
- 终端：新增 `Dispatcher.openInSelectedShell(path, shell)` → `AppStore._openInSelectedShell`，在已检测到的终端中精确匹配，找不到时抛出 `ShellError`。

### 菜单

`generateRepositoryListContextMenu` 新增两个子菜单：

- “Open With Terminal ▸”：紧随 “Open in <默认终端>”，列出全部已检测终端。
- “Open With Editor ▸”：紧随 “Open in <默认编辑器>”，列出全部已检测编辑器。
- 设置中选定的一项打勾；使用自定义编辑器/终端时不打勾。
- 可选项少于 2 个时不显示子菜单（与已有的默认项重复）；仓库缺失时子菜单禁用。
- 原有的默认项保持不变，常用操作仍是一次点击。

### 测试

`app/test/unit/repository-list-item-context-menu-test.ts`：子菜单列出全部选项并标记默认项、点击后以所选编辑器/终端回调、少于 2 项时隐藏、仓库缺失时禁用。
