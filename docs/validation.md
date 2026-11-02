# 首版验证记录

验证日期：2026-10-29。

- TypeScript 检查通过。
- 8 项 Node 测试通过：TXT 章节边界、无标题文本、名称归一化、来源模型、汉化组移除列表、缓存合并、限流失败处理。
- Vinext / Workers 生产构建通过。
- 直接 HTTP 实测 Bangumi 轻小说搜索与 MangaDex 中文漫画发现均返回 200 与真实作品数据。
- 云浏览器已检查首页布局、轻小说 / 漫画切换及来源错误提示。发现并修复 Workers 不支持 `redirect: error` 的问题，改为 `manual` 并拒绝非成功响应。
- 云预览环境上游 fetch 返回内部网络错误；不将此记为源站宕机或真实阅读成功。生产验证结果将在后续记录补齐。
- Maki / Suwayomi、LNReader 均未部署独立服务，尚无扩展端到端验证结果。
- なろう默认关闭，没有在运营者注册状态未知时启用。

## 公网验收补充

- 按运营者请求设为 public，云浏览器无需登录即可访问。
- 实测首页加载 18 部 Bangumi 轻小说，切换漫画后加载 18 部 MangaDex 作品。
- 实测匿名收藏成功，漫画中文目录保留汉化组署名。
- 实测《Kage no Jitsuryokusha ni Naritakute!》第 75 话多张图像加载成功（自然宽度 1114px）；部分原图失败，增加节流图自动回退，仍保留手动重试，不把单章成功视为全源可用率保证。
- 加入漫画章节与逐页位置续读、纯文本粘贴入口。


## 公开阅读源验收（2026-10-30）

- Sites 第 9 版远程生产构建与发布成功，生产环境修订 1 已应用 `PUBLIC_READING_SOURCES=sfacg,bh3`。
- SF 生产列表返回 20 部真实作品；数字 ID `787359` 与名称“实用主义少年”搜索均命中对应作品，封面自然宽度 368px。
- SF 测试作品有 14 章。云浏览器在本站打开第一章，实际渲染 99 段、3,274 字；切至第二章，实际渲染 178 段、5,675 字。本样本没有正文插图，不能据此宣称已完成真实 SF 插图验收。
- 《崩坏3》官方漫画生产目录可用。《逃离长空篇》读取到 7 章；首章 manifest 有 29 页，云浏览器确认前 3 张本站图片实际解码成功，自然宽度分别为 800 / 1599 / 800px。尚未将全部作品、每张图片记为通过。
- 回归样本新增目录归属、跨作品 / 跨域图片拒绝、VIP 请求前锁定、有序图文、页数完整性、数字标签翻页与配置关闭等检查。样本均为原创，未提交第三方正文。
- 当前工作环境依赖安装因下载超时失败，本地完整测试和 TypeScript 检查未完成；只完成变更文件的 TS / TSX 语法转换检查。随后使用 Sites 远程构建与云浏览器生产验收，不把新增测试写为已通过。开发预览也因缺少依赖未启动。
- Novelia / MangaBz 的服务端访问遇到 1010 阻断，停止探测并未启用。两项新增是中文原创补充，不代表新增日轻中文译文来源。

## 2026-10-30 source retest

- Dependency installation recovered; 38 automated tests passed; typecheck and local production build rerun for this version.
- A descriptive LingqiBooks application User-Agent (no browser impersonation) returned actual MangaBz home, work, chapter and image data. Development probe: work 234, 162 catalog entries; chapter 525246, 15 pages; first JPEG returned 200 (491385 bytes). This does not certify all titles or pages.
- MangaBz adapter reads public chapter data without evaluating source JavaScript, binds chapter IDs to the work catalog, rejects VIP chapters, and restricts picture origins and work/chapter paths.
- Novelia n.novelia.cc homepage returned 200, but both anonymous list API variants returned 401 and `游客没有权限执行此操作`. It remains disabled; homepage access is insufficient.
- Sites runs Workers, not a Docker host. The existing Maki (.NET) and Suwayomi (Java) services cannot run unchanged inside it; existing HTTP adapters still require an external instance.

## 2026-10-30 additional reading sources

- Added `manhuagui` and `lnovel` as optional direct Workers readers, with explicit production enablement. Source markup becomes data blocks or scoped local image endpoints; no source script is executed.
- Manga source development probe: work 37861 (`第二次被异世界召唤`) returns 51 chapters, chapter 522954 returns 40 image paths. Pages 1, 20 and 40 returned actual WebP images (98416, 135126 and 74034 bytes). The dictionary is decoded as data, with work/chapter identity, complete page count and image path checks. Restricted catalogs and chapters are rejected.
- Novel development probe: work 3853 (`朱華姬的親衛`, 白川紺子) returns 11 chapters. Chapters 146090 and 146091 return Chinese text. Chapter 146090 parsed into 699 blocks with original translator credits preserved. These samples contain no inline illustrations; synthetic illustration tests do not constitute real-source illustration verification.
- 42 automated tests passed, including cross-work and image-path rejection, restricted reading state, non-executable manifest decoding, ordered text/image blocks, and bounded image index checks.
- Linovel.net timed out; Lightnovel.us returned 503. The 37yq.com homepage is a domain-for-sale landing page rather than a readable catalog. These candidates were not enabled.
- Production validation is performed after publication and reported separately; development success does not establish production availability.

### Production outcome

