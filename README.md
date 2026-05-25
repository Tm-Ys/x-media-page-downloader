# X 页面批量下载（点赞/媒体） / X Page Batch Downloader

基于TamperMonkey的插件。

一键下载 X 点赞/媒体页面上的全部图片/视频/GIF。自动滚动加载、日期过滤、数量限制，打包为ZIP下载。

Download ALL media from X.com likes or media pages. Auto-scrolls, date filter, max count, and packages as ZIP.

## 快速开始

安装

此脚本会在进入`https://x.com/*/media`和`https://x.com/*/likes`后，自动在右下角展开脚本，此时可以设置抓取的媒体的发布时间，和最大抓去多少条媒体。

当按下下载按钮后，脚本会自动模拟向下加载的操作，直到确认无法继续加载，然后自动下载所有的媒体。

下载的所有媒体会按照`全名@用户名.zip`的命名方式保存。

