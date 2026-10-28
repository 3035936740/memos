# 风格包与博客搬家：前端接入约定

后端为本轮新增；本文件供后续 Claude 接入界面。风格选择、安装向导、文章 `#style/ID`、导入页面尚需前端接线。已有“外观包” `memos-plus.appearance` 与本轮 CSS 风格包是两种格式。

## 社区风格包

`InstanceService` 的 Go、Connect、网关、OpenAPI 和 TypeScript 类型已通过 `buf generate` 生成。前端调用现有 `instanceServiceClient`：

| 方法 | 参数 | 返回与权限 |
| --- | --- | --- |
| `listStylePacks` | `{includeDisabled?: boolean}` | `{stylePacks: StylePack[]}`；默认匿名可读，含停用包仅管理员可读 |
| `installStylePack` | `{zip: Uint8Array}` | `StylePack`；仅管理员，安装后默认停用 |
| `updateStylePack` | `{id, enabled?: boolean, zip?: Uint8Array}` | `StylePack`；仅管理员。新 ZIP 的 manifest ID 必须相同 |
| `deleteStylePack` | `{id}` | 空响应；仅管理员 |
| `exportStylePack` | `{id}` | `{zip: Uint8Array}` 原始 ZIP；仅管理员 |

`StylePack` 包含 `id`、多语言 `name`、`reactsLike`、`colorScheme`、`version`、`cssUrl`、`enabled`。匿名列表只返回启用包，不包含原始 CSS、资源内容或安装人。

选中包时加载 `cssUrl`，并在 `<html>` 设置 `data-style="<id>"`。不要把包 ID 塞进只接受内置值的 `isBlogStyle()`。需扩展 `blog-style.ts`、`post-look.ts`、`appearance-pack.ts`、`ViewContext`、选择器/向导/图鉴等消费处。`reactsLike` 只借用内置反应规则；未填写时不增加反应。

重新获取启用列表后，如果本地保存的包、文章指定的包不再存在，回退 `default` 并移除已加载的包 CSS。后台停用/删除会在同一事务中把持久化的 `firstVisitDefaultStyle` 回退；保存系统设置时也会拒绝不存在或停用的包。

CSS 地址 `/style-packs/<id>/<version>.css`，资源地址 `/style-packs/<id>/<version>/assets/<name>`，同版本内容不可变。更新保留旧版本资源；停用/删除后服务端不再提供这些资源。已被浏览器缓存的字节无法远程撤回，因此列表回退逻辑必须接入。

### ZIP 格式与限制

根目录 `style.json`、`style.css`，可选 `assets/`。manifest 遵循需求文件的 version 1。ZIP 上限 3 MiB，CSS 200 KiB，资源最多 20 个、合计 2 MiB；仅 PNG/JPG/WebP/GIF/SVG/WOFF2，校验实际类型。

安全编译使用 `tdewolff/parse/v2`，检查 CSS 转义后的含义。`:root` 改写为风格门控，普通选择器逐项加门控；支持 `:is()` / `:where()` 和 `@media` 等嵌套条件。动画名及字体名增加包前缀，避免污染其他风格。

仅允许 `asset:` 和不超过 64 KiB 的 base64 PNG/JPEG/GIF/WebP data URL；禁止外网 URL、`@import`、`@namespace`、未知 at-rule、脚本函数、非自定义属性的 `!important`。字体 `src` 必须使用包内 WOFF2，含空格的字体名须加引号。SVG 只允许背景使用；拒绝脚本、事件、外部引用、foreignObject 等，响应带 CSP / nosniff。

## 博客导入

以下是经过鉴权的 REST JSON 接口；不使用 Connect 的 base64 上传，避免放大 100 MB 归档的内存。均携带现有 `Authorization: Bearer …`，所有返回为 `no-store`。不同用户无法访问对方预览或任务。

### 1. `POST /api/v1/imports/preview`

`multipart/form-data`，字段：

- `file`：一个 Markdown ZIP 或 WordPress WXR XML。
- `format`：`markdown` 或 `wordpress`；可省略，由文件扩展名判断。
- `source`：来源标识，建议界面让用户填旧博客地址/名称；同一来源之后必须复用。省略时为 `markdown` / `wordpress`。来源和原文 ID/文件路径共同用于防重复。

返回 `{id, source, format, expiresAt, posts}`。预览不写数据库，只在 Data directory 的 `imports/previews/<user>/<id>` 暂存原文件和解析结果，30 分钟过期。每用户最多 3 份未过期预览，过期文件在下一次上传时清理。

每篇包含 `id`、`title`、`created`/`updated`（RFC3339）、`tags`、`categories`、映射后的 `category`、`draft`、`private`、默认 `visibility: "PRIVATE"`、`slug`、`sourceUrl`、`changes`（标签清理记录）、`localImages`、`externalImages`、`skipReason`、`error`、`state`。正文 `content` 在预览响应中为空，实际解析结果留在用户私有暂存文件中。

