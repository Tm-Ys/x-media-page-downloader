# X 页面批量下载（点赞/媒体）

> TamperMonkey 用户脚本 — 一键下载 X (Twitter) 上的全部媒体内容。

[English](README.md) | [日本語](README.ja.md)

---

## 概述

本仓库提供两个 TamperMonkey 脚本，用于从 X（原 Twitter）下载媒体（图片、视频、GIF）：

| 脚本 | 用途 |
|---|---|
| **`x-page-downloader.user.js`** | **批量下载** — 用户 `/media` 或 `/likes` 页面上的全部媒体 |
| **`user.js`** | **单条下载** — 每条推文加一个下载按钮（原作者 [ChinaGodMan](https://github.com/ChinaGodMan/UserScripts)） |

---

## 功能特性 (`x-page-downloader.user.js`)

- **批量抓取** — 一键下载用户媒体库或点赞中的全部图片/视频/GIF
- **自动滚动** — 模拟滚到底部加载更多内容，直到无新内容或达到预期数量
- **ZIP 打包** — 所有文件打包为一个 ZIP，内部目录 `{显示名}@{用户名}/`
- **文件命名** — `{显示名}@{用户名}_{推文ID}_{序号}.{后缀}`（多条媒体时添加序号）
- **日期过滤** — 只下载指定日期**之前**的推文媒体（格式 `YYYY-MM-DD`）
- **数量限制** — 最多下载 N 个媒体文件（0 = 不限制）
- **设置持久化** — 数量限制和日期通过 `GM_setValue` 保存，跨页面有效
- **SPA 导航适配** — 在 X 内切换页面时自动清除状态重新抓取
- **窗口可最小化** — 点击 ✕ 收起到右下角 📦 浮动按钮
- **下载日志** — 面板内显示带时间戳的成功/失败提示

### 支持页面

| 页面 | URL 模式 | DOM 结构 |
|---|---|---|
| 媒体库 | `https://x.com/{用户}/media` | `li[role="listitem"]` 网格 |
| 点赞 | `https://x.com/{用户}/likes` | `article[data-testid="tweet"]` 时间线 |

---

## 安装方法

1. 安装 [TamperMonkey](https://www.tampermonkey.net/)（Chrome / Firefox / Edge）
2. 直接打开以下脚本原始链接：
   - **批量下载**：[`x-page-downloader.user.js`](x-page-downloader.user.js)
   - **单条下载**：[`user.js`](user.js)
3. TamperMonkey 会自动弹出安装提示 — 点击 **安装**

### 手动安装

1. 复制脚本全部内容
2. TamperMonkey 面板 → **添加新脚本**
3. 粘贴 → **Ctrl+S** 保存

---

## 使用说明

1. 打开 `https://x.com/{用户名}/media` 或 `https://x.com/{用户名}/likes`
2. 右下角自动出现浮动面板

   ![截图](img/image1.png)

3. （可选）点击 ⚙ 进行配置：
   - **最大媒体数量**：限制下载文件数（0 = 不限）
   - **截止日期**：只下载该日期**之前**的推文
   - 点击 **保存**（设置会自动记住）

   ![截图](img/image2.png)

4. 点击 **▶ Collect & Download All**
5. 脚本会：
   - 自动向下滚动加载所有推文
   - 通过 X 内部 GraphQL API 获取每一条推文的媒体 URL
   - 下载所有文件并打包为 ZIP
6. 下载完成：

   ![截图](img/image3.png)

### ZIP 目录结构

```
fullname@username.zip
└── fullname@username/
    ├── fullname@username_2058540338411876579.jpg
    ├── fullname@username_2058328300595089506.jpg
    ├── fullname@username_2057214335341256995_1.jpg   (多图推文)
    ├── fullname@username_2057214335341256995_2.jpg
    └── fullname@username_2056320976921772506.mp4      (视频)
```

---

## 配置项 (`x-page-downloader.user.js`)

| 设置项 | 说明 | 默认值 |
|---|---|---|
| **Max media count** | 最大下载文件数（0 = 不限） | `0` |
| **Cutoff date** | 只下载此日期之前的推文（留空 = 不限） | `''` |

设置通过 `GM_setValue` 持久化保存，刷新页面后依然有效。

---

## 注意事项

- GraphQL API 使用了硬编码的查询 ID（`2ICDjqPd81tulZcYrtpTuQ`）。如果 X 端更新该 ID，脚本可能失效，需要手动更新。
- 敏感内容推文只要 API 返回了媒体 URL，仍可正常下载。
- 超大量下载（500+ 文件）时，ZIP 打包会消耗较多内存，请耐心等待。
- 原版单条下载脚本 `user.js` 由 [ChinaGodMan](https://github.com/ChinaGodMan/UserScripts) 独立维护。

---

## 许可

MIT
