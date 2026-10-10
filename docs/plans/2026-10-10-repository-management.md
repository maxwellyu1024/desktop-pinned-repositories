# 仓库批量管理与配置导入导出

## 目标

- 仓库列表、别名、置顶顺序与应用设置（含主题配色）可导出为 JSON，手动编辑后重新导入。
- 从指定文件夹批量添加仓库。
- 从其他应用导入仓库：GitHub Desktop 与常用编辑器，只导入 Git 仓库。本应用改名前的旧版不作为来源，也不迁移其数据。
- 与编辑器双向打通：既能从编辑器导入项目，也能用编辑器打开仓库。
- 批量移除仓库；清空 = 全选后移除，不单设清空入口。
- 移除默认只从列表移除；可选同时把文件夹移到废纸篓（可恢复），任何操作都不直接从磁盘删除文件。

## 入口

File 菜单（macOS 与 Windows / Linux 一致）：

| 菜单项 | MenuEvent | 弹窗 |
| --- | --- | --- |
| Add Repositories from Folder… | `add-repositories-from-folder` | 选择文件夹 → `PopupType.AddRepositoriesFromFolder` |
| Add Repositories from Other Apps… | `add-repositories-from-apps` | `PopupType.AddRepositoriesFromApps` |
| Manage Repositories… | `manage-repositories` | `PopupType.ManageRepositories` |
| Import Configuration… | `import-configuration` | 选择文件 → `PopupType.ImportConfiguration` |
| Export Configuration… | `export-configuration` | 保存对话框，直接写文件 |

## 配置文件格式

```json
{
  "version": 1,
  "repositories": [
    { "path": "~/dev/foo", "pinned": true },
    { "path": "~/dev/bar", "alias": "Bar" },
    { "path": "/opt/work/baz" }
  ],
  "settings": {
    "theme": "dark",
    "tab-size": 4,
    "confirmForcePush": true,
    "custom-editor": { "path": "/usr/local/bin/code", "arguments": "%TARGET_PATH%" }
  }
}
```

- `repositories`：数组顺序即置顶顺序（只看 `pinned: true` 的项）。`path` 在家目录下时导出为
  `~/…`，导入时展开；`alias`、`pinned` 可省略（等同 `null` / `false`）。
- `settings`：键与 localStorage 键一致，值为原生类型（布尔、数字、字符串、对象）。
  只导出白名单中的偏好设置（`app/src/lib/configuration/settings.ts`）；
  账号、令牌、统计、窗口尺寸、一次性提示等不导出。导入时未知键报错，缺省的键保持不变。
- 两个顶层字段都可省略，只导入仓库或只导入设置。
- 文件开头的 UTF-8 BOM 会被忽略。
- 解析失败时提示 JSON 语法错误所在的行列（V8 的错误信息不含位置，由 `json-error-location.ts` 定位）；字段类型错误提示具体路径（如 `repositories[3].alias`）。

## 导入

1. 选择文件 → 解析与校验 → 预览弹窗：
   - 将添加：文件中有、列表中没有，且磁盘上是 Git 仓库的路径；
   - 将更新：已在列表中，别名或置顶状态与文件不同；
   - 将移除（仅“以文件为准”）：列表中有、文件中没有；
   - 跳过：路径不存在或不是 Git 仓库；
   - 设置：将写入的设置项数量。
2. 模式：
   - **合并**（默认）：添加与更新，不移除；文件外已置顶的仓库排在文件中置顶仓库之后。
   - **以文件为准**：额外移除文件中没有的仓库，列表与文件完全一致。
3. 确认后依次：添加仓库（复用 `_addRepositories`）、一次事务写入别名与置顶顺序、
   移除仓库、写入设置。写入了设置时重新加载窗口，使所有设置生效。

## 从文件夹批量添加

