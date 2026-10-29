# 站内图文阅读与来源配置

## 本次实现范围

小说阅读器按顺序显示文字段落与插图，支持图片失败重试、放大、字号、纸张 / 夜间主题和章节续读。漫画支持滚动 / 逐页、原图失败时重试节流图、上一章 / 下一章。所有主阅读操作留在本站，来源链接用于署名与出处。

来源状态含义：

- 已接入：既有 Bangumi 资料 / MangaDex 读取能力。
- 已添加：网页适配代码已实现，不代表当前源站允许访问或每部作品完整。
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

`services/content-bridge` 支持 `catalog` 自有图文内容库、适配后的 `lnreader` ESM 模块，以及既有 `suwayomi` 桥接配置。

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

## 验证记录

自动测试覆盖有序图文清洗、脚本 / 非法图片丢弃、卷章与相对链接、隐藏目录显式拒绝、付费标记、跨作品请求阻断、Maki / Suwayomi 允许列表、图片响应限制、挑战页不缓存等。服务接口测试使用隔离原创样本和 mock 响应，不等于实源成功。

云浏览器预览用一次性原创样本验证了段落 → 插图 → 段落顺序，图片实际加载、点开放大、切章、字号调整，以及刷新后恢复第二章。样本与临时接口在生产打包前删除。

生产实源可用性以最终交付说明为准。不能把已有解析器当成每部小说、每章图片或译文质量的保证。
