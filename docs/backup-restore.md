# 书架备份与恢复 / Library backup and restore

在“我的书架”导出版本 2 JSON，再通过“恢复备份”选择文件。确认框展示收藏和进度数量。文件仅由当前浏览器读取，不上传。

Export a version 2 JSON file from My shelf, then select Restore backup. Review the counts before confirming. Files are read locally and are not uploaded.

- 合并而非替换：已有书架保留，同作品只导入时间更新的进度。重复导入不会增加重复记录。
- 导出的 history 保留已移出书架的作品，不会自动把这些作品重新收藏。
- 保存作品来源、章节身份、漫画页码、章内滚动锚点。
- 最多 10 MB，分别最多 2000 本收藏、2000 条进度和 2000 条历史。未知版本或无效记录整体拒绝。
- 导入使用单个 localStorage 原子写入。存储额度不足不会留下半份导入数据。原来的逐项记录不删除。
- **不包含本地 TXT 正文、阅读排版/换源偏好，也不提供账户同步。** 恢复的本地作品记录不能代替原 TXT 内容。请同时保留原 TXT 文件；在另一浏览器重新导入 TXT 会成为新作品，不自动匹配旧进度。

Merge does not replace existing data. Newer progress wins; repeated imports are idempotent. History-only works remain outside the shelf. The backup preserves edition, chapter, manga page and scroll anchor. Imports have size/count limits and reject malformed records. A single atomic storage write prevents partial imports on quota failure. Keep original TXT files separately: bodies and preferences are not backed up, and re-importing TXT creates a new work identity.

## Verification / 验证

2026-11-14: synthetic temporary storage tests cover export/restore, removed-book history, scroll anchors, idempotency, newer-record preservation, quota failure and invalid identities/URLs. No real user's browser data was read or modified. Browser interaction QA remains pending where browser tools are unavailable.
