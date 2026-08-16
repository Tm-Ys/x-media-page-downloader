// ==UserScript==
// @name                X Page Batch Downloader
// @name:zh-CN          X 页面批量下载（点赞/媒体）
// @description         Download ALL media from X.com likes or media pages (Photos & Videos views). Auto-scrolls, date filter, max count, and packages as ZIP.
// @description:zh-CN   一键下载 X 点赞/媒体页面上的全部图片/视频/GIF（照片/视频视图）。自动滚动加载、日期过滤、数量限制，打包为ZIP下载。
// @author              Tm-Ys
// @namespace           https://github.com/Tm-Ys/x-media-page-downloader
// @version             2.6
// @match               https://x.com/*/media
// @match               https://x.com/*/media/
// @match               https://x.com/*/media*
// @match               https://x.com/*/media/*
// @match               https://x.com/*/likes
// @match               https://x.com/*/likes/
// @match               https://x.com/i/history/likes
// @match               https://x.com/i/history/likes/
// @match               https://twitter.com/*/media
// @match               https://twitter.com/*/media/
// @match               https://twitter.com/*/media*
// @match               https://twitter.com/*/media/*
// @match               https://twitter.com/*/likes
// @match               https://twitter.com/*/likes/
// @match               https://twitter.com/i/history/likes
// @match               https://twitter.com/i/history/likes/
// @icon                https://abs.twimg.com/favicons/twitter-pip.3.ico
// @grant               GM_download
// @grant               GM_setValue
// @grant               GM_getValue
// @require             https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @license             MIT
// @compatible          chrome
// @compatible          firefox
// @compatible          edge
// ==/UserScript==

