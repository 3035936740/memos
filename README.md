# Memos Plus

<img src="./web/public/logo.webp" alt="" width="96" align="right">

**好看、能玩、可以高度自定义的自建博客与碎碎念。** 基于 [Memos](https://github.com/usememos/memos)，保留它快速记录、Markdown、数据归你所有的全部优点，再加上一整套博客外观和小圈子功能。

**[快速开始](#快速开始)** · [功能说明](blog2-styles.md) · [部署示例](deploy/docker-compose.yml) · [English](#english)

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
- **背景音乐**：顶栏播放器，每种风格都有自己的音乐可视化。
- **空间（小圈子）**：每个空间是一个独立的小站，可以设为公开、登录可见或仅邀请；空间多了有搜索和目录。
- **写作更安心**：公开发布前的隐私检查（手机号、身份证号、密钥……），批量整理，Ctrl/⌘ + K 快速查找和跳转。
- **开箱即好看**：第一次登录有安装向导，一分钟选好站点用途和外观；外观可以导出成外观包，和别人分享。

完整的功能和触发方式见 [blog2-styles.md](blog2-styles.md)。

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

> 镜像由本仓库的 GitHub Actions 发布。如果镜像还没有发布，请先用下面「自己构建」的方式。

也可以用 [deploy/docker-compose.yml](deploy/docker-compose.yml)：

```bash
mkdir memos-plus && cd memos-plus
curl -O https://raw.githubusercontent.com/3035936740/memos/main/deploy/docker-compose.yml
docker compose up -d
```

**1Panel、宝塔等面板**：在面板的「容器编排」（或 Docker Compose）里新建一个编排，把上面 `docker-compose.yml` 的内容粘进去即可。

### 自己构建

不想用镜像，或者想先改代码：在 Windows 上运行仓库根目录的 `build-windows.bat`（本机运行）或 `build-linux-amd64.bat`（构建 Linux 服务器用的可执行文件），需要 Node.js 24、pnpm 和 Go 1.26。构建好后：

```bash
./memos-linux-amd64 --port 5230 --data /var/opt/memos
```

**小服务器**：优先选择 SQLite，并把新访客风格设为「默认」以减少浏览器特效开销。1 核 1 GB 的 Linux 容器部署还需要实机验收，当前不把它作为已验证的最低配置承诺。

## 从原版 Memos 迁移

Memos Plus 使用和原版相同的数据目录和数据库，启动时会自动升级数据库结构。

1. **先备份**：停掉原版，把数据目录（Docker 里是挂载到 `/var/opt/memos` 的那个文件夹）整个复制一份。
2. 用 Memos Plus 的镜像或可执行文件，指向同一个数据目录启动。
3. 登录后检查文章、附件和用户都在。

**注意**：升级后的数据库多了 Memos Plus 自己的字段和表，不能直接再拿回原版使用。想退回原版，请用第 1 步备份的数据目录。

## 开发

```bash
go run ./cmd/memos --port 8081   # 后端
cd web && pnpm install && pnpm dev   # 前端，http://localhost:3001
cd web && pnpm lint && pnpm test     # 前端检查
go test ./...                        # 后端测试
```

更多约定见 [AGENTS.md](AGENTS.md)。

## 致谢与许可

Memos Plus 基于 [usememos/memos](https://github.com/usememos/memos) 开发，感谢原作者和所有贡献者。

本项目沿用 [MIT 许可证](LICENSE)。玻璃雨效、Twemoji 等第三方素材的来源和许可见 `web/public/visual-effects-NOTICES.txt`。

---

## English

**Memos Plus** is a self-hosted blog and notes app built on [Memos](https://github.com/usememos/memos). It keeps everything Memos does well (fast Markdown capture, your data on your server) and adds a lot of looks and small-community features:

- A Blog 2 layout with ten styles (glass, neumorphism, Frutiger Aero, Y2K, vaporwave, pixel, hand-drawn, developer and a secret golden one) that restyle the whole app.
- Styles react to color themes with particles, scenes, legendary combinations, a codex and achievements.
- Reader comforts: reading progress, series, old-post notes, resume reading and a sticky sidebar.
- Background music with a visualizer per style.
- Spaces for small communities: public, signed-in only or invite-only, with search when there are many.
- Privacy check before publishing, batch tidying, and Ctrl/⌘ + K quick find.
- A setup wizard on first sign-in, and appearance packs you can export and share.

Quick start:

```bash
docker run -d --name memos-plus --restart unless-stopped \
  -p 5230:5230 -v ~/.memos-plus:/var/opt/memos \
  ghcr.io/3035936740/memos-plus:latest
```

Moving from Memos: back up your data directory first, then start Memos Plus on the same directory. The upgraded database cannot be opened by the original Memos again; keep the backup if you may go back.

Licensed under [MIT](LICENSE), like Memos.

### 演示、备份与升级

[Memos Plus 演示站](https://memos.bing.tomato-universe.tech/)。现有站点不会因为升级而自动开启 demo 模式；隔离演示环境的部署说明见 [deploy/demo.md](deploy/demo.md)。

管理员可在「设置 → 存储」下载全站 Markdown 和附件 ZIP。SQLite 数据库快照默认不包含，勾选后含密码哈希和密钥，请妥善保管。删除默认进入回收站，保留 30 天；历史版本只对文章管理者开放。

Memos Plus 使用独立的 `1.x` 发布版本和迁移台账，保留原版数据库版本的语义。SQLite 升级前自动生成快照，保留最近三份。发版流程已配置为发布本分支 GHCR 镜像与二进制；实际镜像和 Release 是否可用，以仓库 Actions 执行结果为准。