选择文件夹后递归扫描（最多 4 层）：含 `.git`（目录或文件）的目录视为仓库，不再深入其子目录；
跳过隐藏目录、`node_modules` 与符号链接。结果用[分栏选择列表](#分栏选择列表)展示，左侧为“All”与远程分组，
默认勾选未添加的仓库，已添加的置灰，确认后通过 `_addRepositories` 添加。

## 从其他应用导入

弹窗打开后读取所有已安装应用记录的项目，用[分栏选择列表](#分栏选择列表)展示：左侧依次为
“All Apps”、“Found In”下各来源（显示数量）、远程分组；多个来源时每行注明所在来源。
默认勾选未添加的仓库，已添加的置灰。

| 来源 | 数据位置（macOS，`appData` = `~/Library/Application Support`） | 读取方式 |
| --- | --- | --- |
| GitHub Desktop | `appData/GitHub Desktop/IndexedDB` | 主进程复制 IndexedDB 到临时目录，用 `session.fromPath` 隐藏窗口读取 `Database.repositories`，结束后删除副本；跳过本应用自身目录 |
| VS Code、Insiders、VSCodium、Cursor、Windsurf | `appData/<名称>/User/workspaceStorage/*/workspace.json` | 取 `folder` 的 `file:` URL |
| JetBrains IDE（含 Android Studio） | `appData/JetBrains/<产品><版本>/options/recentProjects.xml` | 读取条目路径，展开 `$USER_HOME$`，同一产品多版本合并、新版本优先 |
| Zed（Stable、Preview） | `appData/Zed/db/0-<channel>/db.sqlite` | `node:sqlite` 只读查询本地 `workspaces.paths` |
| Sublime Text | `appData/Sublime Text/Local/Session.sublime_session` | 读取窗口文件夹与 `folder_history` |

- 项目路径解析为所在仓库的根目录：向上查找 `.git`，不越过家目录；不在仓库中的项目丢弃。
- 单个来源读取失败只记录日志，不影响其他来源；没有仓库的来源不显示。
- 不支持：ZCode（数据在浏览器存储中）、Xcode（二进制 `sfl3` 书签）。

## 用编辑器打开

已有能力，无需新增：仓库右键菜单 “Open With Editor” 子菜单、Repository 菜单 “Open With…”，
编辑器列表（`app/src/lib/editors/*`）覆盖上表全部编辑器。

## 分栏选择列表

添加类弹窗与批量管理共用 `RepositoryPicker`（`repository-picker.tsx`）：

- 弹窗随窗口缩放：宽 `min(90vw, 960px)`、高 `85vh`，列表占满剩余高度，不支持拖动改变大小。
- 左侧分组，各弹窗提供自己的分组，第一个分组为全部；远程分组共用：
  - 读取每个仓库的默认远程（`origin`，没有则第一个），8 个并发，弹窗打开后异步加载，期间左侧显示“Reading remotes…”；
  - SSH 主机别名经 `resolveRemoteHostAliases` 解析为真实主机，按“主机 → 用户或组织”两级分组，
    没有远程或无法解析的归入“No Remote”。
  - 展开状态由用户控制：主机右侧的箭头展开 / 折叠，选中主机时自动展开；
    选择其他分组、移除仓库、远程加载完成都不会折叠已展开的主机。
  - 选中的分组因移除仓库而消失时，改选其上级（主机），上级也不存在时改选第一个分组。
- 右侧：过滤框（匹配名称、别名或文件夹名、远程 `owner/repo`、路径；回车不提交弹窗）、
  Select all / Select none、已选数量、勾选列表。
- 每行：名称（别名时附文件夹名）、置顶图标、缺失标记、备注；第二行为远程 `owner/repo` 与 `~` 缩写的路径。
- Shift 点击勾选框：从上次点击的仓库到当前仓库全部设为相同状态（跳过置灰项）。
- 操作只作用于“当前分组 + 过滤结果”中勾选的仓库：Select all、已选数量、确认按钮数量三者始终一致；
  切换分组时其他仓库的勾选状态保留但不参与操作。

## 批量管理

分组：All、Missing、Pinned（为空时不显示），然后是远程分组；缺失的仓库不读取远程。

- 底部左侧“Also move the folders to Trash”勾选框，默认不勾选、每次打开重置：
  - 未勾选：说明“Removed repositories stay on disk, only the list changes.”，按钮为“Remove N Repositories”；
  - 勾选：勾选框与说明变红，说明文件夹移到废纸篓、不直接删除、可从废纸篓恢复，按钮为“Move N Repositories to Trash”。
- 按钮：“Close”为默认按钮（回车只会关闭），移除按钮红色文字；未选中时禁用且不显示数量。
- 移除：勾选废纸篓时逐个移到废纸篓（缺失的仓库无需移动），移动失败的仓库保留在列表中并汇总报错；
  其余一次事务从列表删除（`RepositoriesStore.removeRepositories`）。移除后弹窗保持打开。
- 批量置顶与身份见 [仓库身份一键切换与闭环](2026-10-10-identity-switching.md#入口)。

### 批量别名

批量操作中的“Alias”菜单按钮，作用于选中仓库：

- “Set Alias…”：打开别名弹窗（与单个仓库共用 `ChangeRepositoryAlias`，参数为仓库数组），把选中仓库设为同一个别名。
  - 初始值：选中仓库别名都相同时为该别名，单个仓库无别名时为仓库名，否则为空。
  - 多个仓库时警告：列表中这些仓库将显示为同一个名字，只能靠路径区分。
  - 选中仓库中已有不同别名的，警告将被替换，列出名称（最多 3 个，其余计数）。
- “Remove Alias”：仅当选中仓库有别名时可用，直接清除。
- 多个仓库的别名设置或清除后显示横幅“已为 N 个仓库设置别名 X / 清除别名。撤销”，撤销按原值写回。
- 写入：`RepositoriesStore.updateRepositoriesAlias` 单事务；单个仓库的右键菜单同样走此接口。

## 模块

| 文件 | 职责 |
| --- | --- |
| `app/src/lib/configuration/configuration-file.ts` | 格式定义、序列化、解析与校验、`~` 路径转换 |
| `app/src/lib/configuration/settings.ts` | 设置白名单、读取与写入 localStorage |
| `app/src/lib/configuration/import-plan.ts` | 根据文件与当前仓库计算导入计划 |
| `app/src/lib/configuration/json-error-location.ts` | 定位 JSON 语法错误位置 |
| `app/src/lib/scan-repositories.ts` | 扫描文件夹中的仓库 |
| `app/src/lib/repository-sources/*` | 读取各应用记录的项目，解析为仓库根目录 |
| `app/src/main-process/read-desktop-repositories.ts` | 读取另一个 GitHub Desktop 安装的仓库列表 |
| `app/src/ui/repository-management/repository-picker.tsx` | 分栏选择列表、远程分组、列表过滤 |
| `app/src/ui/repository-management/repository-remotes.ts` | 读取默认远程并解析 SSH 别名 |
| `app/src/ui/repository-management/*` | 添加、批量管理、导入预览弹窗 |
| `RepositoriesStore.updateRepositoriesLayout` / `removeRepositories` | 别名、置顶批量写入与批量移除（单事务） |

## 验证

- 单元测试：格式往返、校验错误路径与行号、`~` 展开、导入计划（合并 / 以文件为准 / 置顶顺序）、
  设置白名单读写、文件夹扫描规则、批量移除与布局写入、
  各编辑器数据解析、仓库根目录解析、远程分组与列表过滤。
- 类型检查、ESLint、Prettier 通过。
