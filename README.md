# Memos Plus

**简体中文** · [English](README.en.md)

<img src="./web/public/logo.webp" alt="" width="96" align="right">

Memos Plus 是基于 [Memos](https://github.com/usememos/memos) 开发的非官方衍生项目，由本项目维护者独立维护，采用独立的版本和发布计划。原项目的版权及 MIT 许可声明予以保留，感谢原作者和贡献者。本项目不是 Memos 官方版本，也不代表获得官方背书。

**好看、能玩、可以高度自定义的自建博客与碎碎念。** 基于 [Memos](https://github.com/usememos/memos)，保留它快速记录、Markdown、数据归你所有的全部优点，再加上一整套博客外观和小圈子功能。

**[在线演示](https://memos.bing.tomato-universe.tech/)** · [快速开始](#快速开始) · [给文章指定外观](#给文章指定外观) · [从原版迁移](#从原版-memos-迁移) · [部署示例](deploy/docker-compose.yml) · [English](README.en.md)

[![MIT license](https://img.shields.io/github/license/3035936740/memos-plus?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/3035936740/memos-plus?style=flat-square&logo=github&label=Stars)](https://github.com/3035936740/memos-plus)

## 和原版 Memos 有什么不同

原版 Memos 是一个朴素、专注的碎碎念工具。Memos Plus 想让每个站都长得不一样，并且适合几个人、一个小圈子一起用。

- **博客 2 布局和十种风格**：默认、玻璃拟态、新拟物、Frutiger Aero、Y2K、蒸汽波、像素复古、手绘涂鸦、开发者，加上解锁后才出现的金色传说。风格连侧栏、工具栏、编辑器、设置和弹窗一起换。
- **风格 × 配色会起反应**：二十多套配色各带属性（花、海、雨、夜、宇宙……），和风格碰在一起会出现不同的粒子和场景，还有 10 个传说组合、图鉴和成就。
- **为读者着想的阅读体验**：阅读进度、预计阅读时间、系列文章目录、旧文提醒、继续阅读、像 Twitter 一样挂住的右边栏。
- **每篇文章可以有自己的外观**：用 `#style/...` 和 `#theme/...` 标签给单篇文章指定风格和配色，比如让一篇深夜随笔用蒸汽波配霓虹雨，见[给文章指定外观](#给文章指定外观)。
- **主页的“今天”**：连续写作天数、那年今日、新消息一眼看到；每天一个“每日一问”，站点种子决定出题顺序，点一下就带着问题和当天标签开写；自定义题库不足 365 题时，每轮打乱并用完全部题目后再重复。
- **背景音乐**：顶栏播放器，管理员可用文件或链接配置歌单，支持音量与播放顺序，每种风格都有自己的音乐可视化。
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

### 选择安装方式

工作流配置的镜像仓库为 `ghcr.io/3035936740/memos-plus`：

| 标签 | 用途 |
| --- | --- |
| `latest`、`1.0` 等主次版本标签、完整版本号 | 成功的正式版本构建；生产环境建议固定实际发布的完整版本。 |
| 完整的 `1.x.y-rc.N` 版本号 | 预发布构建，不更新 `latest`。 |
| `canary` | `main` 分支通过检查后的构建，可能含尚未发布的改动。 |

**有工作流不等于已有可用镜像。** 请先核实本仓库的 [Actions](https://github.com/3035936740/memos-plus/actions) 和 [Releases](https://github.com/3035936740/memos-plus/releases)。历史 Release 可能只有直接下载的 Linux／Windows 可执行文件，不一定存在当前工作流生成的压缩包。镜像不可用时使用下方“自己构建”，不要误用原版 Memos 镜像替代 Plus。

### Docker

确认镜像可用后：

```bash
docker run -d \
  --name memos-plus \
  --restart unless-stopped \
  -p 5230:5230 \
  -v "$HOME/.memos-plus:/var/opt/memos" \
  ghcr.io/3035936740/memos-plus:latest
```

打开 `http://localhost:5230`，远程访问使用 `http://服务器地址:5230`。全新实例第一个注册的账号是管理员，登录后完成安装向导。公网部署请配置 HTTPS 反向代理，检查注册和访问权限。

镜像通过 `MEMOS_PORT=5230` 使用 **5230** 端口；原生可执行文件和 `go run` 默认使用 **8081**。下面命令均显式指定端口。数据目录必须挂载持久化，容器本身不能代替备份。

### Docker Compose

推荐入口为 [deploy/docker-compose.yml](deploy/docker-compose.yml)：

```bash
mkdir memos-plus && cd memos-plus
curl -fLO https://raw.githubusercontent.com/3035936740/memos-plus/main/deploy/docker-compose.yml
docker compose up -d
docker compose logs --tail=100 memos-plus
```

示例映射 `5230:5230`，数据挂载为 `./data:/var/opt/memos`。这里的 `./data` 位于下载的 Compose 文件旁边；在源码目录执行 `docker compose -f deploy/docker-compose.yml up -d` 时，对应的是 **`deploy/data`**，不是仓库根目录的 `data`。请连同部署配置一起保管数据目录。

**1Panel、宝塔等面板**：使用容器编排编辑器粘贴此文件，并确认面板如何解析相对挂载路径。自行构建镜像后，也可把 `image` 改成 `memos-plus:local`。另一个 [scripts/compose.yaml](scripts/compose.yaml) 示例也使用 Plus，但保留 `memos` 服务／容器名，挂载 `~/.memos-plus/`。不要在未明确映射已有数据目录时切换示例。

### 可执行文件

到[本项目 Releases](https://github.com/3035936740/memos-plus/releases) 选择实际存在、与系统及架构一致的文件。当前工作流构建 Linux amd64／arm64／armv7、macOS amd64／arm64、Windows amd64；这只是构建矩阵，不代表历史 Release 都有这些产物。

当前工作流生成 `memos-plus_<版本>_<系统>_<架构>.tar.gz`，Windows 使用 `.zip`，ARM v7 架构写为 `armv7`；可执行文件位于压缩包根目录，名称为 `memos` 或 `memos.exe`。历史 Release 的 `memos-linux-amd64`、`memos-windows-x64.exe` 等直接下载文件，可先重命名为 `memos`／`memos.exe` 再使用下方命令。Release 提供 `checksums.txt` 时请核对校验和。

Linux／macOS：

```bash
chmod +x ./memos
./memos --port 5230 --data ./data
```

Windows PowerShell：

```powershell
.\memos.exe --port 5230 --data .\data
```

数据目录不存在时会自动创建。相对路径相对于**启动时的工作目录**，不是可执行文件所在目录。配置系统服务时建议使用绝对路径，由服务管理器负责重启，并在升级时保持同一数据路径。

### 配置和持久化

启动参数也支持 `MEMOS_` 环境变量，连字符改为下划线；显式启动参数优先于对应的环境变量。

| 参数／环境变量 | 说明 |
| --- | --- |
| `--port` / `MEMOS_PORT` | 原生默认 `8081`，镜像默认 `5230`。 |
| `--addr` / `MEMOS_ADDR` | 监听地址；原生使用 `127.0.0.1` 可限制为仅本机访问。 |
| `--data` / `MEMOS_DATA` | 持久化数据目录；镜像挂载 `/var/opt/memos`，原生服务建议显式指定。 |
| `--driver` / `MEMOS_DRIVER` | `sqlite`（默认）、`mysql`、`postgres`；外部数据库需自行部署和备份。 |
| `--dsn` / `MEMOS_DSN` | 数据库连接；SQLite 留空时使用数据目录中的 `memos_prod.db`。容器入口支持 `MEMOS_DSN_FILE` 指向可读的密钥文件，不能与 `MEMOS_DSN` 同时设置。 |
| `--instance-url` / `MEMOS_INSTANCE_URL` | 对外的 HTTP／HTTPS 地址，例如 `https://notes.example.com`；反向代理部署时应正确填写。 |
| `--demo` / `MEMOS_DEMO` | 默认关闭的**破坏性演示重置模式**，只可用于隔离、可丢弃的 SQLite 数据。 |
| `TZ` | 容器时区，默认 `UTC`。 |
| `MEMOS_UID`、`MEMOS_GID` | 容器运行身份，默认均为 `10001`；入口先调整数据卷权限，再降权运行。 |

修改 driver／DSN 不会自动搬迁不同数据库引擎的数据。本地附件、公开静态文件和外部 S3／对象存储都要纳入备份。文件式实例配置和身份提供商见 [Configuration Provisioning](docs/configuration-provisioning.md)；部署密钥需另行保存，不能只依赖应用导出。

**小服务器**：可以从 SQLite 和“默认”新访客风格开始，减少访客端特效开销。1 核 1 GB 部署尚不是已验证的最低配置承诺；浏览器效果也受访客设备性能影响。

## 从别的博客搬家

在「设置 → 空间」打开自己管理的空间，再选择「导入」标签；只有空间管理员可见。实例管理员还可使用空间列表中的「主站导入」。目前没有单独的顶层“导入”设置项。

1. 填写一致的旧博客名字或地址，选择导出文件：
   - WordPress 的 `.xml`（WXR）文件。
   - 装有 `.md` 文件的 `.zip`，例如 Hexo、Hugo、Jekyll 的文章，支持 YAML／TOML front matter。
   - Typecho 等程序先用合适的导出工具转为 WordPress 格式。
2. 预览并勾选文章，核对目标主站／空间和可见性；导入默认私有。
3. 确认导入，可以中途取消；结束后查看导入、跳过和失败记录。

支持的发布时间、草稿状态、标签和分类会保留。Markdown ZIP 内的图片一起上传，外链图片保留原地址，服务器不会抓取。再次导入同一旧博客时填写相同来源标识，已有文章可自动跳过。内容同样经过屏蔽词和已启用的 AI 审核。实例管理员可在导入界面调整文件上限，默认 **100 MiB**。

这是**内容导入工具**，不是完整数据库或备份恢复工具；不能假设博客导出会迁移账号、凭据、评论或所有平台特有功能。

## 社区风格包

管理员在「设置 → 风格包」安装：

- ZIP 内包含 `style.json`、`style.css`，可带图片和字体，见[制作说明](docs/style-pack-authoring.md)、[接口约定](docs/style-packs-and-import-api.md#社区风格包)及[完整示例](example/stylepacks/)。
- 新包默认关闭。启用后访客可选，文章可使用 `#style/<风格包 ID>`。
- 可借用内置配色反应，也可不启用反应。
- 不允许脚本或外部资源加载，服务器会检查归档和 CSS。
- 停用或删除后，正在使用的访客、新访客默认风格及受影响文章回退到默认风格。

用于分享站点外观设置的“外观包”与 CSS 风格包 ZIP 是不同格式，不能混用。

## 备份、升级和恢复

- **全站导出**：实例管理员在「设置 → 存储」下载 ZIP，包含可阅读的 Markdown、元数据及所包含的附件。请检查清单中的附件跳过／失败记录；默认不包含完整的可恢复数据库。
- **SQLite 快照**：可额外勾选数据库快照，里面含密码哈希和密钥，请按机密资料保管。MySQL／PostgreSQL 需单独使用数据库原生工具备份。
- **回收站**：用户菜单 → 回收站，默认保留 30 天，可恢复或彻底删除。
- **历史版本**：正文／标题修改保留私有历史，同一人十分钟内连续修改会合并，默认每篇最多 20 个。授权的文章管理者可在文章菜单中比较和恢复。
- 保留期和版本数在「设置 → 系统 → 进阶设置」调整。

升级前记录当前版本／镜像标签和部署配置，停止写入，备份完整数据目录、实际数据库与外部存储。先在隔离副本上验证，测试实例不能连接生产数据库、附件目录或对象存储写入目标。

Compose 在完成可恢复备份、修改为实际存在的目标标签后执行：

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=100 memos-plus
```

原生部署先停止旧进程，替换程序，再使用同一数据路径和数据库配置启动。启动可能升级数据库；**仅换回旧程序或旧镜像不能撤销数据库升级。**

回滚时停止新实例，恢复升级前一致的数据库、本地目录、部署配置和外部对象，再运行匹配的旧版本。SQLite 建议在进程停止时备份／恢复整个数据目录，不能混入不同状态的 WAL／SHM 文件；MySQL／PostgreSQL 同样需要匹配的数据库恢复。只有 Markdown 的导出不能恢复账号、密钥、设置和数据库结构。

## 从原版 Memos 迁移

本项目保留上游 Go module、数据库驱动、数据目录习惯和协议命名空间，同时新增 Plus 的字段、表与独立迁移记录。

当前源码的上游数据库目标版本为 **`0.34.1`**，见 [internal/version/upstream-version.txt](internal/version/upstream-version.txt)。它不是 Plus 发布版本号，也不代表所有来源版本都已验证兼容。服务器拒绝比目标更新的数据库；早于 `0.22.0` 的旧安装会被要求先经上游 `0.25.x` 升级。其他版本和自定义数据库仍需在可丢弃副本上试迁移。

1. 停止原版并制作完整可恢复备份：数据目录、实际数据库（包括外部数据库）、附件／对象存储和配置。
2. 用选定的 Plus 构建连接**隔离副本**，保持相同数据库驱动与兼容的连接配置。核对日志、账号、文章、权限、空间和附件，并尝试新建／修改。
3. 只有自己的实际来源版本验证成功后，才安排生产切换；切换时保持原版停止，避免并发写入。

已初始化的 SQLite 数据库需要升级时，代码会在数据目录生成升级前快照，保留最新三份 `memos_prod.db.before-*.bak`；快照失败会停止迁移。自动快照只保护数据库，不含外部文件，不能代替自己的备份。MySQL／PostgreSQL 不会自动快照。

**升级后不能把数据库直接交回原版 Memos。** 回退必须使用迁移前备份和匹配的原版程序。Plus 使用独立的 `1.x` 发布版本和迁移记录，同时保留上游 schema 版本，「关于」可显示两者。存在 CI 升级脚本不代表所有迁移已通过，更不能证明自己的数据库可以安全迁移。

## 自己构建

仓库采用 **Go 1.26.2、Node.js 24 或更新版本、pnpm 11.0.1**，CI 使用 Node 24。沿用现有 lockfile，不替换包管理器。

```bash
git clone https://github.com/3035936740/memos-plus.git
cd memos-plus
npm install -g pnpm@11.0.1
pnpm --dir web install --frozen-lockfile
pnpm --dir web release
```

**先构建前端，再构建后端**：Go 嵌入 `server/router/frontend/dist`；Dockerfile 本身不编译前端。

Linux／macOS shell：

```bash
CGO_ENABLED=0 go build -trimpath -o memos ./cmd/memos
./memos --port 5230 --data ./data
```

Windows PowerShell：

```powershell
$env:CGO_ENABLED = "0"
go build -trimpath -o memos.exe ./cmd/memos
.\memos.exe --port 5230 --data .\data
```

在仓库根目录、完成 `pnpm --dir web release` 后构建本地镜像：

```bash
docker build -f scripts/Dockerfile -t memos-plus:local .
docker run -d --name memos-plus --restart unless-stopped \
  -p 5230:5230 -v "$HOME/.memos-plus:/var/opt/memos" memos-plus:local
```

Windows 也提供 `build-windows.bat`（输出 `bin/memos.exe`）和 `build-linux-amd64.bat`（输出 `bin/memos-linux-amd64`）。它们会安装依赖、构建前端并清理明确列出的旧版前端文件，请使用有备份的工作副本；上面的显式命令不执行这些清理。Linux 交叉构建产物先执行 `chmod +x ./memos-linux-amd64`，再运行 `./memos-linux-amd64 --port 5230 --data ./data`。

### 开发和检查

分开两个终端，使用专门的开发数据目录：

```bash
go run ./cmd/memos --addr 127.0.0.1 --port 8081 --data ./dev-data
```

```bash
cd web
pnpm dev
```

前端位于 `http://localhost:3001`，Vite 中配置的 API／文件路径代理到 `http://localhost:8081`，可用 `DEV_PROXY_SERVER` 修改目标。核对服务器首屏品牌或动态 Web App manifest 时，使用后端提供的嵌入式前端。

现有检查入口：

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web release
DRIVER=sqlite go test ./...
```

最后一行是 POSIX shell 写法；PowerShell 先设置 `$env:DRIVER = "sqlite"` 再运行 `go test ./...`。MySQL／PostgreSQL store 检查和 `scripts/release_smoke_test.sh` 需要相应数据库／容器环境。发布 smoke 脚本使用 Docker，默认以 schema 版本文件选择上游来源镜像，可通过 `--previous-image` 指定版本。这些是检查方法，不是已经通过的测试记录。

## 搭一个演示站

[维护者提供的演示地址](https://memos.bing.tomato-universe.tech/) 是普通部署，不承诺持续可用。需要可随意体验的隔离演示站时，使用 [deploy/docker-compose.demo.yml](deploy/docker-compose.demo.yml)：

```bash
docker compose -f deploy/docker-compose.demo.yml up -d
```

示例使用 `canary`，绑定 **`127.0.0.1:5231`**，并挂载单独的命名卷。`MEMOS_DEMO=true` 会在**启动时及之后每 24 小时**重置演示数据，只支持 SQLite。不能使用生产目录或生产 DSN，不要存放私人信息，也不要把普通部署与重置模式混淆。限制和行为见 [deploy/demo.md](deploy/demo.md)。

## 反馈和贡献

修复或改进请提交到[本仓库 Pull requests](https://github.com/3035936740/memos-plus/pulls)，项目协调可通过[维护者主页](https://github.com/3035936740)了解公开联系入口。2026-10-30 核实时本仓库 Issues 尚未开启，不要因此把 Plus 专属问题提交给上游；维护者开启后，可在本项目 Issues 反馈非敏感问题。

请说明 Plus 版本／提交、系统架构、部署方式、数据库驱动、复现步骤和脱敏日志。保持改动集中，保留现有数据／协议兼容性，并运行相关检查。不要公开 API Key、DSN、私人内容或数据库转储。漏洞报告请先阅读 [SECURITY.md](SECURITY.md)，不要在公开 PR／Issue 中披露漏洞细节。

## 致谢与许可

Memos Plus 基于 [usememos/memos](https://github.com/usememos/memos)，感谢原作者和所有贡献者。根目录 [LICENSE](LICENSE) 完整保留 **MIT 许可和 `Copyright (c) 2025 Memos`**，独立维护不免除这些义务。

玻璃雨效、Twemoji、OpenMoji、字体等素材保留各自声明，见 [visual-effects-NOTICES.txt](web/public/visual-effects-NOTICES.txt)、[OpenMoji 许可](web/src/vendor/openmoji/LICENSE.txt)、[Twemoji 来源](web/src/vendor/twemoji/README.md)和[字体许可目录](web/public/fonts/fusion-pixel/LICENSES/)。这不是对全部依赖的完整许可审计。

发行打包脚本会在原有 `memos`／`memos.exe` 旁加入完整 `LICENSE` 和 `visual-effects-NOTICES.txt`。Dockerfile 将它们复制到最终镜像的 `/usr/local/memos/LICENSE` 和 `/usr/local/memos/visual-effects-NOTICES.txt`。历史发行物可能不同，请检查实际下载的文件。
