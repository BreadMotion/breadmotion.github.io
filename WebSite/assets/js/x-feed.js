/* assets/js/x-feed.js
 * Fetch assets/x-feed.json (generated at build time) and render latest 3 media posts.
 * Also provides a data-x-url / .x-embed helper to embed any X post on any page.
 *
 * Usage: include this script with a data-embed-style attribute (native_embed | thumbnail_link).
 * Example (Japanese index): <script src="assets/js/x-feed.js" defer data-embed-style="native_embed"></script>
 */
(function () {
    'use strict';

    var currentScript = document.currentScript || (function () {
        var s = document.getElementsByTagName('script');
        return s[s.length - 1];
    })();

    var scriptSrc = (currentScript && currentScript.src) || '';
    var embedStyle = (currentScript && currentScript.getAttribute('data-embed-style')) || 'native_embed';

    function computeFeedUrl() {
        if (!scriptSrc) {
            // Fallback: try common locations relative to the page
            return document.location.pathname.indexOf('/en/') !== -1 ? '../assets/x-feed.json' : 'assets/x-feed.json';
        }
        // Replace /js/x-feed.js with /x-feed.json
        return scriptSrc.replace(/\/js\/x-feed\.js(\?.*)?$/, '/x-feed.json');
    }

    function loadWidgets(callback) {
        if (window.twttr && window.twttr.widgets) {
            callback && callback();
            return;
        }
        var existing = document.querySelector('script[src*="platform.twitter.com/widgets.js"]');
        if (existing) {
            if (existing.addEventListener) existing.addEventListener('load', callback || function () {});
            else if (existing.attachEvent) existing.attachEvent('onload', callback || function () {});
            return;
        }
        var s = document.createElement('script');
        s.src = 'https://platform.twitter.com/widgets.js';
        s.async = true;
        s.onload = function () { callback && callback(); };
        s.onerror = function () { callback && callback(); };
        document.head.appendChild(s);
    }

    function renderPosts(posts, container) {
        if (!Array.isArray(posts) || !container) return;
        container.innerHTML = '';
        var list = posts.slice(0, 3);
        if (embedStyle === 'thumbnail_link') {
            list.forEach(function (p) {
                var a = document.createElement('a');
                a.href = p.url || (p.permalink && p.permalink.url) || '#';
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                var img = document.createElement('img');
                img.src = (p.media_urls && p.media_urls[0]) || p.media_url || '';
                img.alt = 'X post media';
                img.style.maxWidth = '100%';
                img.style.display = 'block';
                a.appendChild(img);
                container.appendChild(a);
            });
            return;
        }

        // native_embed
        list.forEach(function (p) {
            if (p.oembed_html) {
                var wrap = document.createElement('div');
                wrap.innerHTML = p.oembed_html;
                container.appendChild(wrap);
                return;
            }
            var blockquote = document.createElement('blockquote');
            blockquote.className = 'twitter-tweet';
            var a = document.createElement('a');
            a.href = p.url || (p.permalink && p.permalink.url) || '#';
            blockquote.appendChild(a);
            container.appendChild(blockquote);
        });

        loadWidgets(function () {
            try {
                if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                    window.twttr.widgets.load(container);
                }
            } catch (e) {
                console.warn('x-feed: widgets load failed', e);
            }
        });
    }

    function fetchAndRenderFeed() {
        var feedUrl = computeFeedUrl();
        fetch(feedUrl, { cache: 'no-cache' }).then(function (resp) {
            if (!resp.ok) throw new Error('feed not found');
            return resp.json();
        }).then(function (json) {
            var posts = [];
            if (Array.isArray(json)) posts = json;
            else if (Array.isArray(json.posts)) posts = json.posts;
            else if (Array.isArray(json.items)) posts = json.items;
            else if (Array.isArray(json.tweets)) posts = json.tweets;

            if (!posts.length) return;
            var container = document.getElementById('xMediaFeed');
            if (container) renderPosts(posts, container);
        }).catch(function (err) {
            // silently fail -- feed may not be generated yet
            // console.info('x-feed: fetch failed', err);
        });
    }

    function processInlineEmbeds() {
        var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-x-url], .x-embed'));
        if (!nodes.length) return;
        nodes.forEach(function (node) {
            var url = node.getAttribute('data-x-url') || node.dataset.xUrl || node.getAttribute('data-url') || '';
            if (!url) return;
            var wrapper = document.createElement('div');
            var blockquote = document.createElement('blockquote');
            blockquote.className = 'twitter-tweet';
            var a = document.createElement('a');
            a.href = url;
            blockquote.appendChild(a);
            wrapper.appendChild(blockquote);
            node.parentNode.replaceChild(wrapper, node);
        });
        loadWidgets(function () {
            try {
                if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                    window.twttr.widgets.load();
                }
            } catch (e) {
                console.warn('x-feed: widgets load failed', e);
            }
        });
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            fetchAndRenderFeed();
            processInlineEmbeds();
        });
    } else {
        fetchAndRenderFeed();
        processInlineEmbeds();
    }
})();