- Sites v13 deployed with both adapters for validation. Manga source work 37861 and its catalog loaded successfully after one transient connection failure. Cloud browser decoded chapter 522954 pages 1 and 2 at 844px natural width; page turning worked. Chapter 541147 returned 34 pages and its first picture decoded at 844px. Scroll validation decoded page 20 from chapter 522954 through the local image endpoint.
- The novel source returns a confirmed verification page from Sites production. Its production enablement was removed; it is explicitly marked blocked, retained for future approved connectivity, and excluded from combined search. No production novel readability is claimed.
- Final automated suite: 43 tests passed; TypeScript checking passed. Reader behavior and limitations are reported as samples, not a full-source availability guarantee.
- Cloud browser additionally decoded chapter 522954 page 40 through the production image endpoint. Pages outside sampled reading positions remain lazy and were not all checked.

## Reading entry repair (2026-10-30)

- Fixed the metadata-to-reading dead end: default discovery now lists enabled reading providers; Bangumi metadata is an explicit separate mode, labeled as having no body text. Unconfigured/blocked adapters are excluded from default and combined reading searches.
- Added primary Start/Continue Reading actions to real reader works. Catalogs must contain an unlocked inline chapter before the button is enabled. Source attribution links remain secondary information links.
- Bangumi detail pages query only configured reading providers for same-title works of the same media kind, require an unlocked inline chapter, and present choices for the user to verify. No same-title choice is auto-associated; unmatched works are explicitly unavailable. The hard-coded Wenku8 redirect was removed.
- External-only manga chapters are disabled for inline reading. Offline adapters cannot be opened as normal reading providers from the source status page.
- 47 automated tests passed, covering enabled-provider filtering, no fallback into disabled Wenku8, title/media identity, locked/external chapter rejection, and empty enabled-provider discovery. TypeScript check and local production build passed. Local installer output stalled during dependency downloads; checks ran successfully using the materialized dependencies directly after stopping the installer.

## Reading request cancellation repair (2026-10-30)

- Live browser verification found SF chapter loading could remain pending after a detail refresh canceled the first request. Chapter and reading-candidate effects now use the stable source and work ID, so a metadata refresh does not restart them.
- The shared upstream cache now stores completed data only. It never hands a new Worker request an in-flight promise owned by an abandoned request. Added a regression test that leaves one reader pending and verifies a second reader completes and caches its own result.
- Validation: 49 tests passed, TypeScript check and production build succeeded.

- Live metadata verification also found an SF work titled “败犬女主太多了!” by 星下夏心 (602319), distinct from 雨森たきび’s novel. Novel candidates now fetch source detail and require matching verified author information as well as title and media kind; different or missing authors are excluded. The site does not claim the Japanese original is connected.
- Both HTML-reader and JSON-metadata caches now store completed data only; regression tests cover stalled earlier requests without blocking a later reader.

## Discovery transitions and manga browser verification (2026-10-31)

- Discovery responses are bound to their category, source, query, page and filters. A changed selection immediately renders the loading state; an old result or error cannot be displayed under a new source. Aborted catalog, chapter and manga-content responses are ignored. Opening another detail cancels pending reading navigation.
- Live browser verification: MangaBz work 234 (極主夫道) opened through Start reading into the in-site reader. Chapter 1 returned 16 image pages; pages 1 and 2 decoded at 640×500 and 640×910. Page mode and next-page navigation worked. Japanese novel metadata remains distinct from available body sources.
- Validation: 49 tests passed, TypeScript check and production build succeeded.

## 新增日轻与漫画源（2026-11-02）

- 环境维护清理了此前尚未发布的工作区。本轮从 Sites 已保存源码恢复，重新安装依赖并补回适配；未将先前未完成的改动当作已上线。
- 59 项 Node 测试通过；TypeScript 检查和本地 Vinext / Workers 生产构建通过。新增用例包含繁简与括号别名、严格作者匹配、目录归属、非执行正文路径解析、图文位置、图片票据与固定 CDN、访客额度耗尽、正文可读而源站图片缺失的检测结果。
- 新增 `n8novel` 和 `komiic`。先以未启用状态部署固定样本完整阅读检测，取得生产结果后，环境修订 5 将其加入 `PUBLIC_READING_SOURCES`。保留 `sfacg,bh3,mangabz,manhuagui`；未启用受验证或登录限制的来源。
- N8 生产样本 9236（《敗北女角太多了！(敗犬女主太多了！)》，作者雨森たきび）：108 章。序章和第一章正文合计 27,234 字符（包括段落换行），通过本站内容接口读取。云浏览器进入本站阅读器，序章显示 14 段、268 个正文字符；下一章显示 1,043 段、24,856 个正文字符。目录分页合并和下一章操作正常。
- 同一 N8 旧版样本封面及插图 116303 的源站图片文件不可用。检测明确记录 `coverBytes=0`、`illustrationBytes=0` 和缺图提示；不将其记为图文全部通过。保留源站的真实图片路径，失效时显示失败提示，正文仍可阅读。目录标题清理来源的 `/ 章节数` 后缀，避免重复卷名。
- Komiic 生产样本 466（《膽大黨 (超自然武裝噹噠噹)》，龍幸伸）：250 个分话目录；第一话 7380 完整清单 64 页，取得 350,712 字节真实 JPEG，封面 19,068 字节。云浏览器确认第一页 1960×1439、第二页 1960×1435；逐页模式显示 1/64、2/64。下一话 7381 返回 51 页，首张图解码为 822×1200。图片均通过本站网关加载。
- Komiic 图片请求采用来源普通 `getImageTicket` 流程。票据仅在服务端请求固定 CDN；不绕过登录或访客图片额度。阅读页展示本次额度查询结果。不会把样本成功描述为全站永久可用。
- 当前实际发布地址由 Sites 返回为 `https://lingqi-books.tarokiki.chatgpt.site`，保留同一 Site ID 与 public 访问范围。
- 完整调研与未启用来源的原因见 [source-expansion.md](source-expansion.md)。
