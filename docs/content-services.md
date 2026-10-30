# 站内图文阅读与来源配置

## 本次实现范围

小说阅读器按顺序显示文字段落与插图，支持图片失败重试、放大、字号、纸张 / 夜间主题和章节续读。漫画支持滚动 / 逐页、原图失败时重试节流图、上一章 / 下一章。所有主阅读操作留在本站，来源链接用于署名与出处。

来源状态含义：

- 已接入：既有 Bangumi 资料 / MangaDex 读取能力。
- 需验证：网页适配代码已实现，不代表当前源站允许访问或每部作品完整。
- 待配置：实例地址或允许列表尚未配置。
- 最近检测：当前运行实例最近一次列表请求结果，不代表整站、整本或全部图片成功。点击“检测”会真实读取列表。

## 内置小说源

| 标识 | 来源 | 已实现 | 限制 |
|---|---|---|---|
| wenku8 | 轻小说文库 | GBK 搜索、目录、分卷标签、正文、原位插图 | 可能需要登录 / 人机验证；本轮云浏览器被验证页阻挡，没有完成实源章节验收 |
| bilinovel | 哔哩轻小说繁体 | 列表、名称搜索、目录、分页、插图 | 域名变更、隐藏章节链接或字体混淆会显式报错；不推算隐藏章节 ID、不静默返回乱码 |
| esj | ESJ Zone | 列表、数字作品 ID、目录、图文正文 | 当前名称搜索不可用；匿名范围受来源限制；密码章节提示需要权限 |
| masiro | 真白萌 | 列表 JSON、数字作品 ID、目录 JSON、正文与插图 | 名称搜索未实现；通常需要登录；付费章标记锁定，不自动购买 |

数字 ID 可直接在选择对应来源后输入搜索框。正文与章节必须属于对应作品；图片代理不接受任意目标，只允许来源域、已知图床或运营者显式加入的图床。

上述适配针对公开可读页面。未添加绕过验证码、破解登录、批量支付或获取隐藏权限的行为。没有可访问实例或登录会话时，必须保留失败状态。本轮未把任何第三方小说正文放进仓库。

额外图床可在 Sites 秘密环境变量 `NOVEL_IMAGE_HOSTS_WENKU8`、`NOVEL_IMAGE_HOSTS_BILINOVEL`、`NOVEL_IMAGE_HOSTS_ESJ`、`NOVEL_IMAGE_HOSTS_MASIRO` 中添加，值是逗号分隔的精确主机名，不能填 URL、通配符或任意用户输入。

## Suwayomi

在 Sites 配置：

- `SUWAYOMI_URL`：已有实例的 HTTPS 根地址。
- `SUWAYOMI_SOURCE_IDS`：允许公开给此站阅读的扩展数字 ID，逗号分隔。
- `SUWAYOMI_AUTHORIZATION`：如实例启用鉴权，填完整 Authorization 值，作为秘密保存。

实现 REST v1 搜索、作品详情、目录、图片页数及图片读取。所有作品和章节验证来源归属；没有扩展安装、删除、下载或修改服务配置接口。REST v1 在上游标记将来弃用，升级后需要回归。实例必须长期运行；临时开发环境不能作为生产后台。

## Maki

在 Sites 配置：

- `MAKI_URL`：已有实例的 HTTPS 根地址。
- `MAKI_API_KEY`：个人 API key，作为秘密保存，服务端使用 `X-Api-Key`。
- `MAKI_SERIES_IDS`：允许此站读取的书库作品 ID，逗号分隔。

实现对允许列表的书库搜索、目录、封面、章节 manifest 与图片读取。只读 Maki 已有文件；无文件的章节标记“未下载”。不自动抓取全库、不发起下载、购买、删除或账户修改。图片密钥不会出现在浏览器 URL、HTML 或 Git 中。

这两类适配都可由 Sites 直接调用，无需额外的通用桥接；没有实际实例地址时不会伪装为已连接。

## 可选 LNReader / 授权内容服务

`services/content-bridge` 支持 `catalog` 自有内容库、适配后的 `lnreader` ESM 模块、已有 `lds` 解析服务与 `suwayomi` 桥接配置。

部署步骤：复制 `config.example.json` 为 `config.json`，填入核准源、署名与依据，设置至少 32 位随机 `BRIDGE_TOKEN`，执行 `docker compose up -d --build`，通过已有 HTTPS 反向代理转发到 `127.0.0.1:8787`。随后在 Sites 秘密环境变量中设置 `CONTENT_BRIDGE_URL` 与 `CONTENT_BRIDGE_TOKEN`，重新发布生效。

模块放在 `plugins/*.mjs`，默认导出 LNReader 四个方法：`popularNovels`、`searchNovels`、`parseNovel`、`parseChapter`，可补 `parsePage` 与 `resolveUrl`。宿主现在保留原位插图，不再把章节一律转成纯文本。HTML 先转换成文本 / 图片数据块，不向浏览器注入执行代码。

这不是完整 Android / React Native 运行时。原始 TypeScript、CommonJS、依赖 WebView / 存储注入的插件需要先适配构建。模块是可信运营代码，不是沙箱，不在线安装任意插件。

