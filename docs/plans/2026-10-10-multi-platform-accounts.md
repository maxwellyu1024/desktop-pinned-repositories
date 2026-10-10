# 多代码平台、多账号支持

状态：方案，未实施。

## 目标

- 支持 GitHub（GitHub.com、GitHub Enterprise Server、GHE.com）、GitLab（GitLab.com 与自建）、
  Gitea / Forgejo（含 Codeberg）、Bitbucket Cloud 四类平台，新增平台只需新增一个平台实现模块。
- 任意数量账号同时登录，同一平台、同一主机也可登录多个账号（如两个 GitHub.com 账号）。
- 每个仓库明确绑定一个账号；拉取、推送、PR、CI 状态都使用该账号。
- 界面文案与流程不绑定具体平台：平台名称来自平台实现，能力缺失时对应界面不显示。

终态指标：

| 指标 | 终态 |
| --- | --- |
| 以 endpoint 作为账号唯一标识的代码位置 | 0 |
| 平台实现模块之外直接构造 `API` / 调用 GitHub REST 的位置 | 0 |
| 平台实现模块之外调用 `isDotComAccount` / `isEnterpriseAccount` 做平台判断的位置 | 0 |
| 同一主机可同时登录的账号数 | 不限 |
| 嵌套命名空间（GitLab 子组 `group/sub/repo`）解析失败的远程地址 | 0 |
| 升级后丢失的账号、令牌、仓库关联 | 0 |

## 现状（2026-10-10 调研）

- `Account` 没有平台字段，GitHub.com 与 Enterprise 由 URL 推断；`AccountsStore`、`CredentialSessions`、
  钥匙串键、`getAccountForEndpoint`、`matchGitHubRepository`、`findGitHubTrampolineAccount` 都以
  endpoint 为账号标识，每个主机只能有一个账号，登录同主机新账号会移除旧账号。
- `lib/api.ts`（约 2500 行）是 GitHub REST/GraphQL 客户端，约 80 个文件引用；OAuth 只有一个 GitHub
  OAuth App，回调协议 `x-github-client://oauth`。
- 仓库与账号的关联靠远程地址主机名推断，未持久化；`remote-parsing.ts` 只支持 `owner/name`。
- 数据：localStorage `users`；钥匙串 `"<prefix> - <endpoint>"`；Dexie `owners`、`gitHubRepositories`、
  `repositories.gitHubRepositoryID`、`protectedBranches`；`PullRequestDatabase`、`IssuesDatabase`、
  `GitHubUserDatabase`。
- 非 GitHub 主机已可通过通用凭据（每主机一个用户名，密码在钥匙串）完成 Git 操作。

## 架构

### 平台与能力

```ts
type ProviderKind = 'github' | 'gitlab' | 'gitea' | 'bitbucket'

interface IHostingProvider {
  readonly kind: ProviderKind
  readonly displayName: string            // "GitHub"、"GitLab"…，界面文案统一取这里
  detect(host: URL): Promise<IHostInfo | null>   // 自建实例探测与版本
  readonly auth: IProviderAuth
  createClient(account: Account): IHostingClient
}

interface IHostingClient {
  readonly capabilities: ReadonlySet<Capability>
  identity: IIdentityApi                   // 当前用户、邮箱、组织/群组
  repositories: IRepositoryApi             // 列表、详情、克隆信息、创建（发布）、fork
  pullRequests?: IPullRequestApi           // GitHub PR / GitLab MR / Gitea PR / Bitbucket PR
  checks?: IChecksApi                      // 提交状态、流水线、重新运行
  issues?: IIssuesApi                      // 自动补全：issue、提及
  branchRules?: IBranchRulesApi            // 保护分支、推送规则
  liveUpdates?: ILiveUpdatesApi            // 仅 GitHub alive
  webUrls: IWebUrls                        // 仓库、提交、分支比较、新建 PR 的网页地址
}
```

- `app/src/lib/hosting/<kind>/` 每个平台一个目录；现有 `lib/api.ts`、`endpoint-capabilities.ts`、
  Copilot 相关代码移入 `hosting/github/`，Copilot 为 GitHub 独有能力。
- 各 store（`pull-request-store`、`commit-status-store`、`issues-store`、`api-repositories-store`…）
  只依赖 `IHostingClient` 接口，按 `capabilities` 决定是否工作。
- 统一领域模型：`HostedRepository`、`Namespace`（替代 `Owner`，支持多级路径）、`PullRequest`、
  `CheckRun`、`Mentionable`；平台差异在平台模块内转换。

### 账号

```ts
interface AccountKey {
  readonly provider: ProviderKind
  readonly apiEndpoint: string   // 规范化后的 API 地址
  readonly userId: string        // 平台用户 ID（字符串，兼容各平台）
}
```

- `Account` 增加 `provider`，以 `AccountKey` 为唯一标识；同主机多个账号并存。
- `AccountsStore` 持久化键改为 `accounts`（新格式），按 `AccountKey` 增删改；排序按平台、主机、登录名。
- 钥匙串服务名：`"<prefix> - <provider> - <apiEndpoint>"`，钥匙串账号名为 `userId`。
- `CredentialSessions` 的租约、刷新、吊销以 `AccountKey` 为键。

### 登录

