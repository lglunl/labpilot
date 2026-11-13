# 待办

## 公网访问：quick tunnel → 固定网址

当前预约服务器用 Cloudflare quick tunnel（`cloudflared tunnel --url ...`）对外暴露，
生成的是每次重启都会变的 `*.trycloudflare.com` 临时网址。

要改成固定网址（重启不变），方案如下，待择机实施：

- 方案 A（推荐）：Cloudflare 命名隧道（named tunnel）
  - 需登录 Cloudflare 账号并准备一个自有域名。
  - `cloudflared tunnel create <name>` 生成固定 `*.cftunnel` 或绑定自有域名；
  - 设备电脑端 `booking_api_base` 改成固定域名后无需再改。
- 方案 B：租用云服务器（有公网 IP / 绑定域名），把 labpilot 直接部署上去。
- 方案 C：有自有域名时用 Cloudflare DNS + Tunnel，或直接给服务器配公网 IP + 域名解析。

实施时要同步改每台设备电脑 `config.json` 里的 `booking_api_base`。

参见 `docs/DEPLOYMENT.md`。

## 数据层迁移到 MySQL

当前预约后台用的是 Node 内置 `node:sqlite`，数据存在单个文件 `data/labpilot.sqlite`（见 `server/db.js`）。
本地单机够用，但后续要换成 MySQL，方便多进程 / 多机器同时访问、独立备份。

范围：

- 把 `server/db.js` 里的 `node:sqlite` 换成 MySQL 驱动（建议 `mysql2`），连接信息走环境变量：
  `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`。
- SQL 基本可直接复用，需微调的方言差异：
  - `?` 占位符改为 `mysql2` 的占位写法。
  - `INTEGER PRIMARY KEY AUTOINCREMENT` 一类自增写法（当前主键都是 TEXT，影响小）。
  - `PRAGMA journal_mode = WAL` 删除（MySQL 无此语句）。
- 建表语句（`users`、`bookings`）移到独立的初始化脚本或迁移文件，不再在每次启动时内联执行。
- 种子数据（注册用户、示例预约）改为一次性导入脚本，避免每次启动重复写入。
- `data/labpilot.sqlite` 与 `data/` 目录在迁移完成后移除；`.gitignore` 里的 `data/` 规则相应调整。
- 扫码 agent 只通过 HTTP 接口访问，不直连数据库，所以这边换 MySQL 对它无感，无需改动。

验收：

- `/api/users/verify`、`/api/bookings/active`、`/api/bookings`、`/api/bookings/instrument/:id` 在 MySQL 上返回与现在一致的结果。
- 前端创建预约仍能写入并在刷新后读回。
