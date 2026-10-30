# 风格包与博客搬家：前端接入约定

本文记录后端接口及前端接入约定。已有“外观包” `memos-plus.appearance` 与 CSS 风格包是两种格式。导入入口与权限见下文。

## 社区风格包

`InstanceService` 的 Go、Connect、网关、OpenAPI 和 TypeScript 类型已通过 `buf generate` 生成。前端调用现有 `instanceServiceClient`：

| 方法 | 参数 | 返回与权限 |
| --- | --- | --- |
| `listStylePacks` | `{includeDisabled?: boolean}` | `{stylePacks: StylePack[]}`；默认匿名可读，含停用包仅管理员可读 |
| `installStylePack` | `{zip: Uint8Array}` | `StylePack`；仅管理员，安装后默认停用 |
| `updateStylePack` | `{id, enabled?: boolean, zip?: Uint8Array}` | `StylePack`；仅管理员。新 ZIP 的 manifest ID 必须相同 |
| `deleteStylePack` | `{id}` | 空响应；仅管理员 |
| `exportStylePack` | `{id}` | `{zip: Uint8Array}` 原始 ZIP；仅管理员 |
| `previewStylePack` | `{id}` | `{cssUrl, expiresAt}`；仅管理员，停用包也可预览，有效期 1 小时 |
| `validateStylePack` | `{zip: Uint8Array}` | `{manifest?, errors: [{file, line, message}], compiledSize}`；仅管理员，只检查，不写库 |

`StylePack` 包含 `id`、多语言 `name`、`reactsLike`、`colorScheme`、`version`、`cssUrl`、`enabled`，以及可选的多语言 `description`、`previewUrl`、`minVersion`。匿名列表只返回启用包，不包含原始 CSS、资源内容或安装人。

选中包时加载 `cssUrl`，并在 `<html>` 设置 `data-style="<id>"`。不要把包 ID 塞进只接受内置值的 `isBlogStyle()`。需扩展 `blog-style.ts`、`post-look.ts`、`appearance-pack.ts`、`ViewContext`、选择器/向导/图鉴等消费处。`reactsLike` 只借用内置反应规则；未填写时不增加反应。

重新获取启用列表后，如果本地保存的包、文章指定的包不再存在，回退 `default` 并移除已加载的包 CSS。后台停用/删除会在同一事务中把持久化的 `firstVisitDefaultStyle` 回退；保存系统设置时也会拒绝不存在或停用的包。

CSS 地址 `/style-packs/<id>/<version>.css`，资源地址 `/style-packs/<id>/<version>/assets/<name>`，同版本内容不可变。更新保留旧版本资源；停用/删除后服务端不再提供这些资源。已被浏览器缓存的字节无法远程撤回，因此列表回退逻辑必须接入。

### 管理员预览和只检查

