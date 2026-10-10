# 仓库批量管理与配置导入导出

## 目标

- 仓库列表、别名、置顶顺序与应用设置（含主题配色）可导出为 JSON，手动编辑后重新导入。
- 从指定文件夹批量添加仓库。
- 从其他应用导入仓库：GitHub Desktop（含本应用改名前的旧版）与常用编辑器，只导入 Git 仓库。
- 与编辑器双向打通：既能从编辑器导入项目，也能用编辑器打开仓库。
- 批量移除仓库；清空 = 全选后移除，不单设清空入口。
- 所有移除操作只从列表移除，不删除磁盘上的文件。

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
跳过隐藏目录、`node_modules` 与符号链接。弹窗列出结果，默认勾选未添加的仓库，已添加的置灰；
支持全选 / 全不选，确认后通过 `_addRepositories` 添加。

## 从其他应用导入

弹窗打开后读取所有已安装应用记录的项目，按来源分组（“Found in” 下拉框，显示各来源数量），
勾选状态跨来源保留，默认勾选未添加的仓库，已添加的置灰。

| 来源 | 数据位置（macOS，`appData` = `~/Library/Application Support`） | 读取方式 |
| --- | --- | --- |
| GitHub Desktop、本应用旧名 | `appData/<名称>/IndexedDB` | 主进程复制 IndexedDB 到临时目录，用 `session.fromPath` 隐藏窗口读取 `Database.repositories`，结束后删除副本；跳过本应用自身目录 |
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

## 批量管理

弹窗列出全部仓库（名称、别名、路径、缺失标记），支持：

- 按名称、别名、路径过滤；
- 全选（作用于当前过滤结果）、全不选、选中缺失的仓库；
- 移除选中：按钮显示数量，一次事务删除（`RepositoriesStore.removeRepositories`）。

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
| `app/src/ui/repository-management/*` | 添加、批量管理、导入预览弹窗 |
| `RepositoriesStore.updateRepositoriesLayout` / `removeRepositories` | 别名、置顶批量写入与批量移除（单事务） |

## 验证

- 单元测试：格式往返、校验错误路径与行号、`~` 展开、导入计划（合并 / 以文件为准 / 置顶顺序）、
  设置白名单读写、文件夹扫描规则、批量移除与布局写入、
  各编辑器数据解析、仓库根目录解析。
- 类型检查、ESLint、Prettier 通过。