配置例子：

```json
{"sources":[{"id":"my-novels","name":"我的授权小说","type":"catalog","kind":"novel","language":"zh","site":"https://content.example/","rightsUrl":"https://content.example/rights","attribution":"作者与译者","file":"novels.json"}]}
```

`data/novels.json`：

```json
[{"id":"work-1","title":"作品","author":"作者","url":"https://content.example/works/1","chapters":[{"title":"第一章","text":"已获授权正文"}]}]
```

授权字段由运营者核实；代码只校验格式，不能自动证明授权真实性。实际内容 JSON 默认不提交 Git。

## 访问失败诊断与连接方式

列表、详情接口返回稳定的 `code`、`hint`、`retryable`。即使 HTTP 403 / 503，仍在大小限制内检查响应正文，再区分安全验证与普通权限错误。普通页面里的登录导航不再被当成登录墙；论坛首页或任意网页标题不再生成假作品。只有超时、限流、临时上游错误显示重试按钮。

生产日志仅记录 `source_failure` 的来源标识、操作、错误类型与 HTTP 状态，不记录搜索词、Cookie、密钥或原始页面。它是单次请求证据，不是所有作品可读性的保证。

在 Sites 配置 `CONTENT_BRIDGE_URL` 与 `CONTENT_BRIDGE_TOKEN` 后，可以按来源指定桥接中的 source ID：

| Sites 环境变量 | 示例值 |
|---|---|
| `NOVEL_BRIDGE_SOURCE_WENKU8` | `wenku8-account` |
| `NOVEL_BRIDGE_SOURCE_BILINOVEL` | `bilinovel-lds` |
| `NOVEL_BRIDGE_SOURCE_ESJ` | `esj-account` |
| `NOVEL_BRIDGE_SOURCE_MASIRO` | `masiro-account` |

配置后，选择该来源搜索时仅调用对应桥接插件。返回作品通过桥接读取目录、正文和插图；失败时不自动回退到已拒绝访问的匿名网页。旧的网页源书架记录需重新搜索并收藏服务返回的作品，以获得正确的服务作品 ID。

已登录会话在运营者维护的服务中管理，不在公开网页中填写或暴露。网站目前未提供这些账户会话或长期运行实例；不能只填写来源名称就把它当作已连接。

### 已有 LDS 服务

桥接 `config.json` 的来源配置示例（域名均需替换为运营者实际服务）：

```json
{"sources":[{"id":"bilinovel-lds","name":"哔哩轻小说阅读服务","type":"lds","kind":"novel","language":"zh","site":"https://www.bilinovel.com/","endpoint":"http://lds:5301","authorizationEnv":"LDS_AUTHORIZATION","rightsUrl":"https://content.example/rights","attribution":"按实际作品填写作者与译者","imageHosts":["img.example"]}]}
```

适配 `/api/search?keyword=`、`/api/novel?path=`、`/api/chapter?path=` 的 JSON 契约。名称搜索或数字 ID 查找后，目录与章节仍在本站阅读。该协议没有排行榜接口，因此空搜索会提示输入书名 / ID，不返回空列表冒充检测成功。LDS 本身需要独立部署和维护；本项目只连接已有服务，不提供验证码处理、会话获取或来源内容权限。

### 插图与插件参数

LNReader 模块的 `filters` 默认值现在传给排行榜方法，避免插件访问 `filters.rank.value` 时崩溃。来源失败互相隔离，通用桥接搜索保留其他成功来源。

小说插图改走 `/api/content-image` → 鉴权桥接 → 来源图片，保留插件的图片请求头；桥接令牌不发送到图片源。图片域名仅允许来源本身及配置中 `imageHosts` 的精确主机名，不接收浏览器任意 URL，不跟随图片重定向。缺少图床配置时显式报错，不静默删除插图。已验证章节短缓存 60 秒，避免每张插图重复抓取目录与正文。

## 验证记录

自动测试覆盖有序图文清洗、脚本 / 非法图片丢弃、卷章与相对链接、隐藏目录显式拒绝、付费标记、跨作品请求阻断、Maki / Suwayomi 允许列表、图片响应限制、挑战页不缓存等。服务接口测试使用隔离原创样本和 mock 响应，不等于实源成功。

云浏览器预览用一次性原创样本验证了段落 → 插图 → 段落顺序，图片实际加载、点开放大、切章、字号调整，以及刷新后恢复第二章。样本与临时接口在生产打包前删除。

生产实源可用性以最终交付说明为准。不能把已有解析器当成每部小说、每章图片或译文质量的保证。

本轮新增回归覆盖：403 正文识别、普通登录导航、假作品拒绝、按来源服务路由、无封面作品验证、插件 filters、带请求头的站内插图、LDS 契约与跨作品阻断。测试样本与 mock 不等同于真实中文轻小说章节验收。

漫画图片并发修复：图片预留 850 × 1200 的比例以稳定懒加载；每来源最多 3 个在途请求，其余在有界队列中等待，不再把正常翻页的并行图片直接拒绝。队列最多 24 个，排队超过 12 秒明确失败。