界面默认勾选没有 `skipReason` 的文章，默认可见性选“私有”，展示草稿/私有状态、时间、图片数及清理记录，确认后才运行。站点分类按名称/slug 匹配；未匹配分类转为 `#分类/名称`。无时区日期按 UTC 解释。

### 2. `POST /api/v1/imports/run`

```json
{
  "previewId": "预览 id",
  "selectedIds": ["posts/hello.md"],
  "visibility": "PRIVATE",
  "space": "spaces/空间UID"
}
```

`selectedIds` 省略表示全部，空数组表示不选；`visibility` 省略为 PRIVATE，可选 PRIVATE/PUBLIC/PROTECTED/SPACE；SPACE 必须提供 space。其他可见性也可以指定目标 Space，运行前及写入时都会检查发文权限。草稿和 WordPress private 始终覆盖为 PRIVATE，草稿标志保留。

返回 HTTP 202，任务元数据 `{id, state, source, createdTs, updatedTs, cancelRequested}`。每个用户只有一个运行任务，冲突返回 409。任务按文章串行处理，保留原时间，经过既有屏蔽词及 AI 文本/图片审核；一篇失败不终止其余文章。余额/服务异常不放行该篇。

ZIP 本地图片通过现有附件上传管线存储和审核，改写 Markdown 图片节点；外链保留且不会下载。不导入评论，不触发批量 @通知或 webhook，仅结束时刷新备忘录列表。

创建备忘录、绑定附件、防重复记录处于同一数据库事务。重复或失败不会留下半篇文章；失败时尝试清理本次尚未绑定的附件。普通创建接口依旧只有管理员能指定时间。

### 3. `GET /api/v1/imports/<jobId>`

返回任务元数据及 `report: {entries, imported, skipped, failed}`。建议运行中每 1–2 秒轮询，终态停止。`entries` 是已处理文章的元数据（正文不返回），`state` 为 imported/skipped/failed，成功有 `memo: "memos/…"`，失败有 `error`，跳过有 `skipReason`。

任务状态：`running`、`completed`、`cancelled`、`failed`、`interrupted`。任务和报告持久化；进程意外退出后，超时租约会在下一次创建任务时回收，已导入文章依旧防重复。

### 4. `DELETE /api/v1/imports/<jobId>`

请求取消，返回 204。当前文章完成后停止，不删除已经成功导入的文章。继续轮询直到终态。

### 管理员上传限制

`GET` / `PUT /api/v1/admin/import-settings`，JSON `{ "maxUploadMb": 100 }`，支持 1–250 MiB。默认 100 MiB。单篇正文遵循普通备忘录长度限制。ZIP 最大 5000 项、解压总量 256 MiB、单文件 20 MiB；Markdown 解析上限 1 MiB，拒绝路径穿越、重复路径、符号链接和特殊文件。XML 不允许 DTD/外部实体。

## 发布验证状态

本地只使用 SQLite；MySQL/PostgreSQL 的运行验证交给 Actions 临时容器，没有连接公开共享 SQL，也没有上传本站数据。本机 Docker 按用户要求不再启动。

`main`、canary 和 release 已配置检查门禁。原版升级烟雾测试会按 `internal/version/upstream-version.txt` 读取版本，使用原版镜像分别创建 SQLite/MySQL/PostgreSQL 哨兵数据再升级。

匿名镜像校验使用独立空 Docker 配置，检查 amd64/arm64/arm-v7 后拉取启动；同任务执行 `--cpus 1 --memory 1g` 的 SQLite 测量，产出 `resource-benchmark.json`（空闲内存、50 并发首页/文章请求延迟和内存样本）。实际报告生成前，README 不宣称最低配置已验证。

仍需仓库拥有者：推送代码后检查 Actions，将 GHCR 包设为 public，再决定 RC/正式标签与演示站切换。此次没有创建发布标签、发布 Release 或改动演示站。

### 本地验证记录（2026-10-28）

- `pnpm lint`：TypeScript 与 Biome 均通过，检查 816 个文件。
- `pnpm test`：180 个测试文件、1314 个测试通过，无未处理异常。
- `pnpm build`：生产构建通过；仍有已有的较大 chunk 提示。
- `DRIVER=sqlite go test ./...`：通过；Windows 跳过 POSIX 权限切换测试，该测试由 Linux CI 执行。
- `golangci-lint run`：0 issues。
- `buf generate`、`buf lint`：通过，生成的 Go/TS/OpenAPI 一并保留。

本轮修复了旧测试夹具缺失的分页 Space 查询、i18n 导出、上下文与新 Select 交互；同时修复了已加载单个 Space 后重复标题检测漏算的问题。三个 SQL 驱动的迁移文件与 LATEST 均已更新，但 MySQL/PostgreSQL 实例运行结果仍需 CI 确认。

新增依赖经用户批准：`tdewolff/parse/v2 v2.8.20`、`html-to-markdown/v2 v2.5.2`；其 MIT 许可及传递依赖 dom 的许可保存在 `docs/licenses/`。导入不会触发外部资源抓取。MySQL 原有 TIMESTAMP 列的日期范围有限，超出范围的文章记为失败，不替换为当前时间。