`POST /api/v1/style-packs/<id>:preview` 返回一小时有效的 `cssUrl` 和 protobuf Timestamp `expiresAt`（JSON 中为 RFC3339）。样式地址形如 `/style-packs/preview/<token>/<id>/<version>.css`，CSS 内资源地址自动改为 `/style-你现在是 memos-plus 仓库的维护开发者，请直接检查并修改仓库，完成一次“独立维护收尾”。

仓库：
https://github.com/3035936740/memos-plus

背景：
本项目基于 Memos 开发，目前已经解除 GitHub 上与原项目的 fork 关联，后续独立维护。我们需要完善英文文档、保留上游许可和来源说明、修正维护入口、检查发行流程。

本次任务最重要的成果是：一份完整、准确、可供英语用户独立使用的英文 README。

请先简短说明执行顺序，然后直接改文件，不要只输出建议或让我自己修改。以下描述不代表仓库当前一定存在这些问题，必须检查当前分支的真实内容再行动。

────────────────────
一、P0：首先完成英文 README
────────────────────

这是最高优先级，必须先完成，再处理后续任务。

1. 检查现有 README 和多语言文件布局。
   - 默认保留当前中文 README.md，新增或完善 README.en.md。
   - 如果仓库已经采用其他明确的英文文档命名方式，沿用现有约定，不重复创建。
   - 不要未经要求把默认 README 的语言改掉。
   - 在中英文 README 顶部增加可用的相互切换链接。
   - 检查已有文档是否需要同步增加英文入口。

2. 英文 README 必须是完整文档，不能只有英文简介或“请阅读中文文档”。
   阅读中文 README，并结合实际代码、配置、Compose 文件和发布工作流核实内容，至少覆盖现有文档中适用的这些部分：
   - 项目介绍与定位。
   - 与原版 Memos 的关系。
   - 本项目已实现的主要特色。
   - 截图或演示入口（仅使用仓库已有或已核实的资源）。
   - 安装和启动。
   - Docker / Docker Compose 部署（以实际支持情况为准）。
   - 访问地址、端口、数据持久化及必要配置。
   - 升级、备份和恢复注意事项。
   - 从原版 Memos 迁移的适用范围与限制。
   - 开发和构建方式。
   - 问题反馈与贡献入口。
   - 许可证和上游致谢。

   中文 README 中其他仍然有效的重要内容，也应在英文版中保留。

3. 翻译要求：
   - 使用自然、清楚的技术英语，不要机械逐字翻译。
   - 命令、环境变量、配置键、文件路径、版本号、镜像名等保持技术准确。
   - 命令注释和说明文字可以翻译，但不能误改命令本身。
   - 保持中英文的核心事实、功能范围和风险提示一致。
   - 不夸大能力，不把规划中的功能写成已实现。
   - 不能仅凭存在测试脚本，就宣称迁移已经测试通过。
   - 如果中文文档与代码不一致，核实后同步修正两份文档。
   - 对无法确认的关键事实明确标注，不编造版本、镜像、网址或兼容性。

4. 在中英文 README 前部明确独立维护和来源关系。可采用以下文案，并结合实际情况调整：

   中文：
   “Memos Plus 是基于 Memos 开发的非官方衍生项目，由本项目维护者独立维护，采用独立的版本和发布计划。原项目的版权及 MIT 许可声明予以保留，感谢原作者和贡献者。”

   英文：
   “Memos Plus is an independently maintained, unofficial derivative of Memos, with its own versioning and release schedule. The original copyright and MIT license notices are retained. We thank the upstream authors and contributors.”

   在文档中保留指向 Memos 上游项目的有效来源链接。
   不得暗示本项目是 Memos 官方版本或获得官方背书。

5. P0 验收标准：
   - 英语用户不需要阅读中文，就能了解项目并按实际支持的方式完成部署。
   - 原有中文文档的重要内容没有在英文版中遗漏。
   - 中英文切换链接和文档内的本地链接有效。
   - 部署示例与仓库实际配置一致。
   - 独立维护说明、上游致谢、升级风险和许可证入口清楚可见。

────────────────────
二、P1：检查许可证随发行物分发
────────────────────

1. 检查根目录 LICENSE。
   - 保留已有上游版权声明和许可正文。
   - 不把上游版权全部替换成维护者自己的名字。
   - 不擅自更新上游版权年份。
   - 不把 README 中的致谢当作 LICENSE 的替代品。

2. 检查实际使用的发布工作流，包括 .github/workflows/release.yml（如存在）。
   - 确保生成的 ZIP、tar.gz 等发行压缩包包含完整 LICENSE。
   - 覆盖实际存在的不同系统、架构及打包分支。
   - 保持原有可执行文件名称和主要目录布局，避免破坏用户脚本。

3. 检查实际使用的 Dockerfile，包括 scripts/Dockerfile（如存在）。
   - 确保最终运行镜像中包含完整 LICENSE。
   - 必须根据真实构建阶段、COPY 路径和构建上下文修改。
   - 不要直接套用未经验证的多阶段构建示例。

4. 如能构建，实际检查压缩包内容和最终镜像中的许可证文件。
   如不能构建，说明限制，区分“配置已修改”和“产物已验证”。

5. 不宣称本次检查等同于整个项目及全部依赖的完整许可审计。
   已有第三方许可和声明不得删除。

────────────────────
三、P1：修正维护入口与仓库链接
────────────────────

1. 检查 CODEOWNERS。
   - 如果仍使用上游维护团队，改为本项目实际维护者。
   - 仓库所有者为 @3035936740，可作为默认负责人。
   - 保留仍有意义的细分规则，不盲目覆盖整个文件。

2. 检查 SECURITY.md。
   - 不再引导用户把本项目漏洞提交给上游维护者。
   - 不沿用与本项目版本不符的支持政策。
   - 只写入已核实、可用的本项目私密报告渠道。
   - 不编造邮箱。
   - 不宣称 GitHub Private vulnerability reporting 已开启，除非确实能够验证。
   - 如果缺少可用渠道，在交付说明中列为维护者必须完成的设置，不将公开 Issue 推荐为披露漏洞细节的渠道。

3. 检查中英文 README、徽章、文档和工作流中的本项目地址。
   - 将应当指向本项目、却仍指向旧仓库 3035936740/memos 的链接改为正确地址。
   - 检查 Actions、Releases、Issues、Compose 下载及镜像说明。
   - 保留用于来源说明、版权致谢和上游资料引用的 usememos/memos 链接。

4. 禁止全仓库机械替换“memos”。
   以下内容不应为了品牌独立而顺手修改：
   - Go module / import 路径。
   - 数据库表名及迁移历史。
   - API、Proto 包名和协议。
   - 持久化目录及已有配置接口。
   - 上游版权、历史记录和合法来源说明。

────────────────────
四、P2：检查自动化验证与发布风险
────────────────────

完成 P0 和 P1 后再处理这一部分。

1. 查看项目现有贡献文档、依赖清单及工作流，使用项目实际采用的工具和命令。
   不随意升级依赖或替换包管理器。

2. 执行本次改动相关的检查：
   - 文档链接与格式。
   - YAML 和工作流配置。
   - 打包脚本。
   - Docker 构建相关检查。
   - 其他与实际改动直接相关的测试。

3. 如果能够访问 GitHub Actions，核实当前失败任务的日志。
   不把先前聊天里提到的失败状态当作当前事实。
   不在缺少日志的情况下断言失败是解除 fork 导致的。

4. 仅在根因明确、改动范围较小的情况下顺带修复 CI。
   - 不删除测试来制造通过。
   - 不增加 continue-on-error 来掩盖真实问题。
   - 不跳过升级验证来制造通过。
   - 对需要大规模业务改动的问题，单独记录根因、影响与建议，不扩大本次任务。

5. 明确区分：
   - 已运行且通过。
   - 已运行但失败。
   - 因环境、权限、网络或外部服务限制无法运行。

   没有运行过的检查不能写成通过。
   没有完成的迁移测试不能写成“迁移安全”或“全部兼容”。

────────────────────
五、改动边界
────────────────────

本次不做：
- 恢复 fork 关系、删库或迁移仓库。
- 大规模重构、品牌全面重命名或无关依赖升级。
- 修改数据库结构和历史迁移。
- 删除版权声明、致谢或 Git 历史。
- 发布 Release、推送标签或发布容器镜像。
- 未经授权更改 GitHub 仓库设置。
- 直接在生产数据库上测试迁移。
- 覆盖工作区中与本任务无关的已有修改。

改动应聚焦、容易审查、可以回滚。
若发现敏感信息，不要在输出中复述其内容。

如果时间或上下文不足，优先完整交付 P0，其次 P1，最后 P2。
不要为了处理次要 CI 问题，留下不完整的英文 README。

────────────────────
六、最终交付
────────────────────

完成修改后，给出：

1. 改动摘要，首先说明英文 README 的完成情况。
2. 修改文件列表及每个文件的修改目的。
3. 英文 README 的实际路径，以及中英文切换方式。
4. 运行过的检查命令和真实结果。
5. 无法验证或尚未完成的事项。
6. 需要维护者手动完成的 GitHub 设置；没有则写“无”。
7. 建议的分组提交信息，不自动推送或发布。

最终请检查 diff，确认：
- 英文 README 是完整正文，而不是占位文件。
- 没有遗漏重要安装步骤和升级风险。
- 没有虚构兼容性、测试结果或可用下载地址。
- 没有删除上游许可和致谢。
- 没有混入无关重构。packs/preview/<token>/<id>/<version>/assets/<name>`。浏览器无需 Authorization 即可加载这些签名地址；持有地址的人都能在到期前查看，勿公开分享。

