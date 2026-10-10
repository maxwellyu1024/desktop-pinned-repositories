# View on GitHub 不依赖登录账号

## 背景

“View on GitHub” 的可用性此前完全依赖 `repository.gitHubRepository`。该关联只在
`matchGitHubRepository(accounts, remote)` 命中已登录账号时建立，因此未登录（或 fork
作为独立应用身份后尚未登录）时，所有仓库都落在 “Other” 分组，右键菜单、应用菜单和
无改动页的 “View on GitHub” 全部置灰。打开仓库网页只需要解析远程地址，不需要账号。

## 目标

- 未登录时，远程指向 github.com 的仓库（含 SSH 别名，如 `git@work:owner/name.git`）
  “View on GitHub” 全部可用，入口数：仓库列表右键菜单、工具栏仓库按钮右键菜单、
  应用菜单 `view-repository-on-github`、无改动页建议操作，共 4 处，置灰误判为 0。
- 已关联 GitHub 仓库时行为不变（仍优先使用 `getGitHubHtmlUrl`，包含 fork 的父仓库偏好）。
- 非 github.com 主机（GitLab、Gitee 等无法确认是 GitHub 的远程）保持不可用。

## 设计

### 解析（`app/src/lib/repository-web-url.ts`）

- `getRemoteWebURL(url)`：`parseRemote(url)` 得到真实主机名（SSH 别名经
  `sshHostAliasResolver` 解析），主机为 `github.com` 时返回
  `https://github.com/<owner>/<name>`，否则 `null`。
- `getRepositoryWebURL(repository, remote)`：`getGitHubHtmlUrl(repository)` 优先，
  否则回落到 `getRemoteWebURL(remote.url)`。

### 取远程

- 已选中仓库：直接使用 `IRepositoryState.remote`（加载时 `getRemotes` 已预热别名缓存）。
- 任意仓库（列表右键的仓库不一定已选中）：`AppStore._getRepositoryWebURL(repository)`
  异步执行 `getRemotes` + `findDefaultRemote`，仓库缺失或 git 失败时返回 `null`；
  经 `Dispatcher.getRepositoryWebURL` 暴露。

### 右键菜单

- `generateRepositoryListContextMenu` 配置改为 `gitHubURL: string | null` +
  `onViewOnGitHub(url)`，菜单项启用条件为 `gitHubURL !== null`，菜单构造保持同步纯函数。
- 仓库列表与工具栏仓库按钮的 contextmenu 处理：同步 `preventDefault`，异步取得 URL
  后再生成并弹出菜单。

### 应用菜单与无改动页

- `menu-update.ts`：`view-repository-on-github` 以
  `getRepositoryWebURL(repository, state.remote) !== null` 判定；缺失仓库仍只看关联信息。
- `App.viewRepositoryOnGitHub`：使用选中仓库状态中的 remote 计算 URL。
- `NoChanges.renderViewOnGitHub`：以 `repositoryState.remote` 判定是否展示。

## 测试

- `repository-web-url-test.ts`：HTTPS、SSH、SSH 别名解析到 github.com、非 GitHub
  主机、无法解析的 URL、已关联仓库优先。
- `repository-list-item-context-menu-test.ts`：`gitHubURL` 为 `null` 时置灰，非空时
  启用并以该 URL 回调。
