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

    function ensureWidgets(callback, options) {
        options = options || {};
        var maxAttempts = typeof options.maxAttempts === 'number' ? options.maxAttempts : 10;
        var interval = typeof options.interval === 'number' ? options.interval : 200;

        function done() {
            try {
                if (typeof callback === 'function') callback();
            } catch (e) {
                console.warn('x-feed: widgets callback error', e);
            }
        }

        if (window.twttr && window.twttr.widgets) {
            done();
            return;
        }

        var existing = document.querySelector('script[src*="platform.twitter.com/widgets.js"]');
        if (!existing) {
            var s = document.createElement('script');
            s.src = 'https://platform.twitter.com/widgets.js';
            s.async = true;
            s.onerror = function () {
                // ignore; we'll poll for twttr availability
            };
            document.head.appendChild(s);
        } else {
            try {
                if (existing.addEventListener) existing.addEventListener('load', done);
                else if (existing.attachEvent) existing.attachEvent('onload', done);
            } catch (e) {
                // ignore
            }
        }

        var attempts = 0;
        var poll = setInterval(function () {
            attempts++;
            if (window.twttr && window.twttr.widgets) {
                clearInterval(poll);
                done();
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(poll);
                // give one final attempt to call done (graceful degradation)
                done();
            }
        }, interval);
    }

    // Ensure embed iframes get a reasonable height when widgets.js loads them.
    // Some environments (adblock, slow network) cause widgets to leave small inline heights.
    // This helper watches for inserted Twitter iframes and enforces a minimum / sensible height.
    function ensureEmbedSizing(container) {
        container = container || document;
        var attempts = 0;
        var maxAttempts = 20;
        var interval = 300;
        var timer = setInterval(function () {
            attempts++;
            var iframes = Array.prototype.slice.call(container.querySelectorAll('iframe[src*="platform.twitter.com"], iframe[src*="twimg.com"], iframe[src*="twitter.com"]'));
            iframes.forEach(function (iframe) {
                try {
                    // apply conservative sizing heuristics
                    iframe.style.minHeight = '450px';
                    iframe.style.maxHeight = 'none';
                    // if inline height is small or not set, bump it
                    var h = parseInt(iframe.style.height, 10);
                    if (isNaN(h) || h < 450) {
                        // prefer measured offsetHeight if available
                        var measured = iframe.offsetHeight || 0;
                        var newH = Math.max(450, measured, 450);
                        iframe.style.height = newH + 'px';
                    }
                    // ensure visibility
                    iframe.style.visibility = 'visible';
                    iframe.style.opacity = '1';
                } catch (e) {
                    // ignore
                }
            });

            var remainingBQ = container.querySelectorAll('blockquote.twitter-tweet').length;
            if (attempts >= maxAttempts || (remainingBQ === 0 && iframes.length > 0)) {
                clearInterval(timer);
            }
        }, interval);
    }

    function renderEmptyState(container, message) {
        if (!container) return;
        container.innerHTML = '<p class="x-feed-empty">' + (message || '最新のX投稿を読み込めませんでした。') + '</p>';
    }

    function renderPosts(posts, container) {
        if (!Array.isArray(posts) || !container) return;
        container.innerHTML = '';
        var list = posts.slice(0, 3);

        if (!list.length) {
            renderEmptyState(container, 'Xの最新投稿はまだありません。');
            return;
        }

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

        ensureWidgets(function () {
            try {
                if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                    window.twttr.widgets.load(container);
                    // attempt to fix sizing immediately after load
                    try { ensureEmbedSizing(container); } catch (e) {}
                }
            } catch (e) {
                console.warn('x-feed: widgets load failed', e);
            }

            // After a short delay, if the blockquote hasn't been converted to an iframe,
            // try to create embeds programmatically via twttr.widgets.createTweet as a fallback.
            setTimeout(function () {
                try {
                    if (!container.querySelector('iframe') && window.twttr && window.twttr.widgets && typeof window.twttr.widgets.createTweet === 'function') {
                        var blockquotes = container.querySelectorAll('blockquote.twitter-tweet');
                        blockquotes.forEach(function (bq) {
                            // Try to find a tweet URL inside the blockquote
                            var link = bq.querySelector('a[href]');
                            var url = (link && link.href) || bq.getAttribute('data-x-url') || '';
                            var parts = (url || '').split('?')[0].split('/').filter(Boolean);
                            var last = parts[parts.length-1] || '';
                            var idMatch = last.match(/\d+/);
                            if (idMatch && idMatch[0]) {
                                var id = idMatch[0];
                                try {
                                    // Replace blockquote with a wrapper and create the tweet
                                    var target = document.createElement('div');
                                    bq.parentNode.replaceChild(target, bq);
                                    window.twttr.widgets.createTweet(id, target, { theme: 'dark' });
                                } catch (err) {
                                    // ignore per-tweet errors
                                }
                            }
                        });
                        // After creating tweets, attempt sizing adjustments
                        try { ensureEmbedSizing(container); } catch (e) {}
                    }
                } catch (err) {
                    // ignore fallback failures
                }
            }, 600);

            // Extra attempt: schedule a later full-scan load to catch late-arriving scripts (adblock / slow network)
            setTimeout(function () {
                try {
                    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                        window.twttr.widgets.load(container);
                        try { ensureEmbedSizing(container); } catch (e) {}
                    }
                } catch (e) {}
            }, 2000);
        }, { maxAttempts: 15, interval: 200 });
    }

    function fetchAndRenderFeed() {
        var feedUrl = computeFeedUrl();
        var container = document.getElementById('xMediaFeed');

        fetch(feedUrl, { cache: 'no-cache' }).then(function (resp) {
            if (!resp.ok) throw new Error('feed not found');
            return resp.json();
        }).then(function (json) {
            var posts = [];
            if (Array.isArray(json)) posts = json;
            else if (Array.isArray(json.posts)) posts = json.posts;
            else if (Array.isArray(json.items)) posts = json.items;
            else if (Array.isArray(json.tweets)) posts = json.tweets;

            if (!posts.length) {
                renderEmptyState(container, 'Xの最新投稿はまだありません。');
                return;
            }
            if (container) renderPosts(posts, container);
        }).catch(function (err) {
            console.warn('x-feed: fetch failed', err);
            renderEmptyState(container, 'Xの投稿を読み込めませんでした。');
        });
    }

    function processInlineEmbeds() {
        var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-x-url], .x-embed, blockquote.twitter-tweet'));
        if (!nodes.length) return;
        nodes.forEach(function (node) {
            if (node.tagName === 'BLOCKQUOTE' && node.classList && node.classList.contains('twitter-tweet')) {
                var existingUrl = node.getAttribute('data-x-url') || node.dataset.xUrl || node.getAttribute('data-url') || '';
                var existingLink = node.querySelector('a[href]');
                if (!existingUrl && existingLink) {
                    existingUrl = existingLink.href;
                    node.setAttribute('data-x-url', existingUrl);
                }
                if (existingUrl) {
                    node.setAttribute('data-x-url', existingUrl);
                }
                return;
            }

            var url = node.getAttribute('data-x-url') || node.dataset.xUrl || node.getAttribute('data-url') || '';
            if (!url) return;
            var wrapper = document.createElement('div');
            var blockquote = document.createElement('blockquote');
            blockquote.className = 'twitter-tweet';
            blockquote.setAttribute('data-dnt', 'true');
            blockquote.setAttribute('data-theme', 'dark');
            var a = document.createElement('a');
            a.href = url;
            blockquote.appendChild(a);
            wrapper.appendChild(blockquote);
            if (node.parentNode) {
                node.parentNode.replaceChild(wrapper, node);
            }
        });
        ensureWidgets(function () {
            try {
                if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                    window.twttr.widgets.load();
                    try { ensureEmbedSizing(document); } catch (e) {}
                }
            } catch (e) {
                console.warn('x-feed: widgets load failed', e);
            }

            // Fallback: try programmatic creation of embeds for inline blockquotes
            setTimeout(function () {
                try {
                    if (!document.querySelector('iframe') && window.twttr && window.twttr.widgets && typeof window.twttr.widgets.createTweet === 'function') {
                        var blockquotes = document.querySelectorAll('blockquote.twitter-tweet');
                        blockquotes.forEach(function (bq) {
                            var link = bq.querySelector('a[href]');
                            var url = (link && link.href) || bq.getAttribute('data-x-url') || '';
                            var parts = (url || '').split('?')[0].split('/').filter(Boolean);
                            var last = parts[parts.length-1] || '';
                            var idMatch = last.match(/\d+/);
                            if (idMatch && idMatch[0]) {
                                var id = idMatch[0];
                                try {
                                    var target = document.createElement('div');
                                    bq.parentNode.replaceChild(target, bq);
                                    window.twttr.widgets.createTweet(id, target, { theme: 'dark' });
                                } catch (err) {}
                            }
                        });
                        try { ensureEmbedSizing(document); } catch (e) {}
                    }
                } catch (err) {}
            }, 600);
        }, { maxAttempts: 15, interval: 200 });
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