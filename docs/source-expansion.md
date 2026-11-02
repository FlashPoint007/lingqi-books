# 新增日轻与漫画阅读源

调研与实施：2026-11-01—2026-11-02。

本次目标是本站完成搜索、目录、正文与图片阅读。GitHub 项目有适配器，并不代表对应网站当前可用。新源先保留为 pending，通过 Sites 生产节点的固定样本检测后，才加入 `PUBLIC_READING_SOURCES`。

## 已实现的适配

| 来源 | 范围 | 站内实现与限制 |
| --- | --- | --- |
| 无限轻小说 / 8novel | 日轻繁体中文译文 | 来源推荐与搜索、分卷目录、正文段落、按原位保留插图。公开阅读页的字面章节表作为数据解析，不执行源站脚本。部分旧版本插图的源站文件缺失，不能据此保证全部插图。 |
| Komiic | 繁中普通漫画 | GraphQL 作品与目录、分话和单行本版本分开、完整图片列表、本地图片网关。按照当前来源的图片票据流程读取单页，保留访客额度，额度耗尽明确失败。 |

小说匹配增加 OpenCC 繁简归一化和括号内中文别名，仍要求同一媒体类型和相同的已核验作者。不同作者的 SF 同名原创作品不能关联到日本原作。候选版本按钮直接打开本站阅读器。

图片网关仅接受作品、章节与页码，不接受用户传入的任意图片 URL。章节须属于已读取目录，图片只来自固定来源或经过验证的清单。Komiic 票据只发送给固定图片 CDN，不输出到客户端、不提交 Git；响应须具有已支持的二进制图片签名。

## GitHub 方案核对

- [LNReader 插件仓库](https://github.com/LNReader/lnreader-plugins)：适合参考插件协议、来源解析和测试方法。移动端插件运行环境不能直接当作 Worker 服务运行。
- [Legado 日轻规则集合](https://github.com/ZWolken/Light-Novel-Yuedu-Source)：提供来源线索，规则存在不代表匿名访问、正文与插图当前均可用。
- [novel-downloader](https://github.com/saudadez21/novel-downloader)：参考 N8 公开阅读页的正文路径格式。本项目独立实现有边界的读取器，未引入其程序执行环境或下载全部作品。
- [Komiic 客户端](https://github.com/afunc233/Komiic)、[Venera 配置](https://github.com/venera-app/venera-configs)：参考漫画查询结构。旧 `/api/image/{kid}` 路由不能作为当前图片验证成功的依据，须跟进来源客户端实际流程。
- [OpenCC JavaScript](https://github.com/nk2028/opencc-js)：用于繁简标题和作者匹配。
- Suwayomi / Maki：现有 HTTP 适配保留；Sites Worker 无法直接常驻其 JVM / .NET 进程，仍需要独立实例。

## 没有启用的候选

| 候选 | 实测情况 |
| --- | --- |
| 37yq.com | 停放/出售页面，未得到小说目录。 |
| Baozi | 返回明确挑战页面，停止探测。 |
| wowenku | 主页与目录可读，但搜索出现 Cloudflare 验证；未继续尝试受保护接口。 |
| colorful-fantasybooks / maofly / happymh | 测试节点连接超时或失败，未完成阅读链路。 |
| Novelia | 匿名列表 API 返回 401 游客无权，仍未启用。 |
| 轻小说百科 / Wenku8 / 哔哩轻小说 | 原有适配保留，已知生产验证或登录问题仍未解除，不能作为可读来源展示。 |

生产样本、构建与浏览器验证结果见 [validation.md](validation.md)。单个样本通过不代表全部作品、每章每图永久可用。