令牌使用实例密钥 HMAC-SHA256，绑定 ID、版本和到期时间，无须存库。过期、篡改、版本更换或删除包均返回 404。预览与正常地址遵循相同 SVG/资源安全头，并固定使用 `Cache-Control: private, no-store`。预览不会启用包、更改初访默认或进入匿名列表。停用包的正式 CSS、预览图、其他正式资源地址仍为 404。

`POST /api/v1/style-packs:validate` 接收 `{zip: <base64>}`。内容不合法时 HTTP/RPC 调用本身成功，`errors` 返回至少第一个 `{file, line, message}`，行号从 1 开始；ZIP 结构问题记为 `archive.zip` 第 1 行。鉴权失败仍返回权限错误。合法时 `errors` 为空，`manifest` 是与 `StylePack` 相同结构的摘要，带编译哈希版本和 `compiledSize` 字节数；没有安装，因此摘要的 `cssUrl`、`previewUrl` 为空。验证成功和失败均不会写库。

离线检查：`memos stylepack check file.zip`，不需要配置或启动数据库。通过打印 ID、多语言名字和编译 CSS 大小，退出 0；失败打印文件、行号和原因，退出非 0。

### ZIP 格式与限制

根目录 `style.json`、`style.css`，可选 `assets/`。manifest `version` 仍为 1，未知字段拒绝。ZIP 上限 20 MiB、最多 160 项（含目录），解压总量上限为 16 MiB 字体 + 2 MiB 图片 + 200 KiB CSS + 128 KiB 清单。WOFF2 独立计额：最多 128 个、单个 8 MiB、合计 16 MiB；其余资源最多 20 个、合计 2 MiB。CSS 200 KiB，清单 128 KiB；实际解压字节也会检查，拒绝路径穿越、重复路径和特殊文件。

