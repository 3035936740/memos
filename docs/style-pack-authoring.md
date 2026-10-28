# 风格包制作说明

风格包是一个 ZIP，里面是一份 CSS 和它用到的图片、字体。管理员在“设置 → 风格包”里安装，打开后访客就能在风格选择里选它，文章也能用 `#style/<ID>` 指定它。

风格包和内置风格一样，只在 Blog 2 布局下生效。它不能带脚本，也不能往页面里加元素，只能给页面上已有的钩子（`data-*` 属性）和伪元素加样式。接口和服务端行为见 [style-packs-and-import-api.md](style-packs-and-import-api.md)；本文写给做风格包的人。

可以照着改的完整示例在 [example/stylepacks](../example/stylepacks/)：拟物化和梦核两套，附带不需要 Go 环境的检查与打包脚本 `check_pack.py`。

## 文件

```
my-style.zip
├── style.json      必需
├── style.css       必需
└── assets/         可选：图片和字体
```

### style.json

```json
{
  "kind": "memos-plus.style",
  "version": 1,
  "id": "sunset-paper",
  "name": { "en": "Sunset paper", "zh-Hans": "夕阳信纸", "zh-Hant": "夕陽信紙" },
  "author": "someone",
  "homepage": "https://example.com",
  "license": "MIT",
  "reactsLike": "handdrawn",
  "colorScheme": "light"
}
```

| 字段 | 说明 |
| --- | --- |
| `kind`、`version` | 固定为 `memos-plus.style` 和 `1` |
| `id` | 3–32 个字符，只能用小写字母、数字和连字符；不能和内置风格同名，不能以 `memos-` 开头。换版本时必须保持不变 |
| `name` | 各语言的名字，至少一种。访客看到的是自己语言的名字，没有就用英文 |
| `author`、`homepage`、`license` | 可选。主页必须是 http(s) 地址 |
| `reactsLike` | 可选，填一个内置风格的 ID：`default`、`glass`、`neumorphism`、`aero`、`y2k`、`vaporwave`、`pixel`、`handdrawn`、`terminal`、`golden` |
| `colorScheme` | 可选，`light` 或 `dark`；不填就跟随访客的配色 |
| `description` | 可选，多语言简介，和 `name` 一样写；最多 32 种，每条 500 字 |
| `preview` | 可选，`assets/` 里一张图片的相对文件名，如 `preview.webp`；不要带 `assets/` 前缀 |
| `minVersion` | 可选，最低 Memos Plus 版本，如 `1.0.0`；和 Plus 版本比，不是原版 Memos 的版本 |

**`reactsLike` 只借反应。** 风格 × 配色的反应、粒子和音乐节拍，按这个内置风格的规则来。内置风格自带的场景和小彩蛋不会跟过来：蒸汽波的城市、像素复古的 Boss、开发者风格的终端和 Vim 键、Y2K 的鼠标星星、音乐可视化的造型、/void 的销毁效果，这些在风格包下都按默认风格显示。不填 `reactsLike` 就没有反应。

**`colorScheme` 会锁定配色。** 填了 `dark`，风格包显示时页面一定是暗色：访客用的是暗色配色就照旧；用的是亮色配色，就暂时换成它对应的暗色（比如 `editorial` 换成 `editorial-dark`，没有对应的就用 `default-dark`）。`light` 同理。访客自己的选择不会被改掉，换回别的风格就恢复。风格选择里会在包名后标“仅暗色”或“仅亮色”。只做了一种配色的包才需要填；两种都做了就不填。

### style.css

普通 CSS，不超过 200 KB。安装时服务器会检查并改写它，规则见下面的“限制”。

## 写法

### 作用范围

服务器会给每个选择器加上 `html[data-style="<你的 ID>"]` 前缀，所以你的 CSS 只在这个风格显示时生效：

| 你写的 | 实际生效的 |
| --- | --- |
| `:root { --card: #fff; }` | `html[data-style="sunset-paper"] { --card: #fff; }` |
| `:root[data-theme$="-dark"] { … }` | `html[data-style="sunset-paper"][data-theme$="-dark"] { … }` |
| `body { … }` | `html[data-style="sunset-paper"] body { … }` |
| `[data-sb-card] { … }` | `html[data-style="sunset-paper"] [data-sb-card] { … }` |

- 改根元素用 `:root` 或开头的 `html` 都行，服务器会把条件合并到同一个根选择器上。它们只能放在开头，不能写在中间，也不能放进 `:is()`、`:not()` 等函数里。
- 暗色配色的名字都以 `-dark` 结尾，所以 `:root[data-theme$="-dark"]` 就是“所有暗色配色”。
- 包的 CSS 在应用自己的样式之后加载，前缀又让每条规则多一层优先级，所以照着下面的钩子写，一般都能盖过应用的共享样式。

### 页面背景

风格包显示时，`<html>` 上会多一个 `data-style-pack` 属性，页面外层的容器会变成透明，露出 `body`。所以整页背景直接画在 `body` 上：

