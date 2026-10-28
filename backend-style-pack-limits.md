# 后端需求：放宽风格包限制

社区风格包已经上线（`internal/stylepack`、`server/router/api/v1/style_pack.go`、`store/style_pack.go`，说明见 `docs/style-packs-and-import-api.md`）。实际做包时发现下面 8 处限制太紧，或者容易踩坑。本文只要求后端：Go、proto（`buf generate`，生成的 Go/TS/OpenAPI 一并提交）、三种数据库的迁移和 `LATEST.sql`（如有）、测试、文档。

前端由 Claude 在接口合入后完成，本文不要求：预览按钮、显示简介和预览图、“只检查”按钮。

做完后请同步更新两份文档：`docs/style-packs-and-import-api.md`（接口），以及 `docs/style-pack-authoring.md` 末尾的“限制”一节（给做包的人看，写法保持现在的风格）。

安全底线不变：风格包不能执行脚本，不能让访客的浏览器连外部网站，不能影响别的风格和应用本身。下面每一条放宽都要在这个前提下做，并且每条都要有“应拒绝”的测试。

---

## 1. 停用的包可以预览

**现状**：`StylePackResource(..., admin=false)` 只返回已启用包的 CSS 和资源。浏览器用 `<link>` 加载 CSS 时不带 `Authorization`，所以管理员也读不到停用包。新装的包默认停用，想看效果只能先启用，所有访客会同时看到。

**需求**：

- 新增 `InstanceService.PreviewStylePack({id}) → {cssUrl, expiresAt}`，仅管理员可用，启用和停用的包都能调用。
- `cssUrl` 是一个带预览令牌的地址，例如 `/style-packs/preview/<token>/<id>/<version>.css`。
  - 令牌用实例的密钥做 HMAC，绑定包 ID、版本号和过期时间（1 小时），不需要存库。
  - 令牌过期、签名不对、包已删除或版本已更换，都返回 404。
- 预览 CSS 里引用的资源，在包停用时也必须能加载。可以给预览版本换资源前缀，例如 `/style-packs/preview/<token>/<id>/<version>/assets/<name>`。`Compile` 现在把资源前缀写死成 `"/style-packs/" + id + "/" + version + "/assets/"`，可以改成能传入前缀，也可以在输出时替换前缀，二选一。
- 预览响应带 `Cache-Control: private, no-store`。其余安全头和正式资源一样：`nosniff`、CSP `sandbox`、`Cross-Origin-Resource-Policy: same-origin`，SVG 带 `Content-Disposition`。
- 预览不改变 `enabled`，不影响 `firstVisitDefaultStyle`，不出现在匿名列表里。

**测试**：

- 非管理员调用被拒绝。
- 停用包可以拿到预览地址，CSS 和资源都能读到。
- 过期、改过的令牌，以及换版本后的旧令牌，都返回 404。
- 正式地址仍然读不到停用包。

## 2. 字体额度

**现状**：所有资源合计 2 MB、最多 20 个，ZIP 3 MB，压缩包内最多 64 项。一个中文字体子集就要好几 MB，所以中文字体基本装不进来。

**需求**：

- 字体单独计额，其他资源保持原样（最多 20 个、合计 2 MB）：
  - WOFF2 合计不超过 16 MB，单个不超过 8 MB，最多 128 个文件，方便按 `unicode-range` 切片；
  - ZIP 上限提高到 20 MB，`safearchive` 的项数和解压总量跟着调整。
- 确认 `@font-face` 里的 `unicode-range`、`font-display`、`font-weight` 区间（如 `100 900`）都能通过编译，并补测试。
- 资源存在数据库里时，注意 MySQL 旧版的 `max_allowed_packet` 默认只有 4 MB。请按现有存储方式判断：要么单文件上限照顾到这一点，要么分块存储；在文档里写明。
- Connect 的请求上限是 `MaxAPIRequestBytes`（256 MB），20 MB 的 ZIP 没问题。前端走 JSON 时会 base64，大约 27 MB，也请确认没有其他中间层拦截。

**测试**：

- 一个 6 MB 的 WOFF2 能装上。
- 字体合计超过上限被拒绝。
- 非字体资源仍然受 2 MB 限制。

## 3. SVG 能用在更多地方

**现状**：SVG 资源只能写在 `background` 和 `background-image` 里，不能放进 `--变量`，也不能写成 `data:` 内联。可内置风格大量用 `mask` 让图标跟着主题色变（手绘风格的笔触、Aero 的气泡都放在变量里），这些在风格包里都做不出来。

**需求**：

- SVG 资源（`url(asset:x.svg)`）额外允许用在这些属性上：
  - 遮罩：`mask`、`mask-image`、`-webkit-mask`、`-webkit-mask-image`、`mask-border`、`mask-border-source`、`-webkit-mask-box-image`；
  - 边框图片：`border-image`、`border-image-source`；
  - 列表：`list-style`、`list-style-image`；
  - 其他：`content`、`cursor`；
  - 以及任意 `--变量`。
- 允许内联 SVG：`data:image/svg+xml;base64,…` 和 URL 编码的 `data:image/svg+xml,…` 两种写法都要支持。解码后必须经过现有的 `validateSVG`，解码后不超过 64 KB。
- 理由：CSS 引用的 SVG 是按图片渲染的，不执行脚本，也不加载外部资源；直接打开资源地址的风险已经由现有的 CSP 和 `sandbox` 头挡住。白名单、事件属性和外部引用的检查一条都不放松。

