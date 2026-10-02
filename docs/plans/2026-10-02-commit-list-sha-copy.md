# 历史列表显示并复制提交哈希短码

## 目标

- History 列表每个提交的第二行（作者 • 时间）最右侧显示该提交的哈希短码（`commit.shortSha`）。
- 所有行的短码右边缘对齐，与时间处于同一行。
- 点击短码将**短码**写入剪贴板，并给出视觉反馈；点击不会选中该行，也不会触发拖拽。
- 时间显示为年月日时分秒：通过 Settings → Appearance 勾选 “Prefer absolute dates over relative”，并选择 `yyyy-MM-dd` 与 `HH:mm:ss`，无需改代码。

## 实现

### 1. 新组件 `app/src/ui/history/commit-sha-copy.tsx`

- 原生 `<button>`，内容为短码文本；复制成功后在短码前显示 `check` 图标 2 秒。
- `tabIndex={-1}`：列表行内容包裹层为 `aria-hidden`，可聚焦元素会触发 axe `aria-hidden-focus` 违规；键盘用户使用右键菜单已有的 “Copy SHA”。
- `onMouseDown` 阻止冒泡：List 在 mousedown 阶段选中行，`Draggable` 在 mousedown 阶段启动拖拽。
- `onClick` 阻止冒泡并调用 `writeClipboardText(shortSha)`。
- `onKeyDown` 对 Enter/Space 阻止冒泡，避免行级 keydown 吞掉按钮激活。
- 组件卸载时清除反馈计时器（列表是虚拟滚动，行会被回收）。

### 2. `app/src/ui/history/commit-list-item.tsx`

在 `.description` 中 `.byline` 之后渲染 `<CommitShaCopy shortSha={commit.shortSha} />`。

### 3. `app/styles/ui/history/_commit-list.scss`

- `.byline`：`flex: 1 1 auto; min-width: 0;`，空间不足时先截断作者/时间。
- `.commit-sha`：`margin-left: auto; flex-shrink: 0;`，等宽字体、无边框背景；hover 时显示下划线和指针。
- 颜色用 `color: inherit` + `opacity: 0.75`，继承行文字颜色，选中行（反色背景）下无需额外覆盖。

### 4. 测试 `app/test/unit/ui/commit-sha-copy-test.tsx`

- 渲染后显示短码。
- 点击后以短码调用 `writeClipboardText`，并显示复制成功状态。
- mousedown / click 不冒泡到父元素。

## 验收

- `tsc --noEmit` 除依赖自带的 4 条 WeakMap 错误外无新增错误。
- 新增单元测试通过，`repositories-list-grouping-test` 等已有测试不受影响。
- Prettier / ESLint 检查通过。