;(function () {
    'use strict'

    const host = location.hostname
    const path = location.pathname.replace(/\/+$/, '')
    // /i/history/likes (new likes URL) has no screen name — use a neutral label
    const screenName = path.split('/')[1] === 'i' ? 'me' : path.split('/')[1]
    let PAGE_TYPE = /\/likes$/.test(path) ? 'likes' : 'media'

    let STRATEGY = getStrategy()

    let displayName = screenName
    let collectedStatusIds = new Set()
    let totalMediaCount = 0
    let expectedMediaCount = 0
    let isDownloading = false
    let panelEl = null
    let progressEl = null
    let btnEl = null
    let settingsVisible = false
    let minimized = false
    let miniBtnEl = null
    let lastPath = location.pathname.replace(/\/+$/, '')

    const SETTINGS = {
        maxCount: parseInt(GM_getValue('maxCount', '0')) || 0,
        cutoffDate: GM_getValue('cutoffDate', '') || '',
        allViews: GM_getValue('allViews', '1') === '1',
    }

    const LANG = {
        title: () => PAGE_TYPE === 'likes' ? 'Download Liked Media' : 'Download All Media',
        btnStart: '▶ Collect & Download All',
        btnScrolling: '⟳ Scrolling...',
        btnFetching: '⟳ Fetching media...',
        btnZipping: '⟳ Creating ZIP...',
        downloading: '⟳ Downloading...',
        complete: '✓ Complete',
        idle: '▶ Collect & Download All',
        found: (n) => `Found ${n} tweets`,
        media: (n) => `${n} media`,
        expected: (exp, got) => `Expected ~${exp} · Got ${got}`,
        settings: '⚙ Settings',
        maxCountLabel: 'Max media count (0=unlimited):',
        cutoffLabel: 'Only tweets before date (YYYY-MM-DD):',
        save: 'Save',
        saved: '✓ Saved',
        noMedia: 'No media found',
        error: 'Error',
        allViewsLabel: 'Collect Photos + Videos views (media page only)',
        viewLabel: (i, n, name) => `⟳ View ${i}/${n} (${name})...`,
        viewFail: (name) => `Warning: could not load ${name} view — some media may be missing`,
    }

    function getStrategy() {
        return {
            likes: {
                selector: 'article[data-testid="tweet"]',
                hasMedia: (el) => el.querySelector('div[data-testid="tweetPhoto"], div[data-testid="videoPlayer"]'),
            },
            media: {
                selector: 'article[data-testid="tweet"]',
                hasMedia: (el) => el.querySelector('div[data-testid="tweetPhoto"], div[data-testid="videoPlayer"]'),
            }
        }[PAGE_TYPE]
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

    function extractDisplayName() {
        try {
            const ld = document.querySelector('script[type="application/ld+json"]')
            if (ld) {
                const data = JSON.parse(ld.textContent)
                if (data.mainEntity && data.mainEntity.name) { displayName = data.mainEntity.name; return }
            }
        } catch (e) { }
        try {
            const meta = document.querySelector('meta[property="og:title"]')
            if (meta) {
                const m = meta.content.match(/\(?\s*\d*\s*\)?\s*(.+?)\s*\(@/)
                if (m) displayName = m[1]
            }
        } catch (e) { }
    }

    function findExpectedCount() {
        const tab = document.querySelector(
            PAGE_TYPE === 'media'
                ? 'a[href*="/media"][role="tab"], div[role="tab"][aria-label*="edia"]'
                : 'a[href*="/likes"][role="tab"], div[role="tab"][aria-label*="ikes"]'
        )
        if (tab) {
            const m = tab.getAttribute('aria-label') && tab.getAttribute('aria-label').match(/(\d[\d,]*)/)
            if (m) return parseInt(m[1].replace(/,/g, ''))
        }
        return 0
    }

    function clickRetryButton() {
        const retryTexts = ['重试', 'Retry', '再試行', 'retry', '重新加载', '请重试']
        const candidates = document.querySelectorAll('div[role="button"], button, a')
        for (const el of candidates) {
            const text = el.textContent.trim()
            if (text && retryTexts.some(t => text.includes(t))) {
                if (el.offsetParent !== null) {
                    el.click()
                    return true
                }
            }
        }
        return false
    }

    function sanitizeName(name) { return name.replace(/[\\/:*?"<>|]/g, '_').trim() }

    function extractStatusId(el) {
        const a = el.querySelector('a[href*="/status/"]')
        if (!a) return null
        const m = a.href.match(/\/status\/(\d+)/)
        return m ? m[1] : null
    }

    function getCookie(name) {
        const cookies = {}
        document.cookie.split(';').filter(n => n.indexOf('=') > 0).forEach(n => {
            n.replace(/^([^=]+)=(.+)$/, (_, k, v) => { cookies[k.trim()] = v.trim() })
        })
        return name ? cookies[name] : cookies
    }

    async function fetchTweetJson(statusId) {
        const baseUrl = `https://${host}/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId`
        const variables = {
            tweetId: statusId, with_rux_injections: false, includePromotedContent: true,
            withCommunity: true, withQuickPromoteEligibilityTweetFields: true,
            withBirdwatchNotes: true, withVoice: true, withV2Timeline: true
        }
        const features = {
            articles_preview_enabled: true, c9s_tweet_anatomy_moderator_badge_enabled: true,
            communities_web_enable_tweet_community_results_fetch: false,
            creator_subscriptions_quote_tweet_preview_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            longform_notetweets_consumption_enabled: false,
            longform_notetweets_inline_media_enabled: true,
            longform_notetweets_rich_text_read_enabled: false,
            premium_content_api_read_enabled: false,
            profile_label_improvements_pcf_label_in_post_enabled: true,
            responsive_web_edit_tweet_api_enabled: false,
            responsive_web_enhance_cards_enabled: false,
            responsive_web_graphql_exclude_directive_enabled: false,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            responsive_web_graphql_timeline_navigation_enabled: false,
            responsive_web_grok_analysis_button_from_backend: false,
            responsive_web_grok_analyze_button_fetch_trends_enabled: false,
            responsive_web_grok_analyze_post_followups_enabled: false,
            responsive_web_grok_image_annotation_enabled: false,
            responsive_web_grok_share_attachment_enabled: false,
            responsive_web_grok_show_grok_translated_post: false,
            responsive_web_jetfuel_frame: false,
            responsive_web_media_download_video_enabled: false,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            rweb_tipjar_consumption_enabled: true, rweb_video_screen_enabled: false,
            standardized_nudges_misinfo: true, tweet_awards_web_tipping_enabled: false,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            tweetypie_unmention_optimization_enabled: false,
            verified_phone_label_enabled: false, view_counts_everywhere_api_enabled: true
        }
        const url = encodeURI(`${baseUrl}?variables=${JSON.stringify(variables)}&features=${JSON.stringify(features)}`)
        const cookies = getCookie()
        const headers = {
            'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
            'x-twitter-active-user': 'yes',
            'x-twitter-client-language': cookies.lang || 'en',
            'x-csrf-token': cookies.ct0 || ''
        }
        if (cookies.ct0 && cookies.ct0.length === 32) headers['x-guest-token'] = cookies.gt || ''
        const resp = await fetch(url, { headers })
        if (!resp.ok) throw new Error(`API ${resp.status}`)
        const json = await resp.json()
        let result = json.data && json.data.tweetResult && json.data.tweetResult.result
        if (!result) throw new Error('Empty response')
        const tweet = result.tweet || result
        const core = result.core || tweet.core
        const apiName = core && core.user_results && core.user_results.result &&
            core.user_results.result.legacy && core.user_results.result.legacy.name
        if (apiName && displayName === screenName && screenName !== 'me') displayName = apiName
        return tweet
    }

    function extractMediaUrls(tweetJson) {
        const results = []
        const tweet = tweetJson.legacy || tweetJson
        const medias = tweet.extended_entities && tweet.extended_entities.media
        if (!Array.isArray(medias)) return results

        let keepByDate = true
        if (SETTINGS.cutoffDate && tweet.created_at) {
            const tweetDate = new Date(tweet.created_at)
            const cutoff = new Date(SETTINGS.cutoffDate + 'T00:00:00Z')
            if (!isNaN(tweetDate) && !isNaN(cutoff)) {
                keepByDate = tweetDate < cutoff
            }
        }

        if (!keepByDate) return results

        medias.forEach((media) => {
            let url = media.media_url_https + ':orig'
            if (media.type !== 'photo' && media.video_info && media.video_info.variants) {
                const mp4s = media.video_info.variants.filter(v => v.content_type === 'video/mp4')
                if (mp4s.length > 0) {
                    mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
                    url = mp4s[0].url
                }
            }
            const ext = media.type === 'photo' ? 'jpg' : media.type === 'video' ? 'mp4' : 'mp4'
            const mediaId = url.split('/').pop().split(/[:?]/).shift()
            results.push({ url, filename: `${mediaId}.${ext}`, type: media.type })
        })
        return results
    }

    function $el(sel) { return panelEl && panelEl.querySelector(sel) }

    function createPanel() {
        const id = 'xpd'
        const panel = document.createElement('div')
        panel.id = `${id}-panel`
        const headerHtml = `${LANG.title()}<span id="${id}-settings-toggle">⚙</span>`
        panel.innerHTML = `
            <div id="${id}-header"><span id="${id}-title">📦 ${headerHtml}</span><span id="${id}-close">✕</span></div>
            <div id="${id}-body">
                <div id="${id}-settings" style="display:none">
                    <label style="font-size:12px;color:#536471;display:block;margin-bottom:4px">${LANG.maxCountLabel}</label>
                    <input id="${id}-maxcount" type="number" min="0" value="${SETTINGS.maxCount}" style="width:100%;padding:6px 8px;border:1px solid #cfd9de;border-radius:8px;font-size:13px;margin-bottom:10px;box-sizing:border-box">
                    <label style="font-size:12px;color:#536471;display:block;margin-bottom:4px">${LANG.cutoffLabel}</label>
                    <input id="${id}-cutoff" type="date" value="${SETTINGS.cutoffDate}" style="width:100%;padding:6px 8px;border:1px solid #cfd9de;border-radius:8px;font-size:13px;margin-bottom:10px;box-sizing:border-box">
                    <div id="${id}-allviews-row" style="margin-bottom:10px">
                        <label style="font-size:12px;color:#536471;display:flex;align-items:center;gap:6px;cursor:pointer">
                            <input id="${id}-allviews" type="checkbox" ${SETTINGS.allViews ? 'checked' : ''} style="margin:0">${LANG.allViewsLabel}
                        </label>
                    </div>
                    <button id="${id}-savesettings" style="width:100%;padding:6px;border:none;border-radius:50px;background:#1d9bf0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;text-align:center">${LANG.save}</button>
                </div>
                <div id="${id}-info">${LANG.found(0)} · ${LANG.media(0)}</div>
                <div id="${id}-progress-bar"><div id="${id}-progress-fill"></div></div>
                <div id="${id}-status">${LANG.idle}</div>
                <div id="${id}-log"></div>
                <button id="${id}-btn">${LANG.btnStart}</button>
            </div>`
        const style = document.createElement('style')
        style.textContent = `#${id}-panel{position:fixed;z-index:99999;bottom:20px;right:20px;width:280px;background:#fff;border:1px solid #cfd9de;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.15);font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f1419;user-select:none;overflow:hidden}#${id}-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1d9bf0;color:#fff;font-weight:600}#${id}-settings-toggle{cursor:pointer;opacity:.8;margin-left:8px}#${id}-settings-toggle:hover{opacity:1}#${id}-close{cursor:pointer;opacity:.8;font-size:18px}#${id}-close:hover{opacity:1}#${id}-body{padding:12px 16px 16px}#${id}-info{font-size:13px;color:#536471;margin-bottom:8px}#${id}-progress-bar{height:4px;background:#e0e0e0;border-radius:2px;margin-bottom:8px;overflow:hidden;display:none}#${id}-progress-fill{height:100%;width:0%;background:#1d9bf0;border-radius:2px;transition:width .3s}#${id}-status{font-size:13px;color:#536471;margin-bottom:10px}#${id}-log{font-size:11px;line-height:1.5;max-height:80px;overflow-y:auto;margin-bottom:8px;padding:4px 0}#${id}-log .log-succ{color:#00ba7c}#${id}-log .log-fail{color:#f4212e}#${id}-btn{width:100%;padding:10px;border:none;border-radius:50px;background:#1d9bf0;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}#${id}-btn:hover{background:#1a8cd8}#${id}-btn:disabled{background:#8ecdf8;cursor:not-allowed}#${id}-settings{padding:8px 0;border-bottom:1px solid #eee;margin-bottom:8px}`
        document.head.appendChild(style)
        document.body.appendChild(panel)
        panel.querySelector(`#${id}-close`).onclick = () => {
            panel.style.display = 'none'
            minimized = true
            if (!miniBtnEl) {
                miniBtnEl = document.createElement('div')
                miniBtnEl.id = `${id}-mini`
                miniBtnEl.textContent = '📦'
                miniBtnEl.title = LANG.title()
                miniBtnEl.style.cssText = 'position:fixed;z-index:99999;bottom:20px;right:20px;width:44px;height:44px;background:#1d9bf0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:transform .2s'
                miniBtnEl.onmouseenter = () => { miniBtnEl.style.transform = 'scale(1.1)' }
                miniBtnEl.onmouseleave = () => { miniBtnEl.style.transform = 'scale(1)' }
                miniBtnEl.onclick = () => {
                    miniBtnEl.remove()
                    miniBtnEl = null
                    minimized = false
                    panel.style.display = ''
                }
                document.body.appendChild(miniBtnEl)
            }
        }
        panel.querySelector(`#${id}-settings-toggle`).onclick = () => {
            settingsVisible = !settingsVisible
            const el = panel.querySelector(`#${id}-settings`)
            if (el) el.style.display = settingsVisible ? 'block' : 'none'
        }
        panel.querySelector(`#${id}-savesettings`).onclick = () => {
            const max = parseInt(panel.querySelector(`#${id}-maxcount`).value) || 0
            const date = panel.querySelector(`#${id}-cutoff`).value || ''
            const allViews = panel.querySelector(`#${id}-allviews`).checked
            SETTINGS.maxCount = max
            SETTINGS.cutoffDate = date
            SETTINGS.allViews = allViews
            GM_setValue('maxCount', max.toString())
            GM_setValue('cutoffDate', date)
            GM_setValue('allViews', allViews ? '1' : '0')
            panel.querySelector(`#${id}-savesettings`).textContent = LANG.saved
            setTimeout(() => { panel.querySelector(`#${id}-savesettings`).textContent = LANG.save }, 1500)
        }
        panelEl = panel
        progressEl = panel.querySelector(`#${id}-progress-bar`)
        btnEl = panel.querySelector(`#${id}-btn`)
        btnEl.onclick = onDownloadClick
        setAllViewsVisible()
    }

    function setAllViewsVisible() {
        const el = $el('#xpd-allviews-row')
        if (el) el.style.display = PAGE_TYPE === 'media' ? '' : 'none'
    }

    function setPanelInfo(text) { const el = $el('#xpd-info'); if (el) el.textContent = text }
    function setPanelStatus(text) { const el = $el('#xpd-status'); if (el) el.textContent = text }
    function setPanelProgress(pct) {
        if (!progressEl) return; progressEl.style.display = 'block'
        const fill = progressEl.querySelector('#xpd-progress-fill')
        if (fill) fill.style.width = pct + '%'
    }
    function setBtnState(text, disabled) { btnEl.textContent = text; btnEl.disabled = !!disabled }
    function resetPanel() { setPanelProgress(0); setPanelStatus(LANG.idle); setBtnState(LANG.btnStart, false) }
    function clearLog() {
        const el = $el('#xpd-log')
        if (el) el.innerHTML = ''
    }
    function addLog(type, msg) {
        const el = $el('#xpd-log')
        if (!el) return
        const t = new Date().toTimeString().slice(0, 8)
        const cls = type === 'succ' ? 'log-succ' : 'log-fail'
        const line = document.createElement('div')
        line.className = cls
        line.textContent = `${t} · ${msg}`
        el.appendChild(line)
        el.scrollTop = el.scrollHeight
    }

    function collectVisibleTweets() {
        const items = document.querySelectorAll(STRATEGY.selector)
        let newCount = 0
        items.forEach(el => {
            if (!STRATEGY.hasMedia(el)) return
            const statusId = extractStatusId(el)
            if (statusId && !collectedStatusIds.has(statusId)) { collectedStatusIds.add(statusId); newCount++ }
        })
        if (newCount > 0) updateInfo()
    }

    function updateInfo() {
        let text = `${LANG.found(collectedStatusIds.size)} · ${LANG.media(totalMediaCount)}`
        if (expectedMediaCount > 0) {
            const label = PAGE_TYPE === 'likes' ? 'Total likes' : 'Expected'
            setPanelInfo(`${label} ~${expectedMediaCount} · Got ${collectedStatusIds.size} · ${LANG.media(totalMediaCount)}`)
        } else {
            setPanelInfo(text)
        }
    }

    async function scrollToLoadAll() {
        let staleRounds = 0
        const maxStale = 6
        setBtnState(LANG.btnScrolling, true)
        while (staleRounds < maxStale) {
            setPanelStatus(`${LANG.btnScrolling} (no new: ${staleRounds}/${maxStale})`)
            const before = collectedStatusIds.size
            if (clickRetryButton()) await sleep(3000)
            window.scrollTo(0, document.documentElement.scrollHeight)
            window.dispatchEvent(new Event('scroll'))
            await sleep(1500)
            window.scrollBy(0, -400)
            window.dispatchEvent(new Event('scroll'))
            await sleep(600)
            window.scrollTo(0, document.documentElement.scrollHeight)
            window.dispatchEvent(new Event('scroll'))
            await sleep(2000)
            collectVisibleTweets()
            const targetMet = PAGE_TYPE === 'media' && expectedMediaCount > 0 && collectedStatusIds.size >= expectedMediaCount
            if (targetMet) break
            if (collectedStatusIds.size === before) staleRounds++
            else staleRounds = 0
        }
    }

    // X now splits the media tab into views: /media (Videos) and /media?filter=photo (Photos).
    // Switch views via SPA navigation (X uses the history package — it listens for popstate).
    function spaNavigate(url) {
        history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }

    function getMediaViews() {
        const currentUrl = location.href.split('#')[0]
        const filter = new URLSearchParams(location.search).get('filter')
        const base = `${location.origin}${location.pathname.replace(/\/+$/, '')}`
        if (filter === 'photo') {
            return [{ url: currentUrl, label: 'Photos' }, { url: base, label: 'Videos' }]
        }
        return [{ url: currentUrl, label: 'Videos' }, { url: `${base}?filter=photo`, label: 'Photos' }]
    }

    async function waitForViewContent(beforeSize, timeoutMs) {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            collectVisibleTweets()
            if (collectedStatusIds.size > beforeSize) return true
            await sleep(500)
        }
        return false
    }

    async function collectAllMediaViews() {
        const views = getMediaViews()
        const origUrl = views[0].url
        for (let i = 0; i < views.length; i++) {
            const view = views[i]
            setPanelStatus(LANG.viewLabel(i + 1, views.length, view.label))
            if (view.url !== location.href.split('#')[0]) {
                spaNavigate(view.url)
                const before = collectedStatusIds.size
                if (!(await waitForViewContent(before, 10000))) {
                    addLog('fail', LANG.viewFail(view.label))
                }
            }
            await scrollToLoadAll()
        }
        if (views.length > 1) spaNavigate(origUrl)
    }

    async function onDownloadClick() {
        if (isDownloading) return
        isDownloading = true
        setBtnState(LANG.btnScrolling, true)
        try {
            if (displayName === screenName && collectedStatusIds.size > 0) {
                try { await fetchTweetJson([...collectedStatusIds][0]) } catch (e) { console.warn('fetch display name failed:', e) }
            }
            const allMedia = []
            let fetchDone = false

            const fetchTask = (async () => {
                const fetched = new Set()
                while (!fetchDone) {
                    const toFetch = [...collectedStatusIds].filter(id => !fetched.has(id))
                    if (toFetch.length > 0) {
                        for (let i = 0; i < toFetch.length; i += 4) {
                            const batch = toFetch.slice(i, i + 4)
                            const results = await Promise.allSettled(batch.map(id => fetchTweetJson(id)))
                            results.forEach((r, idx) => {
                                const id = batch[idx]
                                fetched.add(id)
                                if (r.status === 'fulfilled') {
                                    try {
                                        const list = extractMediaUrls(r.value)
                                        const namePrefix = `${sanitizeName(displayName)}@${screenName}`
                                        list.forEach((m, i) => {
                                            const ext = m.filename.split('.').pop()
                                            const suffix = list.length > 1 ? `_${i + 1}` : ''
                                            m.filename = `${namePrefix}_${id}${suffix}.${ext}`
                                            allMedia.push(m)
                                        })
                                    } catch (e) { console.warn('extract failed:', id, e) }
                                } else console.warn('fetch failed:', id, r.reason)
                            })
                            const done = fetched.size
                            setPanelStatus(`${LANG.btnFetching} (${done}/${collectedStatusIds.size})`)
                            setPanelProgress(Math.min(50, Math.round((done / Math.max(collectedStatusIds.size, 1)) * 50)))
                            await sleep(200)
                        }
                    }
                    await sleep(500)
                }
            })()

            if (PAGE_TYPE === 'media' && SETTINGS.allViews) await collectAllMediaViews()
            else await scrollToLoadAll()
            fetchDone = true
            await fetchTask

            if (allMedia.length === 0) { setPanelStatus(LANG.noMedia); resetPanel(); isDownloading = false; return }

            if (SETTINGS.maxCount > 0 && allMedia.length > SETTINGS.maxCount) {
                allMedia.length = SETTINGS.maxCount
            }

            totalMediaCount = allMedia.length
            updateInfo()
            if (allMedia.length === 0) { setPanelStatus(LANG.noMedia); resetPanel(); isDownloading = false; return }

            setPanelStatus(LANG.btnZipping)
            setPanelProgress(60)
            const folderName = `${sanitizeName(displayName)}@${screenName}`
            const BATCH_SIZE = 500
            let totalAdded = 0
            let batchIndex = 0
            let completeCalled = false

            function finish() {
                if (completeCalled) return; completeCalled = true
                setPanelStatus(`${LANG.complete} (${totalAdded} files)`)
                setPanelProgress(100)
                setBtnState(LANG.complete, true)
                addLog('succ', `Download successful! (${totalAdded} files)`)
                setTimeout(resetPanel, 3000)
                isDownloading = false
            }
            function fail(err) {
                if (completeCalled) return; completeCalled = true
                const msg = err?.details?.current || err?.message || 'unknown error'
                setPanelStatus(`${LANG.error}: ${msg}`)
                addLog('fail', `Download failed! ${msg}`)
                setTimeout(resetPanel, 4000)
                isDownloading = false
            }
            function triggerDownload(url, name) {
                if (/firefox/i.test(navigator.userAgent)) {
                    GM_download({
                        url, name,
                        onload: () => { URL.revokeObjectURL(url) },
                        onerror: (e) => { URL.revokeObjectURL(url); fail(e) }
                    })
                } else {
                    const a = document.createElement('a'); a.href = url; a.download = name
                    document.body.appendChild(a); a.click()
                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
                }
            }

            for (let start = 0; start < allMedia.length; start += BATCH_SIZE) {
                if (completeCalled) break
                const batch = allMedia.slice(start, start + BATCH_SIZE)
                batchIndex++
                const zip = new JSZip()
                const folder = zip.folder(folderName)
                let batchAdded = 0

                for (const m of batch) {
                    setPanelStatus(`${LANG.btnZipping} batch ${batchIndex} (${batchAdded + 1}/${batch.length})`)
                    setPanelProgress(60 + Math.round(((start + batchAdded) / allMedia.length) * 30))
                    try {
                        const resp = await fetch(m.url, { headers: { Referer: `https://${host}/` } })
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                        const buf = await resp.arrayBuffer()
                        folder.file(m.filename, new Uint8Array(buf))
                        batchAdded++
                    } catch (e) { console.warn('fetch media failed:', m.url, e) }
                }

                if (batchAdded === 0) continue
                totalAdded += batchAdded
                setPanelStatus(`Creating ZIP ${batchIndex}...`)
                setPanelProgress(90 + Math.round((start / allMedia.length) * 10))
                const blob = await zip.generateAsync({ type: 'blob', streamFiles: true })
                const url = URL.createObjectURL(blob)
                const suffix = allMedia.length > BATCH_SIZE ? `_part${batchIndex}` : ''
                triggerDownload(url, `${folderName}${suffix}.zip`)
                await sleep(500)
            }
            finish()
        } catch (e) { console.error(e); addLog('fail', `Download failed! ${e.message}`); setPanelStatus(`${LANG.error}: ${e.message}`); setTimeout(resetPanel, 4000); isDownloading = false }
    }

    function resetState() {
        collectedStatusIds.clear()
        totalMediaCount = 0
        expectedMediaCount = 0
        clearLog()
    }

    function setupNavDetection() {
        const origPush = history.pushState
        const origReplace = history.replaceState
        const onNav = () => {
            const p = location.pathname.replace(/\/+$/, '')
            if (p !== lastPath) {
                lastPath = p
                const isTarget = /\/media$|\/likes$/.test(p)
                if (panelEl) panelEl.style.display = isTarget ? '' : 'none'
                if (miniBtnEl) { miniBtnEl.remove(); miniBtnEl = null; minimized = false }
                if (!isTarget) return
                PAGE_TYPE = /\/likes$/.test(p) ? 'likes' : 'media'
                STRATEGY = getStrategy()
                setAllViewsVisible()
                resetState()
                extractDisplayName()
                expectedMediaCount = findExpectedCount()
                collectVisibleTweets()
                updateInfo()
            }
        }
        history.pushState = function (...a) { origPush.apply(this, a); setTimeout(onNav, 100) }
        history.replaceState = function (...a) { origReplace.apply(this, a); setTimeout(onNav, 100) }
        window.addEventListener('popstate', onNav)
    }

    function init() {
        extractDisplayName()
        expectedMediaCount = findExpectedCount()
        createPanel()
        setupNavDetection()
        collectVisibleTweets()
        new MutationObserver(() => collectVisibleTweets()).observe(document.body, { childList: true, subtree: true })
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
    else init()
})()
