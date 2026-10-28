# Memos Plus

<img src="./web/public/logo.webp" alt="" width="96" align="right">

**好看、能玩、可以高度自定义的自建博客与碎碎念。** 基于 [Memos](https://github.com/usememos/memos)，保留它快速记录、Markdown、数据归你所有的全部优点，再加上一整套博客外观和小圈子功能。

**[在线演示](https://memos.bing.tomato-universe.tech/)** · [快速开始](#快速开始) · [给文章指定外观](#给文章指定外观) · [从原版迁移](#从原版-memos-迁移) · [部署示例](deploy/docker-compose.yml) · [English](#english)

[![MIT license](https://img.shields.io/github/license/3035936740/memos?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/3035936740/memos?style=flat-square&logo=github&label=Stars)](https://github.com/3035936740/memos)

<!--
  截图放进 docs/screenshots/ 后取消这段注释。建议：
  styles.png  同一篇文章在几种风格下的对比
  reaction.gif 换配色时风格起反应的动图
  community.png 小圈子社区的首页
<img src="docs/screenshots/styles.png" alt="同一篇文章在不同风格下的样子" width="100%">
-->

## 和原版 Memos 有什么不同

原版 Memos 是一个朴素、专注的碎碎念工具。Memos Plus 想让每个站都长得不一样，并且适合几个人、一个小圈子一起用。

- **博客 2 布局和十种风格**：玻璃拟态、新拟物、Frutiger Aero、Y2K、蒸汽波、像素复古、手绘涂鸦、开发者，加上解锁后才出现的金色传说。风格连侧栏、工具栏、编辑器、设置和弹窗一起换。
- **风格 × 配色会起反应**：二十多套配色各带属性（花、海、雨、夜、宇宙……），和风格碰在一起会出现不同的粒子和场景，还有 10 个传说组合、图鉴和成就。
- **为读者着想的阅读体验**：阅读进度、预计阅读时间、系列文章目录、旧文提醒、继续阅读、像 Twitter 一样挂住的右边栏。
- **每篇文章可以有自己的外观**：用 `#style/...` 和 `#theme/...` 标签给单篇文章指定风格和配色，比如让一篇深夜随笔用蒸汽波配霓虹雨，见[给文章指定外观](#给文章指定外观)。
- **主页的“今天”**：连续写作天数、那年今日、新消息一眼看到；每天一个“每日一问”，365 天不重样，每个站点的出题顺序都不同，点一下就带着话题开写。
- **背景音乐**：顶栏播放器，每种风格都有自己的音乐可视化。
- **分享图跟着风格走**：文章的分享图会用当前的风格和配色，底部带上站名和网址，适合发朋友圈、微博和小红书。
- **空间（小圈子）**：每个空间是一个独立的小站，有自己的地址 `/space/<别名>`，可以设为公开、登录可见或仅邀请；空间再多也能搜索、排序和随机逛。
- **写作更安心**：公开发布前的隐私检查（手机号、身份证号、密钥……）、删除后进回收站、每篇文章的私有历史版本、批量整理，以及 Ctrl/⌘ + K 快速查找和跳转。
- **管理更省心**：第一次登录有安装向导；外观可以导出成外观包和别人分享；全站一键备份成 ZIP；可选的 AI 文本和图片审核（默认关闭）。

## 给文章指定外观

在文章里加上下面的标签，读者打开这篇文章时，整页会换成你选的风格和配色；离开这篇文章就恢复读者自己的设置，他们保存的选择不会被改动。

```markdown
#style/vaporwave #theme/neon-rain
```

- 两个标签可以只写一个，比如只写 `#theme/...` 就只换配色。
- 风格只在读者使用「博客 2」布局时生效；配色在任何布局都生效。
- 文章顶部会提示「作者为这篇文章选了外观」，读者可以点「用我自己的外观」，或者自己换一个风格、配色，都会立刻改回读者的选择。
- 标签不区分大小写，写错的名字会被忽略；同一种标签写了好几个时，以第一个为准。
- 金色传说要读者自己解锁，不能用标签指定。
- 管理员装了[社区风格包](#社区风格包)的话，也可以写 `#style/<风格包 ID>`。
- 这两个标签和普通标签一样会显示在文章里，也能用来筛选，比如找出所有蒸汽波风格的文章。

**风格**

| 标签 | 风格 |
| --- | --- |
| `#style/default` | 默认 |
| `#style/glass` | 玻璃拟态 |
| `#style/neumorphism` | 新拟物 |
| `#style/aero` | Frutiger Aero |
| `#style/y2k` | Y2K（Windows 98） |
| `#style/vaporwave` | 蒸汽波 |
| `#style/pixel` | 像素复古 |
| `#style/handdrawn` | 手绘涂鸦 |
| `#style/terminal` | 开发者 |

**配色**（深色配色也可以写完整的名字，比如 `#theme/neon-rain-dark`）

| 标签 | 配色 | 备注 |
| --- | --- | --- |
| `#theme/light` | 亮色 |  |
| `#theme/dark` | 暗色 | 深色 |
| `#theme/paper` | 纸质 |  |
| `#theme/dawn` | 黎明 |  |
| `#theme/ocean-breeze` | 海风 |  |
| `#theme/matcha` | 抹茶 |  |
| `#theme/lavender` | 薰衣草 |  |
| `#theme/sakura-day` | 樱花之日 |  |
| `#theme/desert-sand` | 沙漠之沙 |  |
| `#theme/porcelain` | 瓷器 |  |
| `#theme/retro-newspaper` | 复古报纸 |  |
| `#theme/candy-pop` | 糖果流行 |  |
| `#theme/editorial` | 编辑部 |  |
| `#theme/editorial-dark` | 编辑部·夜 | 深色 |
| `#theme/cosmic` | 宇宙 | 深色 |
| `#theme/twilight` | 暮光 | 深色 |
| `#theme/aurora` | 极光 | 深色 |
| `#theme/abyss` | 深渊 | 深色 |
| `#theme/neon-rain` | 霓虹雨 | 深色 |
| `#theme/moonlit-forest` | 月光森林 | 深色 |
| `#theme/retro-terminal` | 复古终端 | 深色 |
| `#theme/ink-night` | 墨夜 | 深色 |
| `#theme/sakura-night` | 樱花之夜 | 深色 |

## 快速开始

### Docker

```bash
docker run -d \
  --name memos-plus \
  --restart unless-stopped \
  -p 5230:5230 \
  -v ~/.memos-plus:/var/opt/memos \
  ghcr.io/3035936740/memos-plus:latest
```

打开 `http://服务器地址:5230`，第一个注册的账号就是管理员，登录后会出现安装向导。

> 镜像和可执行文件由本仓库的 GitHub Actions 发布。是否已经可用，以 [Actions](https://github.com/3035936740/memos/actions) 和 [Releases](https://github.com/3035936740/memos/releases) 页面为准；还没有的话，请先用下面「自己构建」的方式。

也可以用 [deploy/docker-compose.yml](deploy/docker-compose.yml)：

```bash
mkdir memos-plus && cd memos-plus
curl -O https://raw.githubusercontent.com/3035936740/memos/main/deploy/docker-compose.yml
docker compose up -d
```

**1Panel、宝塔等面板**：在面板的「容器编排」（或 Docker Compose）里新建一个编排，把上面 `docker-compose.yml` 的内容粘进去即可。

### 可执行文件

在 [Releases](https://github.com/3035936740/memos/releases) 下载对应系统的 `memos-plus_<版本>_<系统>_<架构>` 压缩包，解压后运行：

```bash
./memos --port 5230 --data /var/opt/memos
```

### 自己构建

不想用镜像，或者想先改代码：在 Windows 上运行仓库根目录的 `build-windows.bat`（本机运行）或 `build-linux-amd64.bat`（构建 Linux 服务器用的可执行文件），需要 Node.js 24、pnpm 和 Go 1.26。构建好后：

```bash
./memos-linux-amd64 --port 5230 --data /var/opt/memos
```

**小服务器**：优先选择 SQLite，并把新访客风格设为「默认」以减少浏览器特效开销。1 核 1 GB 的 Linux 容器部署还需要实机验收，当前不把它作为已验证的最低配置承诺。

## 从别的博客搬家

在「设置 → 导入」里把旧博客的文章搬过来：

1. 填上旧博客的名字或地址，选择导出文件：
   - WordPress 导出的 `.xml` 文件
   - 装着 `.md` 文件的 `.zip`，比如 Hexo、Hugo、Jekyll 的文章文件夹，开头可以带 YAML 或 TOML 的 front matter
   - Typecho 等程序先用插件导出成 WordPress 格式
2. 预览：逐篇勾选要导入的文章，选择导入后谁能看（默认私有），也可以放进某个空间。
3. 确认后开始导入，可以随时停止；结束后会列出导入、跳过和失败的文章。

文章保留原来的发布时间、草稿状态、标签和分类。ZIP 里的图片会一起上传，外链图片保留原地址，服务器不会去抓取。以后再从同一个旧博客导入时填一样的名字，已经导入过的文章会自动跳过。导入的内容同样要经过屏蔽词和 AI 审核（如果开启了）。

管理员可以在同一页调整上传文件的大小上限，默认 100 MiB。

## 社区风格包

除了内置的风格，管理员可以在「设置 → 风格包」安装别人做好的风格：

- 风格包是一个 ZIP 文件，里面有 `style.json` 和 `style.css`，可以附带图片和字体。格式见[风格包格式说明](docs/style-packs-and-import-api.md#社区风格包)。
- 新装的风格包默认关闭。打开后，所有访客都能在风格选择里看到它，作者也能用 `#style/<风格包 ID>` 给文章指定它。
- 风格包可以借用某个内置风格的配色反应，也可以完全不起反应。
- 为了安全，风格包不能带脚本，也不能从外部网站加载任何东西；安装时服务器会检查，不合规的文件会被拒绝。
- 关闭或删除风格包后，正在用它的访客、新访客默认风格和指定了它的文章都会改回默认风格。

## 备份和数据安全

- **全站备份**：管理员在「设置 → 存储」下载全站 ZIP，里面是可以直接阅读的 Markdown 原文和附件。SQLite 数据库快照默认不包含；勾选后快照里有密码哈希和密钥，请妥善保管。MySQL / PostgreSQL 请另外用数据库自带的工具备份。
- **回收站**：删除的文章先进回收站（用户菜单 → 回收站），默认保留 30 天，可以恢复或彻底删除。
- **历史版本**：修改正文或标题时会保存旧版本（同一个人十分钟内的连续修改算一个），默认每篇保留 20 个，在文章菜单 → 历史版本里比较和恢复。历史只有文章的管理者能看，普通读者看不到。
- 保留天数和版本数都可以在「设置 → 系统」里调整。

## 从原版 Memos 迁移

Memos Plus 使用和原版相同的数据目录和数据库，启动时会自动升级数据库结构。

1. **先备份**：停掉原版，把数据目录（Docker 里是挂载到 `/var/opt/memos` 的那个文件夹）整个复制一份。
2. 用 Memos Plus 的镜像或可执行文件，指向同一个数据目录启动。使用 SQLite 时，升级前还会自动生成一份数据库快照，保留最近三份。
3. 登录后检查文章、附件和用户都在。

**注意**：升级后的数据库多了 Memos Plus 自己的字段和表，不能直接再拿回原版使用。想退回原版，请用第 1 步备份的数据目录。

Memos Plus 有自己的 `1.x` 版本号和独立的迁移记录，同时保留原版的数据库版本，方便以后继续合并原版更新。「关于」页面会同时显示两个版本。

## 搭一个演示站

[在线演示](https://memos.bing.tomato-universe.tech/) 是一个普通站点。想自己搭一个可以随便玩的演示站，用 [deploy/docker-compose.demo.yml](deploy/docker-compose.demo.yml)：它设置了 `MEMOS_DEMO=true`，启动时和之后每 24 小时把数据重置成示例内容。**必须使用单独的数据卷，不要指向正式站的数据。** 详细说明见 [deploy/demo.md](deploy/demo.md)。

普通部署不会开启重置。

## 开发

```bash
go run ./cmd/memos --port 8081       # 后端
cd web && pnpm install && pnpm dev   # 前端，http://localhost:3001
cd web && pnpm lint && pnpm test     # 前端检查
go test ./...                        # 后端测试
```

## 致谢与许可

Memos Plus 基于 [usememos/memos](https://github.com/usememos/memos) 开发，感谢原作者和所有贡献者。

本项目沿用 [MIT 许可证](LICENSE)。玻璃雨效、Twemoji 等第三方素材的来源和许可见 `web/public/visual-effects-NOTICES.txt`。

---

## English

**Memos Plus** is a self-hosted blog and notes app built on [Memos](https://github.com/usememos/memos). It keeps everything Memos does well (fast Markdown capture, your data on your server) and adds a lot of looks and small-community features:

- A Blog 2 layout with ten styles (glass, neumorphism, Frutiger Aero, Y2K, vaporwave, pixel, hand-drawn, developer and a secret golden one) that restyle the whole app.
- Styles react to color themes with particles, scenes, legendary combinations, a codex and achievements.
- Reader comforts: reading progress, series, old-post notes, resume reading and a sticky sidebar.
- Give a single post its own look with `#style/<name>` and `#theme/<name>` tags, for example `#style/vaporwave #theme/neon-rain`. Readers can switch back to their own look at any time. Names are listed in the tables above.
- A “today” card on Home (writing streak, this day in past years, new notifications) and a question of the day: 365 a year, in an order each site shuffles for itself.
- Background music with a visualizer per style.
- Share images that wear the current style and theme, with the site name and address at the bottom.
- Community style packs: admins install them under Settings → Style packs; once switched on, everyone can wear them.
- Move in from WordPress (WXR export) or a ZIP of Markdown files (Hexo, Hugo, Jekyll…) under Settings → Import, with a preview first and original dates kept.
- Spaces for small communities, each at its own `/space/<slug>` address: public, signed-in only or invite-only, with search and sorting when there are many.
- Safer writing: a privacy check before publishing, a trash with a 30-day grace period, private revision history, batch tidying and Ctrl/⌘ + K quick find.
- Easier running: a setup wizard on first sign-in, shareable appearance packs, one-click site backup as a ZIP, and optional AI text and image moderation (off by default).

Try the [live demo](https://memos.bing.tomato-universe.tech/), or start your own:

```bash
docker run -d --name memos-plus --restart unless-stopped \
  -p 5230:5230 -v ~/.memos-plus:/var/opt/memos \
  ghcr.io/3035936740/memos-plus:latest
```

Images and binaries are published by this repository's GitHub Actions; check [Releases](https://github.com/3035936740/memos/releases) for what is available.

Moving from Memos: back up your data directory first, then start Memos Plus on the same directory. The upgraded database cannot be opened by the original Memos again; keep the backup if you may go back. With SQLite, Memos Plus also snapshots the database before each upgrade and keeps the last three.

Licensed under [MIT](LICENSE), like Memos.