| 平台 | 方式 |
| --- | --- |
| GitHub | 现有 OAuth 浏览器流程；Enterprise 输入主机 |
| GitLab | OAuth 2.0 + PKCE（GitLab.com 内置应用；自建实例填写应用 ID，或使用个人访问令牌） |
| Gitea / Forgejo | OAuth 2.0 + PKCE（实例上注册的应用）或个人访问令牌 |
| Bitbucket Cloud | OAuth 2.0 或 App Password / API Token |

- 回调统一为 `x-ghdock-client://oauth/<provider>`，`state` 中包含平台与主机，防 CSRF 校验沿用现有逻辑。
- 登录界面第一步选择平台，再选择 SaaS 或输入自建主机；令牌方式作为每个平台的备选。
- OAuth 客户端信息按平台在构建时注入（`__OAUTH_<PROVIDER>_CLIENT_ID__`），自建实例由用户填写并随账号保存。

### 仓库与账号绑定

- `repositories` 增加 `accountKey`（可空）；`gitHubRepositories` 更名为 `hostedRepositories`，
  增加 `provider`、`fullPath`（多级命名空间）、`namespaceID`；`owners` 更名为 `namespaces`。
- 绑定规则，按顺序：
  1. 已绑定且账号仍存在 → 使用；
  2. 远程主机下只有一个账号 → 自动绑定；
  3. 多个账号 → 依次以各账号请求仓库详情，首个有权限的账号绑定，均有权限时选推送权限最高者；
  4. 无账号 → 不绑定，Git 操作走通用凭据。
- 仓库设置新增“账号”选项，可手动更换绑定。
- `remote-parsing.ts` 解析为 `{protocol, hostname, fullPath, name}`，支持任意层级命名空间与
  GitLab `/-/` 路径、Bitbucket `scm/` 前缀、SSH 别名。

### Git 凭据

- 启动 Git 时通过 trampoline 环境变量传入仓库绑定的 `AccountKey`；凭据助手优先使用该账号，
  其次按 `origin + username` 匹配账号，再按主机唯一账号匹配，最后走通用凭据。
- 各平台的 HTTPS 用户名约定由平台实现提供（GitHub 用 login，GitLab 用 `oauth2`，Bitbucket 用
  `x-token-auth`）。
- 通用凭据改为每主机多个用户名，与账号使用同一钥匙串命名规则。

### 界面

| 位置 | 终态 |
| --- | --- |
| 偏好设置 · 账号 | 按平台分组列出所有账号，“添加账号”先选平台；每个账号可退出、重新登录 |
| 空仓库页 | 左栏账号选择器显示“平台图标 · 主机 · 登录名”，列出所选账号仓库 |
| 克隆 | 两个标签：“Your Accounts”（账号选择器 + 仓库列表）与 “URL”；不再区分 GitHub.com / Enterprise |
| 发布 | 选择账号 → 选择命名空间（用户、组织、群组）→ 可见性 |
| PR / MR、CI、分支规则 | 绑定账号的平台具备该能力时显示；术语用平台自己的叫法（Pull Request / Merge Request） |
| 菜单 | “View on GitHub” 改为 “View on <平台名>”，“Create Pull Request” 按平台显示 MR 等 |
| Copilot | 只在 GitHub 账号下可用，其余平台不显示入口 |

## 数据迁移

升级首次启动时一次完成，迁移前把 `users` 与数据库版本记入日志，失败时保留旧数据不删除，下次启动重试。

1. localStorage `users` → `accounts`：每个账号 `provider = 'github'`，`userId = String(id)`。
2. 钥匙串：按旧键 `"<prefix> - <endpoint>"` 读取令牌，写入新键后再删除旧键。
3. Dexie 新版本：`owners` → `namespaces`、`gitHubRepositories` → `hostedRepositories`
   （`provider = 'github'`，`fullPath = login/name`），`repositories.accountKey` 按现有 endpoint 匹配回填。
4. `PullRequestDatabase`、`IssuesDatabase`、`GitHubUserDatabase` 中的 `gitHubRepositoryID` 改为
   `hostedRepositoryID`，数值不变。
5. `endpoint-version:*`、`selected-copilot-models-by-account`、`genericGitAuth/username/*` 键名改为
   新的账号键格式。

## 实施顺序

每一步都直接写成终态代码，完成后应用可正常使用：

1. 平台接口与领域模型；GitHub 实现迁入 `hosting/github/`，各 store 改为依赖接口。
2. `AccountKey`、账号存储、钥匙串、凭据租约与数据迁移；同主机多账号。
3. 仓库绑定、远程地址解析、凭据助手按绑定选账号；仓库设置中的账号选项。
4. 界面：偏好设置账号页、登录流程选平台、克隆、发布、菜单文案、能力驱动的显示。
5. GitLab 实现（含 MR、流水线状态）。
6. Gitea / Forgejo 实现。
7. Bitbucket Cloud 实现。

## 验证

- 单元测试：各平台远程地址解析（含子组、SSH 别名）、账号绑定规则、凭据助手选账号、
  数据迁移（旧 `users`、旧钥匙串键、Dexie 旧版本 → 新版本，迁移失败重试不丢数据）、
  各平台 API 响应到领域模型的转换。
- 手动：同时登录两个 GitHub.com 账号与一个 GitLab 账号，分别克隆、推送、查看 PR / MR 与 CI 状态；
  升级现有数据后账号、仓库、PR 列表完整。
- 类型检查、ESLint、Prettier 通过。
