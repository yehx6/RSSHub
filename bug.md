# RSSHub 本地部署与路由排障记录（2026-02-19）

本文记录本次在本地 Docker 部署 RSSHub 与修复订阅路由时遇到的问题、根因、修复方式和验证方法，供后续复用。

## 1. 改了本地代码但容器仍是旧版本

- 现象：
  - 改完 `lib/routes/...` 后，访问订阅结果看起来没变化。
- 根因：
  - 仅执行 `docker compose up -d` 可能不会触发 `rsshub` 重建，容器仍复用旧镜像。
- 修复：
  - 明确执行重建 + 强制重建容器（仅针对 `rsshub`）：

```bash
docker compose build rsshub
docker compose up -d --no-deps --force-recreate rsshub
```

- 验证（检查运行容器绑定的镜像）：

```bash
docker compose images rsshub
docker inspect rsshub-rsshub-1 --format "container_created={{.Created}} image_id={{.Image}} image_ref={{.Config.Image}}"
```

---

## 2. Docker 本地构建失败（代理 / BuildKit 鉴权）

- 现象：
  - `docker compose build rsshub` 失败，错误与 `127.0.0.1:7897` 代理或 BuildKit 拉取鉴权有关。
- 根因：
  - 当前主机代理设置影响 Docker 构建链路，BuildKit 路径失败。
- 修复：
  - 关闭 BuildKit，并临时清理代理环境变量后重建：

```powershell
$env:DOCKER_BUILDKIT='0'
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
docker compose build rsshub
```

---

## 3. 本地构建镜像体积异常偏大

- 现象：
  - 本地 `rsshub` 镜像明显大于预期（曾出现 10GB 级别）。
- 根因：
  - 构建上下文携带了不必要的大目录（如 `logs`），导致镜像层膨胀。
- 修复：
  - 在 `.dockerignore` 至少排除 `logs`，必要时继续排除本地临时目录。
- 结论：
  - 加入 `logs` 不会导致容器运行时报错；它只影响构建上下文，不影响容器内运行时逻辑。

---

## 4. Conda 运行 Python 不稳定（Windows 编码/插件问题）

- 现象：
  - `conda run -n task_with_rss python ...` 在本机出现异常（如 `NoWritableEnvsDirError`、编码相关异常）。
- 根因：
  - 当前机器 Conda 全局配置/插件与编码环境存在兼容问题。
- 修复：
  - 使用更稳定的解释器直连方式：

```powershell
D:\conda_python_env\task_with_rss\python.exe <script_or_args>
```

- 备选：

```powershell
conda run -p D:\conda_python_env\task_with_rss python <script_or_args>
```

---

## 5. 路由报错批量修复（来自 `feeds.xlsx`）

- 数据来源：
  - `feeds.xlsx`（工作表：`订阅源`），`状态=✗ 有错误` 且 URL 指向本地 RSSHub。
- 本次修复并通过的 12 条路由：
  - `/bilibili/ranking/0/3/1`
  - `/csdn/blog`
  - `/github/trending/daily`
  - `/github/trending/daily/javascript`
  - `/github/trending/weekly`
  - `/toutiao/hot`
  - `/baidu/hot`
  - `/weibo/search/hot`
  - `/douyin/hot`
  - `/smzdm/ranking/pinlei/11`
  - `/smzdm/keyword/显卡`
  - `/smzdm/ranking/pinlei/12`

### 5.1 Bilibili ranking 返回 `-352`

- 修复文件：`lib/routes/bilibili/ranking.ts`
- 处理：
  - 增加 WBI + DM 参数签名；
  - 携带 cookie 请求。

### 5.2 CSDN `/csdn/blog` 失败

- 修复文件：`lib/routes/csdn/blog.ts`
- 处理：
  - 路径改为 `'/blog/:user?'`，默认用户 `csdnnews`；
  - 优先走 RSS；失败时回退到主页抓取文章链接并提取详情。

### 5.3 GitHub trending 依赖 token 导致不可用

- 修复文件：`lib/routes/github/trending.tsx`
- 处理：
  - 路径兼容改为 `'/trending/:since/:language?/:spoken_language?'`；
  - 去除强制 `GITHUB_ACCESS_TOKEN`；
  - 直接解析 trending 页面输出 RSS。

### 5.4 Toutiao / Douyin / Baidu 热榜缺失或不稳定

- 新增文件：
  - `lib/routes/toutiao/hot.ts`
  - `lib/routes/douyin/hot.ts`
  - `lib/routes/baidu/hot.tsx`
- 处理：
  - 增加可用热榜路由并按 RSSHub 规范输出字段。

### 5.5 SMZDM 反爬导致 keyword/ranking 失败

- 修复文件：
  - `lib/routes/smzdm/utils.ts`
  - `lib/routes/smzdm/keyword.ts`
  - `lib/routes/smzdm/ranking.ts`
- 处理：
  - 支持自动获取 cookie（未配置 `SMZDM_COOKIE` 时）；
  - ranking 在接口异常时回退 keyword 搜索解析；
  - 保持旧路径兼容（`hour` 改为可选，默认 `3`）。

---

## 6. 测试模式与命令（建议固化）

### 6.1 Docker 黑盒测试（部署验证）

```bash
curl.exe -sS -D - http://127.0.0.1:1200/<namespace>/<route>
```

判定标准：
- HTTP `200`
- `content-type` 含 `application/xml`
- 响应体包含 `<rss`

### 6.2 本地白盒测试（不依赖容器网络）

```bash
node --import tsx --input-type=module -e "const { default: app } = await import('./lib/app.ts'); const res = await app.request('/<namespace>/<route>'); const text = await res.text(); console.log('status=' + res.status); console.log('content-type=' + (res.headers.get('content-type') ?? '')); console.log('has-rss=' + String(text.includes('<rss')));"
```

---

## 7. 本次结果

- 本地 `rsshub` 容器已使用本地新镜像（非旧官方镜像）。
- `feeds.xlsx` 中本次定位到的 12 条本地报错路由，复测结果为 `12/12` 通过。
- 建议后续每次改路由后固定执行：
  1. `docker compose build rsshub`
  2. `docker compose up -d --no-deps --force-recreate rsshub`
  3. 黑盒批量复测目标订阅 URL