**测试**：

- 应通过：`mask-image: url(asset:icon.svg)`、`--icon: url(asset:icon.svg)`。
- 应通过：一个合法的 URL 编码 `data:` SVG。
- 应拒绝的 `data:` SVG：带 `<script>`、带 `onload`、带外部 `href`、超过 64 KB 的。

## 4. 在 `content` 里放行 `attr()`

**现状**：`attr()` 全部被禁。可内置风格靠它显示动态文字，比如 Y2K 窗口标题栏里的文章名（`attr(data-sb-window-title)`）、手绘风格的置顶批注（`attr(data-sb-pinned)`），风格包做不出来。

**需求**：

- 只在 `content` 属性里允许 `attr()`，并且只能有一个参数，参数是以 `data-sb-` 开头的属性名。
- 带类型或回退值的写法一律拒绝，例如 `attr(data-sb-x url)`、`attr(data-sb-x type(<url>), …)`。新版 CSS 的 `attr()` 能把属性值变成 URL，必须挡住。
- 其他属性里仍然禁止，包括 `--变量`，因为变量能被别的属性引用。
- 转义写法（如 `\61ttr(`）照现有的 `cssText` 解码后再判断。

**测试**：

- 应通过：`content: attr(data-sb-pinned)`、`content: "【" attr(data-sb-window-title) "】"`。
- 应拒绝：`attr(href)`、`background: attr(data-sb-x)`、`--x: attr(data-sb-x)`、`content: attr(data-sb-x url)`、转义过的 `attr(`。

## 5. 以 `html` 开头的选择器不能再悄悄失效

**现状**：作者写 `html[data-theme$="-dark"] .x`，加上前缀后变成 `html[data-style="id"] html[data-theme$="-dark"] .x`，永远匹配不到，安装时也不报错。

**需求**：

- 选择器开头的 `html`，包括 `html[…]`、`html.x`、`html:not(…)`，大小写不限，改写方式和 `:root` 相同：`html[data-theme$="-dark"] .x` 改成 `html[data-style="id"][data-theme$="-dark"] .x`。
- `html` 或 `:root` 出现在选择器中间（如 `.a html`、`.a :root`）时直接报错，错误信息带行号，并提示“`:root` / `html` 只能写在选择器开头”。
- `:is()`、`:where()`、`:not()` 等函数里出现 `html` 或 `:root` 时，同样报错。

**测试**：

- `html[data-theme$="-dark"] .x` 被改写成上面的样子。
- `HTML.x` 同样被改写。
- `.a html`、`.a :root`、`:is(html) .x` 都被拒绝。
- 现有的 `:root` 测试仍然通过。

## 6. 清单增加简介、预览图和最低版本

**现状**：`style.json` 用 `DisallowUnknownFields` 解析，作者没法多写任何字段。设置页和风格选择里也就只能显示一个名字。

**需求**（都是可选字段，`version` 仍然是 1）：

- `description`：多语言简介，格式和 `name` 一样。最多 32 种语言，每条不超过 500 个字符。
- `preview`：`assets/` 里一张图片的文件名，允许 png、jpg、webp、gif、svg，用来在列表里展示。
- `minVersion`：最低兼容的 Memos Plus 版本，如 `"1.0.0"`。安装和更新时和 `internal/version` 的 `PlusVersion` 比较（不是上游的 `Version`），不满足就拒绝，并提示需要的版本。
- 其他未知字段仍然拒绝，这样能抓到拼写错误。
- `StylePack` 消息增加 `description`（`map<string, string>`）、`preview_url`（指向资源地址，读取规则和其他资源一样）、`min_version`。匿名列表也返回 `description` 和 `preview_url`。

**测试**：

- 三个字段都能正确解析和返回。
- `preview` 指向不存在的文件、指向字体，都被拒绝。
- `minVersion` 高于当前版本被拒绝，格式不对也被拒绝。

## 7. 只检查、不安装

**现状**：规则只在安装时检查，作者只能反复上传试错。

**需求**：

- 新增 `InstanceService.ValidateStylePack({zip}) → {manifest 摘要, errors: [{file, line, message}]}`，仅管理员可用，不写数据库。至少返回第一个错误所在的文件和行号；能一次收集多个错误更好。
- 命令行：在 `cmd/memos` 下加 `memos stylepack check <file.zip>`，复用 `stylepack.Parse`，离线运行，不需要数据库。通过时退出码为 0，并打印 ID、名字和编译后的大小；不通过时退出码非 0，并打印错误。

**测试**：

- 合法的包返回没有错误。
- 不合法的包返回带行号的错误。
- 两种情况都没有写入数据库。

## 8. 放行 `@property` 和 `@starting-style`

**需求**：

- `@starting-style`：和 `@media` 一样处理，里面的规则照常加上作用域前缀。
- `@property --名字 { syntax; inherits; initial-value }`：
  - 名字必须以 `--<包 ID>-` 开头。`@property` 是全局注册的，不加前缀会改掉应用自己的同名变量（如 `--sb-radius`）的解析方式。
  - `initial-value` 照常经过 `safeValues` 检查。

**测试**：

- `@starting-style` 里的规则被加上前缀。
- `@property --sunset-paper-glow { … }` 能通过。
- `@property --sb-radius { … }`，以及 `initial-value` 里带外部 `url()`，都被拒绝。
