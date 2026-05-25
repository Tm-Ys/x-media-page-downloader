# X Page Batch Downloader

> TamperMonkey userscript — Download ALL media from X (Twitter) with one click.

[中文](README.zh-CN.md) | [日本語](README.ja.md)

---

## Overview

This repository provides two TamperMonkey scripts for downloading media (images, videos, GIFs) from X (formerly Twitter):

| Script | Purpose |
|---|---|
| **`x-page-downloader.user.js`** | **Batch download** — all media from a user's `/media` or `/likes` page |
| **`user.js`** | **Single download** — one-click download button on each tweet (original by [ChinaGodMan](https://github.com/ChinaGodMan/UserScripts)) |

---

## Features (`x-page-downloader.user.js`)

- **Batch download** — grab every image/video/GIF from a user's media gallery or liked tweets
- **Auto-scroll** — automatically scrolls to load all content; stops when no more items appear or when the expected count is met
- **ZIP packaging** — all files are packaged into a single ZIP, organized under `{DisplayName}@{Username}/`
- **File naming** — `{DisplayName}@{Username}_{StatusId}_{n}.{ext}` (index appended only for tweets with multiple media)
- **Date filter** — only download tweets older than a specified date (`YYYY-MM-DD`)
- **Max count limit** — stop after N media items (0 = unlimited)
- **Persistent settings** — max count & cutoff date are saved via `GM_setValue`
- **SPA navigation** — state auto-resets when navigating between pages (no manual refresh needed)
- **Minimizable panel** — click ✕ to collapse to a floating 📦 button; click to restore
- **Download log** — timestamped success/failure messages in the panel

### Page Support

| Page | URL Pattern | Structure |
|---|---|---|
| Media gallery | `https://x.com/{user}/media` | `li[role="listitem"]` grid |
| Liked tweets | `https://x.com/{user}/likes` | `article[data-testid="tweet"]` timeline |

---

## Installation

1. Install [TamperMonkey](https://www.tampermonkey.net/) (Chrome / Firefox / Edge)
2. Open the raw script URL:
   - **Batch download**: [`x-page-downloader.user.js`](x-page-downloader.user.js)
   - **Single download**: [`user.js`](user.js)
3. TamperMonkey will prompt you to install — click **Install**

### Manual Installation

1. Copy the script content
2. TamperMonkey Dashboard → **Add new script**
3. Paste → **Ctrl+S** (or Cmd+S) to save

---

## Usage

1. Navigate to `https://x.com/{username}/media` or `https://x.com/{username}/likes`
2. A floating panel appears at the **bottom-right corner**

   ![screenshot](img/image1.png)

3. (Optional) Click ⚙ to configure:
   - **Max media count**: limit number of files to download (0 = unlimited)
   - **Cutoff date**: only download tweets **before** this date
   - Click **Save** (settings persist across sessions)

   ![screenshot](img/image2.png)

4. Click **▶ Collect & Download All**
5. The script will:
   - Auto-scroll to load all tweets
   - Fetch each tweet's media via X's internal GraphQL API
   - Download all files and package them into a ZIP
6. Download complete panel:

   ![screenshot](img/image3.png)

### ZIP Structure

```
橘あき@aki_tatchi.zip
└── 橘あき@aki_tatchi/
    ├── 橘あき@aki_tatchi_2058540338411876579.jpg
    ├── 橘あき@aki_tatchi_2058328300595089506.jpg
    ├── 橘あき@aki_tatchi_2057214335341256995_1.jpg   (multi-photo tweet)
    ├── 橘あき@aki_tatchi_2057214335341256995_2.jpg
    └── 橘あき@aki_tatchi_2056320976921772506.mp4      (video)
```

---

## Configuration (`x-page-downloader.user.js`)

| Setting | Description | Default |
|---|---|---|
| **Max media count** | Maximum number of files to download (0 = unlimited) | `0` |
| **Cutoff date** | Only download tweets created before this date (empty = no filter) | `''` |

Settings are stored via `GM_setValue` and persist across page loads.

---

## Notes

- The GraphQL API uses a hardcoded query ID (`2ICDjqPd81tulZcYrtpTuQ` for `TweetResultByRestId`). If X updates this ID, the script may break and require an update.
- Sensitive content tweets are downloaded normally as long as the media URL is returned by the API.
- For very large collections (500+ items), ZIP generation may take a while and use significant memory.
- The original `user.js` (single-tweet download) is maintained separately by [ChinaGodMan](https://github.com/ChinaGodMan/UserScripts).

---

## License

MIT
