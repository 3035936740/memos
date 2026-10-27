# 前端接口错误日志

用于排查偶发的 `unsupported content type text/html`、接口 HTTP 错误和网络请求失败。新版前端将错误自动上报给同一实例，新版后端将其写入启动信息 `Data directory:` 所指目录的 `log` 子目录。

## 保存位置和格式

```text
<Data directory>/log/frontend-errors-YYYY-MM-DD.log
<Data directory>/log/frontend-errors-YYYY-MM-DD-轮换时间.log
```

首次成功收到错误报告时创建目录和文件。日期及服务器 `receivedAt` 使用 UTC；客户端另外记录发生时间和浏览器时区，便于区分发生时间与补传时间。

每行是一条独立 JSON 记录。单个文件最多 5 MiB，最多保留最近修改的 10 个诊断日志文件，约 50 MiB；只清理匹配 `frontend-errors-*` 命名规则的文件，不影响其他日志。日志不是公开下载接口，只能在服务器文件系统上读取。

## 每条记录的内容

| 字段 | 内容 |
| --- | --- |
| `receivedAt` | 服务器收到并处理报告的时间 |
| `source` | 固定为 `browser-reported`，表明原始故障信息来自浏览器，不能当作服务器独立验证的事实 |
| `serverVersion` / `serverCommit` | 接收报告的后端版本和提交 |
| `userAgent` / `reportRequestId` | 上报请求的浏览器标识、代理提供的请求 ID（存在时） |
| `report.id` / `sessionId` | 错误事件 ID 和本次页面会话 ID，用于关联同一次访问与补传 |
| `clientTime` / `kind` / `message` | 浏览器发现错误的时间、分类和摘要 |
| `stack` / `cause` | 请求发起处调用栈；网络故障时的浏览器异常名称和信息 |
| `context` | 出错时页面路径、来源路径、页面运行时长、浏览器时区/语言、页面是否可见、在线状态、首次导航类型、前端入口资源路径、样式、配色、视口尺寸和像素比 |
| `request` | 请求 ID、接口路径、HTTP 方法、开始/结束时间、耗时、内容类型、发起时所在页面、是否为认证流程的重试 |
| `response` | HTTP 状态、最终响应域名和路径、返回类型、是否跳转、Server、请求 ID、CF-Ray、缓存命中信息、Cache-Control、Retry-After、Via、CF-Mitigated、Content-Length；仅记录响应实际提供的字段 |
| `trace` | 最近的点击、表单提交、切页、联网/离线、前后台切换、接口开始/结束事件，附各自时间和关联请求 ID。操作与请求各保留最多 12 项，共最多 24 项 |
| `delivery` | 当前上报次数、距错误发生的延迟、上次上报失败原因、最近 8 次上报失败的时间/次数/原因 |

操作轨迹记录控件类型和目标路径，不读取按钮文字、输入值或文章正文。可根据“点击链接 → navigation-loading → GetMemo → HTML 响应”等轨迹排查触发过程，但不会把推断当成已确定的根因。

## 保存和重试过程

1. 浏览器收到异常 HTML、HTTP 错误或网络失败后，立即创建事件 ID 和现场快照。正常完成的请求不单独上报；主动取消的请求不记为故障。
2. 先暂存到当前浏览器的 `localStorage`，每个事件独立保存，避免其他标签页的事件被整批覆盖。最多暂存 20 条、24 小时；超出后清理最旧记录。若浏览器禁止存储，只能在当前标签页内存中暂存，关闭后无法恢复。
3. 使用独立的 `POST /api/v1/diagnostics/frontend-errors` 上报，不经过发生错误的 Connect 调用链，不触发递归上报或刷新登录 Token。上报不携带 Cookie 或 Authorization。
4. 上报失败则记录失败时间、次数和原因，并逐步延长重试间隔至最多 5 分钟；服务器限流时等待至少 60 秒。恢复联网、切换前后台和下次打开网站时也会检查待传记录。
5. 后端校验同源、JSON 结构和大小后，追加写入日志并执行文件同步，再返回 `saved: true` 和事件 ID。浏览器只有核对到该确认后才删除暂存；HTML 错误页、超时、非成功状态或缺少确认都不会被当成保存成功。
6. 后端在当前进程内对最近 256 个事件 ID 去重。跨服务器重启或多实例部署仍可能出现相同 ID 的重复行，排查时按事件 ID 关联即可。

该接口是只写的公开收集入口，可记录登录前、私有实例登录页上的接口故障；不提供读取日志、读取备忘录或修改配置的能力。请求体上限 32 KiB，实例级每分钟约 60 次、允许瞬时 20 次，避免故障循环无限写盘。

## 不保存的内容和限制

- 不上传请求正文、响应 HTML/正文、Cookie、Authorization、密码、输入框内容或备忘录正文。
- 路径去除查询参数和片段，分享链接 Token 脱敏，调用栈中的完整 URL 同样去除查询参数，Bearer Token 脱敏。不要额外把私密信息放到公开 URL 路径中。
- 此记录涵盖 Connect 接口请求层故障，不是所有 JavaScript 业务错误或全部服务器运行日志的收集器。
- 网络或代理同时拦截上报接口时，服务器暂时无法收到记录；浏览器会保留并尝试补传。若一直无法恢复、记录超出保留期限或浏览器存储被清空，无法补传。
- 此功能需要前后端一起部署新版；不会自动修改反向代理配置，也不代表 HTML 响应的根因已经修复。

## 查看示例

Linux：

```sh
tail -n 10 /实际数据目录/log/frontend-errors-YYYY-MM-DD.log
# 若安装了 jq，可逐条格式化查看：
tail -n 1 /实际数据目录/log/frontend-errors-YYYY-MM-DD.log | jq .
```

PowerShell：

```powershell
Get-Content 'D:\实际数据目录\log\frontend-errors-YYYY-MM-DD.log' -Tail 1 |
  ConvertFrom-Json | ConvertTo-Json -Depth 12
```

先按 `clientTime` 找到故障，再对照 `request.path`、`response.status`、`response.contentType`、`response.requestId` / `edgeRequestId` 和 `trace`。如需和代理日志对应，使用这些请求 ID 及时间；`receivedAt` 可能因为补传而晚于实际故障时间。
