# 待办

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