新增可选清单字段：`description` 格式同 `name`，最多 32 个语言键、每条 500 个 Unicode 字符；`preview` 是 `assets/` 内图片的相对文件名（不带 `assets/`，可含子目录），允许 png/jpg/webp/gif/svg，必须存在，不能是字体；`minVersion` 为完整语义版本，与 `internal/version.PlusVersion` 比较（不是上游 Version），不满足或格式错误时拒绝安装及更新。预发布版本按 SemVer 规则比较，例如 `1.0.0-dev` 低于 `1.0.0`。简介及正式预览图 URL 会出现在启用包的匿名列表中。

安全编译使用 `tdewolff/parse/v2`，检查 CSS 转义后的含义。`:root` 和开头的 `html`（大小写不限）合并到门控，例如 `html[data-theme$="-dark"] .x` → `html[data-style="id"][data-theme$="-dark"] .x`；出现在选择器中间或 `:is()` / `:where()` / `:not()` 内则报错。普通选择器逐项加门控。动画名和字体名加包前缀。

允许 `@media`、`@supports`、`@container`、`@layer`、`@starting-style`、`@keyframes`、`@font-face` 以及 UTF-8 charset。`@property` 只接受以 `--<包 ID>-` 开头的名字，描述符仅 `syntax`、`inherits`、`initial-value`，初始值经过相同资源安全校验。`@font-face` 支持 `unicode-range`、`font-display` 和 `font-weight: 100 900`；src 只能是包内 WOFF2，不能 local() 或外链。

SVG 可用于背景、mask/mask-image（含 WebKit）、mask-border/source、-webkit-mask-box-image、border-image/source、list-style/image、content、cursor 和自定义变量；其他属性仍拒绝。内联 SVG 同时支持 base64 与 URL 编码 `data:image/svg+xml,…`，解码后最多 64 KiB，仍严格拒绝脚本、事件、style 属性、外部引用和 foreignObject。PNG/JPEG/GIF/WebP data URL 仍须 base64，解码后最多 64 KiB并核对类型。

`attr()` 仅允许未转义的 `content: attr(data-sb-…)` 单属性名字符串形式，可以与文字拼接。类型、回退参数、其他属性（包括变量）、其他属性名和转义函数名全部拒绝。仍禁止外网 URL、@import、@namespace、脚本/paint/image-set 等函数、CSS 嵌套及非变量的 !important。

### 数据库和传输

三种数据库新增 `0005__style_pack_chunks.sql`，并同步 `LATEST.sql`。旧资源原地保留；大于 1 MiB 的资源（含原始 ZIP、编译 CSS、字体）保存到 `style_pack_resource_chunk`，每块最多 1 MiB，每次 SQL 单独插入一块，读取有序拼回。大的编译结果不再重复写入旧 `css_compiled` 列，避免元数据 UPDATE 超过 MySQL 旧版默认 4 MiB `max_allowed_packet`；其余存储方式不变。分块和包版本同事务提交，删包同时清理分块，旧版本正式资源继续保留。

Connect 与 REST 网关均使用 `MaxAPIRequestBytes = 256 MiB`；20 MiB ZIP 以 JSON base64 上传约 26.7 MiB，应用中没有更小的请求限制。反向代理如另设上传限制，需要部署者同步调大。这里不新增 Go 依赖。

## 博客导入

以下是经过鉴权的 REST JSON 接口；不使用 Connect 的 base64 上传，避免放大 100 MB 归档的内存。均携带现有 `Authorization: Bearer …`，所有返回为 `no-store`。不同用户无法访问对方预览或任务。

入口位于“设置 → 空间”：空间详情的“常规”后有“导入”标签，仅空间管理员（沿用站点管理员的管理权限）可见，目标固定为当前空间。空间列表右上方的“主站导入”仅站点管理员可见，目标固定为主站。导入已从基础设置导航移除。全站上传上限在主站导入页面由站点管理员配置。

### 1. `POST /api/v1/imports/preview`

空间导入必须加查询参数 `?space=spaces/<UID>`，后端要求该空间管理权限及发文权限；省略时为主站导入，仅站点管理员可用。预览记录会绑定这个目标。

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

`selectedIds` 省略表示全部，空数组表示不选；`visibility` 省略为 PRIVATE，可选 PRIVATE/PUBLIC/PROTECTED/SPACE；SPACE 必须提供 space。`space` 必须与预览绑定的目标一致，不能在确认时换空间或切到主站。开始任务、处理文章及 SQL 写入事务内都会检查管理员权限；Space 导入同时保留既有发文权限检查。草稿和 WordPress private 始终覆盖为 PRIVATE，草稿标志保留。

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
