# Wallish

用每日壁纸学英语的 macOS 桌面应用。界面是 Electron + React，壁纸和单词条在本机合成后设为桌面。

## 环境

- macOS
- Node.js 18 或更新版本

## 启动

在项目目录安装依赖并启动开发窗口：

```bash
npm install
npm run dev
```

这条命令会同时打开页面开发服务（`http://127.0.0.1:5173`）和 Electron 窗口。改页面代码会自动刷新。改 `electron/` 里的主进程代码后，需要停掉再重新执行 `npm run dev`。

关掉窗口后程序还在菜单栏，用托盘菜单退出。

## 打包

```bash
npm run pack:mac
```

这条命令会先构建页面，再打出未签名的 macOS 应用。产物在：

```text
release/mac/Wallish.app
```

当前只打 Intel（x64）目录包，不会生成 dmg。`dist/` 是页面构建结果，`release/` 是打包结果，这两个目录都不要提交。
