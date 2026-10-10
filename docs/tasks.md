# 任务清单

本文件是所有待处理事项的唯一清单：任务、待确认问题、已知问题。
设计与方案写在 `docs/plans/` 的方案文档中，本文件只记录“要做什么、做到哪了”，通过链接引用方案，不重复方案内容。

维护规则：

- 新增事项时写明来源方案（没有方案的写“无”），完成后勾选并注明提交号。
- 已完成事项保留一段时间供回溯，定期移到文末“已完成”。
- 状态：`[ ]` 未开始 / `[~]` 进行中 / `[x]` 已完成 / `[?]` 待用户确认。

## 方案文档索引

| 方案 | 状态 |
| --- | --- |
| [仓库批量管理与配置导入导出](plans/2026-10-10-repository-management.md) | 已实施，持续改进 |
| [多代码平台、多账号与仓库身份](plans/2026-10-10-multi-platform-accounts.md) | 方案，未实施 |
| [改名 GHDock](plans/2026-10-10-rename-ghdock.md) | 已实施 |
| [独立应用身份](plans/2026-10-10-independent-app-identity.md) | 已实施 |
| [应用名称文案](plans/2026-10-10-app-name-strings.md) | 已实施 |
| [GHDock 图标](plans/2026-10-10-ghdock-icon.md) | 已实施 |
| [Fork CI 与打包](plans/2026-10-10-fork-ci-packaging.md) | 已实施 |
| [无账号时在 GitHub 上查看](plans/2026-10-10-view-on-github-without-account.md) | 已实施 |
| [SSH 主机别名解析](plans/2026-10-02-ssh-host-alias-resolution.md) | 已实施 |
| [仓库菜单“用…打开”](plans/2026-10-02-repository-menu-open-with.md) | 已实施 |
| [仓库列表显示当前分支](plans/2026-10-02-repository-list-current-branch.md) | 已实施 |
| [置顶仓库排序](plans/2026-10-02-pinned-repositories-order.md) | 已实施 |
| [提交列表复制 SHA](plans/2026-10-02-commit-list-sha-copy.md) | 已实施 |
| [置顶仓库设计](plans/2026-07-08-pinned-repositories-design.md) / [计划](plans/2026-07-08-pinned-repositories-plan.md) | 已实施 |

## 进行中

（无）

## 待用户确认

- [?] 重新打包正式版供试用（需用户同意后再打包，避免覆盖 `/Applications/GHDock.app` 正在使用的版本）。
- [?] GHDock 当前仓库列表为空：是有意清空还是迁移失败？旧数据目录 `GitHub Desktop Pinned` 完整保留，未动过。
- [?] 确认 [多代码平台、多账号与仓库身份](plans/2026-10-10-multi-platform-accounts.md) 方案后再开始实施。
- [?] 在 GitHub 上为 `maxwellyu1024/ghdock` 开启 Issues（需用户在仓库设置中操作）。

## 待办

### 仓库管理（方案：[仓库批量管理](plans/2026-10-10-repository-management.md)）

- [ ] 回归测试：导入 / 导出配置、管理仓库、从文件夹添加、从其他应用添加、开始页、用编辑器打开。
- [ ] 已登录状态下开始页布局（含教程按钮）目测验证。
- [ ] “从文件夹添加”分栏弹窗目测验证（需系统选择文件夹对话框，开发版自动化未覆盖）。
- [ ] “GitHub Desktop Pinned” 来源标注为 GHDock 旧版本，避免用户误以为是另一个应用。
- [ ] 管理仓库中批量置顶、批量设置别名（随仓库身份一起做批量套用，见下）。

### 多平台账号与仓库身份（方案：[多代码平台、多账号与仓库身份](plans/2026-10-10-multi-platform-accounts.md#实施顺序)）

- [ ] 第 1 步：平台接口与领域模型，GitHub 实现迁入 `hosting/github/`。
- [ ] 第 2 步：`AccountKey`、账号存储、钥匙串、凭据与数据迁移，同主机多账号。
- [ ] 第 3 步：仓库与账号绑定、远程地址解析（含 GitLab 子组）、凭据助手按绑定选账号。
- [ ] 第 4 步：账号相关界面（偏好设置、登录选平台、克隆、发布、菜单文案）。
- [ ] 第 5 步：仓库身份（作者、签名、SSH 别名、账号写入仓库 `.git/config`），含管理仓库批量套用、配置文件 v2。
  - 现状问题：本仓库提交作者为全局 `powerpook`，推送走 `maxwellyu1024` 别名，身份不一致，正是该步骤要解决的情况。
- [ ] 第 6 步：GitLab 实现。
- [ ] 第 7 步：Gitea / Forgejo 实现。
- [ ] 第 8 步：Bitbucket Cloud 实现。

### 改名遗留（方案：[改名 GHDock](plans/2026-10-10-rename-ghdock.md)）

- [ ] `app/static/index.html` 的 `<title>` 仍为 “GitHub Desktop”，改为 GHDock（开发调试时窗口与 DevTools 标题可见）。

## 已知问题

- 单元测试 “parses files from pull error” 在本机失败：本机全局 `pull.rebase` 配置导致，与代码无关，暂不处理。

## 已完成

- [x] 管理仓库对话框改版（方案：[仓库批量管理 · 分栏选择列表 / 批量管理](plans/2026-10-10-repository-management.md#分栏选择列表)）：
  左侧按状态与“主机 → 用户或组织”分组、对话框随窗口缩放、Shift 连选、已选数量、
  可选“同时移到废纸篓”（红色提示）；“从其他应用添加”“从文件夹添加”共用分栏组件（提交见 git log）。
- [x] 开始页按钮分为“本机添加”与“克隆或新建”两组，统一样式（8a7dda2c18）。
- [x] 开始页内容区宽度与最小窗口显示修复，勾选列表行距收紧（c6556ea76a）。
- [x] 从其他应用添加：只添加当前来源中勾选的仓库，按钮数量与列表一致（502fb52e62）。
- [x] 多代码平台、多账号方案及仓库身份方案（1ad6523813、c929562ead）。
