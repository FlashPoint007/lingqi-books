# 在线正文与扩展服务

## 当前交付与真实状态

Sites 已有在线小说目录、按章读取、署名 / 授权链接、字号 / 主题、章节进度恢复，以及受控漫画图片读取。没有内置第三方中文日轻正文源；源清单和附件里的仓库都不是内容授权凭据。

`services/content-bridge` 是可独立部署的 Node 服务，支持三类来源：

- `catalog`：运营者持有授权的 JSON 内容库，立即可用于生产。
- `lnreader`：遵循四个核心方法的可信、自包含 ESM 插件。不是完整 Android / React Native 运行时，不支持直接导入远程插件清单或原始 TS，依赖 WebView、登录存储和运行时注入的插件必须另行适配。
- `suwayomi`：现有服务 REST v1 的搜索、目录、图片读取适配。REST 在上游标记为将来弃用，升级时需回归。本次没有可用实例，所以没有实源验证。Maki 未实现。

## 部署内容服务

1. 在已有 Docker 主机上复制 `services/content-bridge`，将 `config.example.json` 复制为 `config.json`。
2. 填写下面的核准来源。保持空数组则不发布任何内容。`rightsUrl` 是运营者的授权记录，服务只校验字段格式，**不会自动证明授权真实性**。
3. 设置随机 `BRIDGE_TOKEN`（至少 32 字符），运行 `docker compose up -d --build`。
4. 用现有 HTTPS 反向代理转发到 `127.0.0.1:8787`。服务需要长期运行的主机，不能依赖本次临时执行环境。
5. 在 Sites 生产环境设置 `CONTENT_BRIDGE_URL`（HTTPS 根地址）与秘密 `CONTENT_BRIDGE_TOKEN`，重新部署当前版本。浏览器和 Git 中不保存密钥。
6. 内容来源页会显示连接状态与实际核准源；发现页选择“在线正文 / 扩展源”。完成实源搜索、目录、一章正文 / 图片和续读验证后再开放来源。

授权中文小说配置：

```json
{"sources":[{"id":"my-novels","name":"授权中文小说","type":"catalog","kind":"novel","language":"zh","site":"https://your-content.example/","rightsUrl":"https://your-content.example/rights","attribution":"作者与译者署名","file":"novels.json"}]}
```

`data/novels.json`（只放自有或已获授权内容，示意结构不附带任何真实作品）：

```json
[{"id":"work-1","title":"作品标题","author":"作者","url":"https://your-content.example/works/1","chapters":[{"title":"第一章","text":"已获授权的纯文本正文"}]}]
```

LNReader 配置：`type: "lnreader"`、`kind: "novel"`、`module: "approved-plugin.mjs"`，其余来源字段同上。将审核后的构建文件放入 `plugins/`。模块默认导出 `popularNovels(page, options)`、`searchNovels(q,page)`、`parseNovel(path)`、`parseChapter(path)`。可实现 `parsePage` 和 `resolveUrl`。HTML 经 Cheerio 提取为纯文本，脚本和嵌入元素移除；插图暂不展示。插件在服务进程中有完整代码权限，这是可信代码宿主，不是沙箱；应独立容器、限制出口、固定依赖和插件版本。不会自动安装未审核扩展。

Suwayomi 配置：`type: "suwayomi"`、`kind: "manga"`、`endpoint: "http://suwayomi:4567"`、`sourceId: "已核准的数字源ID"`；可用 `authorizationEnv: "SUWAYOMI_AUTH"` 指向容器环境中的 Authorization 值，例如 Basic 编码凭据。需要在 compose 添加对应环境项。每个源一个配置，不能让访客选择其他已安装源。保留 `site` / `rightsUrl` / `attribution`。图片通过 Sites → 内容服务 → 固定 Suwayomi 端点读取，客户端无凭据、无任意 URL 代理，也不开放安装 / 删除接口。

## API 与验证

所有端点要求 `Authorization: Bearer <BRIDGE_TOKEN>`，仅 GET：

- `/v1/sources`：核准来源及署名、授权记录。
- `/v1/search?kind=novel&q=关键词&page=1`：归一化作品。
- `/v1/chapters?id=作品ID&page=1`：每页 100 章。
- `/v1/content?id=章节ID&workId=作品ID`：纯文本或图片页数，以及署名。
- `/v1/image?id=章节ID&workId=作品ID&index=0`：仅受控漫画图片，限制类型与大小。

不接受前端传 URL。ID 含源与作品绑定，移除配置后旧 ID 即不可读。单进程并发 8；大规模公开站点仍需在入口设置全局速率和带宽限制。插件搜索页大小依来源而异，下一页提示是估算；中文作品的跨源匹配仍需用户确认，不自动把同名结果绑定。全文最多 10000 章，超过上限显示错误，避免静默截断。

本次自动测试以隔离测试目录验证未鉴权拒绝、搜索、目录、正文、署名、跨作品章节阻断和非法 ID；不把测试内容发布到生产源清单。尚未连接实际 LNReader 插件或 Suwayomi 实例。