```css
body {
  background:
    radial-gradient(60% 40% at 10% 0%, #ffd9b0 0%, transparent 70%),
    var(--background);
  background-attachment: fixed;
}
```

不画也没关系，`body` 默认就是 `--background` 的颜色。设置、回收站这类非信息流页面会自动放在一张用 `--sb-surface` 等变量画的卡片上，文字不会直接浮在背景上。

### 改变量就够大半

应用的共享样式都读下面这些变量，改它们就能换掉大部分外观。

**配色**（和配色主题是同一套）：`--background`、`--foreground`、`--card`、`--card-foreground`、`--popover`、`--popover-foreground`、`--primary`、`--primary-foreground`、`--secondary`、`--secondary-foreground`、`--muted`、`--muted-foreground`、`--accent`、`--accent-foreground`、`--destructive`、`--destructive-foreground`、`--success`、`--warning`、`--border`、`--input`、`--ring`、`--sidebar`、`--sidebar-foreground`、`--sidebar-accent`、`--sidebar-accent-foreground`，以及 `--radius`、`--font-sans`、`--font-serif`、`--font-mono`。

**风格变量**：

| 变量 | 用在哪 |
| --- | --- |
| `--sb-surface`、`--sb-border`、`--sb-radius`、`--sb-shadow`、`--sb-blur` | 文章卡片、侧栏小组件、编辑器、导航链接、文章详情、非信息流页面的卡片、分享图里的卡片 |
| `--sb-shadow-hover`、`--sb-lift` | 鼠标移到文章卡片上时的阴影和位移（如 `translateY(-2px)`） |
| `--sb-pill-radius` | 导航链接、标签云 |
| `--sb-cover-radius` | 文章卡片的封面图 |
| `--sb-control-radius`、`--sb-control-shadow` | 翻页按钮和页码输入框 |
| `--sb-font-display` | 文章标题、站点标题、小组件标题 |
| `--sb-font-body` | 整页正文、分享图 |
| `--sb-field-border`、`--sb-field-radius`、`--sb-field-fill`、`--sb-field-shadow` | 设置页和弹窗里的输入框、下拉框 |
| `--sb-button-shadow` | 普通按钮（不含图标按钮） |
| `--sb-share-backdrop` | 分享图卡片后面的背景 |
| `--sb-beat`（只读） | 音乐节拍，0–1，写在站点标题上；`reactsLike` 为 `golden` 时才有 |

### 钩子

需要更细地改时，用这些属性选元素。

**应用框架**

| 钩子 | 是什么 |
| --- | --- |
| `[data-app-sidebar-frame]`、`[data-app-sidebar]` | 左侧栏的外框和内容 |
| `[data-blog-nav]` | 左侧栏的导航；当前页是 `a[aria-current="page"]` |
| `[data-app-toolbar]`、`[data-toolbar-clock]` | 顶栏和顶栏的时钟 |
| `[data-page-panel]` | 非信息流页面的内容卡片 |
| `[data-settings-section]`、`[data-settings-surface]` | 设置页的分组和面板 |
| `[data-ui-button]`（配合 `[data-variant]`） | 按钮 |

**Blog 2 信息流**（都在 `[data-styled-blog]` 里面）

| 钩子 | 是什么 |
| --- | --- |
| `[data-sb-hero]`、`[data-sb-hero-title]`、`[data-sb-hero-desc]` | 信息流顶部的站点标题和简介 |
| `[data-sb-card]` | 一篇文章的卡片。置顶时带 `[data-sb-pinned]`，属性值是“必读”之类的批注文字 |
| `[data-sb-meta]`、`[data-sb-chip]` | 卡片顶部的作者和时间，以及置顶、草稿等状态标签 |
| `[data-sb-title]`、`[data-sb-excerpt]`、`[data-sb-cover]` | 标题、摘要、封面图 |
| `[data-sb-footer]`、`[data-sb-tag]`、`[data-sb-stats]`、`[data-sb-reading-time]` | 卡片底部：标签、统计、阅读时长 |
| `[data-sb-sidebar]`、`[data-sb-widget]`、`[data-sb-widget-title]`、`[data-sb-item]` | 右侧栏、其中的小组件、组件标题、列表项 |
| `[data-sb-cloud-tag]` | 标签云里的标签；选中时 `[aria-pressed="true"]` |
| `[data-sb-subcard]`、`[data-sb-subitem]` | 文章里嵌套的块（投票、链接预览、代码、表格），以及其中的行 |
| `[data-memo-pagination]` | 翻页；当前页是 `button[aria-current="page"]` |
| `[data-memo-editor]`、`[data-blog-composer]` | 编辑器 |
| `[data-memo-detail]` | 文章详情页；正文是其中的 `[data-memo-view]`，评论区是 `[data-memo-comment-section]` |
| `[data-memo-content]` | 文章正文的 Markdown |

**主页和批量选择**

