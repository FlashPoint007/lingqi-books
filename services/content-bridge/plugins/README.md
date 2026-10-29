这里放运营者已审核、已构建的自包含 ESM 模块（.mjs），默认导出 LNReader PluginBase 实例。
要求 popularNovels、searchNovels、parseNovel、parseChapter 四个方法。
原始 TypeScript、CommonJS 插件、依赖 React Native / WebView / 存储注入的插件不能直接运行，需要先在原插件构建环境适配并打包。
这是可信代码宿主，不是沙箱；模块能访问进程权限。不要放入未经审核的远程代码。