| 钩子 | 是什么 |
| --- | --- |
| `[data-home-today]`、`[data-daily-question]` | 主页的今日卡片和每日一问（也带 `[data-sb-subcard]`） |
| `[data-memo-selectable]` | 批量选择时包着每篇文章的外层；选中时带 `[data-selected]` |
| `[data-memo-pick-rail]`、`[data-memo-pick-mark]`、`[data-memo-pick-check]` | 左侧的选择轨道、圆形标记和其中的对勾 |
| `[data-memo-selection-wash]` | 选中文章上的一层底色 |
| `[data-memo-batch-bar]` | 批量操作工具栏 |

批量选择的默认样式写在 `web/src/themes/memo-pick.css`。改选中状态时要写完整的选择器，比如 `[data-memo-selectable][data-selected] [data-memo-pick-mark]`。

**分享图**：`[data-share-image]` 是整张图，`[data-share-card]` 是其中的卡片。

### 根元素上的状态

都在 `<html>` 上，用 `:root[…]` 选：

| 属性 | 值 |
| --- | --- |
| `data-theme` | 当前配色，比如 `paper`、`default-dark` |
| `data-effects` | 访客开了低功耗特效时是 `lite`，这时请关掉动画和模糊 |
| `data-daypart` | `midnight`、`dawn`、`day`、`dusk`、`night` |
| `data-festival` | `spring`、`halloween`、`winter`，节日期间才有 |
| `data-fusion`、`data-elements`、`data-legend` | 风格 × 配色反应的结果。没填 `reactsLike` 时 `data-fusion` 是 `pure`，后两个不出现 |
| `data-particles` | 有粒子在页面后面飘时是 `1` |

也请照顾 `@media (prefers-reduced-motion: reduce)`。

## 限制

以服务器代码 `internal/stylepack` 为准，摘要如下。

- **大小**：ZIP 不超过 20 MiB，里面最多 160 项（目录也算）；CSS 不超过 200 KiB，清单不超过 128 KiB。图片最多 20 个、合计 2 MiB。字体单独算，WOFF2 最多 128 个、单个 8 MiB、合计 16 MiB，方便把中文字体按 `unicode-range` 切成小块。
- **资源类型**：只能是 png、jpg、webp、gif、svg、woff2，服务器会核对文件的真实内容。`preview` 只能指向包里已有的图片，不能用字体。
- **SVG**：只能用 `svg`、`g`、`path`、`circle`、`ellipse`、`rect`、`line`、`polyline`、`polygon`、`defs`、`symbol`、`use`、渐变、`clipPath`、`mask`、`filter` 和常用滤镜。不能带 `style` 属性和 `on…` 事件，不能引用外部地址。可以放在背景、遮罩（包括 WebKit）、边框图片、列表图片、`content`、`cursor` 和 `--变量` 里。
- **地址**：`url()` 只能用 `asset:文件名` 或内联图片。PNG、JPEG、GIF、WebP 要用 base64；SVG 支持 base64 和 URL 编码的 `data:image/svg+xml,…`。内联图片解码后最多 64 KiB，SVG 也照上面的规则检查。不能连外部网站。
- **字体**：`@font-face` 的 `src` 只能用包里的 WOFF2，不能外链或 `local()`；名字里有空格要加引号。支持 `unicode-range`、`font-display: swap` 和 `font-weight: 100 900` 这样的区间。字体名和 `@keyframes` 名会自动加包前缀，你照常引用即可。
- **@ 规则**：可以用 `@media`、`@supports`、`@container`、`@layer`、`@starting-style`、`@keyframes`、`@font-face`、`@charset "utf-8"`。`@starting-style` 里面也会加作用域。`@property` 的名字必须以 `--你的包ID-` 开头，如 `--sunset-paper-glow`；只写 `syntax`、`inherits`、`initial-value`，初始值不能绕过资源检查。
- **动态文字**：只放行 `content: attr(data-sb-pinned)` 这样的写法，可以和文字拼接。只接收一个 `data-sb-…` 属性名，不能加类型、回退值，也不能用在别的属性或变量里；转义函数名也不支持。
- **作用域**：`:root` / `html` 只能写在选择器开头，不能放在选择器中间或函数里；这样才不会悄悄失效，也不会改到别的风格。
- **版本**：`minVersion` 要写完整语义版本，版本不够就装不上。`1.0.0-dev` 比 `1.0.0` 低，不要只按前面的数字判断。
- **仍不支持**：CSS 嵌套（`&`）；`image-set()`、`paint()`、`element()`、`expression()`；`behavior`、`-moz-binding`。`!important` 仍只能用在 `--变量` 上。未知清单字段也会拒绝，方便抓拼写错误。

规则不通过就装不上，错误里会写文件和行号。可以先在本地跑 `memos stylepack check file.zip`，不用启动服务或配置数据库。管理员接口也有“只检查”，不会安装；装好的包在“设置 → 风格包”里点“预览”，就能在自己的标签页里先看效果，停用的包也行，其他访客看不到；预览一小时后自动结束，底部的提示条可以随时结束或直接为所有访客打开。

服务器会把大字体和 ZIP 按 1 MiB 分块存库，照顾旧版 MySQL 的 4 MiB 报文限制。JSON 上传 20 MiB ZIP 后大约 26.7 MiB，应用上限够用；部署时如果代理另外限了大小，也要一起调大。
