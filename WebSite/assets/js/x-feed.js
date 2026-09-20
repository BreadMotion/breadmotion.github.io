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
            var fallback = document.location.pathname.indexOf('/en/') !== -1 ? '../assets/x-feed.json' : 'assets/x-feed.json';
            console.debug('x-feed: computeFeedUrl fallback ->', fallback);
            return fallback;
        }
        // Replace /js/x-feed.js with /x-feed.json
        var result = scriptSrc.replace(/\/js\/x-feed\.js(\?.*)?$/, '/x-feed.json');
        console.debug('x-feed: computeFeedUrl ->', result);
        return result;
    }

    function ensureWidgets(callback, options) {
        options = options || {};
        console.debug('x-feed: ensureWidgets start', options);
        var maxAttempts = typeof options.maxAttempts === 'number' ? options.maxAttempts : 10;
        var interval = typeof options.interval === 'number' ? options.interval : 200;

        function done() {
            try {
                if (typeof callback === 'function') {
                    console.debug('x-feed: widgets ready - invoking callback');
                    callback();
                } else {
                    console.debug('x-feed: widgets ready - no callback provided');
                }
            } catch (e) {
                console.warn('x-feed: widgets callback error', e);
            }
        }

        if (window.twttr && window.twttr.widgets) {
            done();
            return;
        }

        var existing = document.querySelector('script[src*="platform.x.com/widgets.js"]');
        if (!existing) {
            var s = document.createElement('script');
            s.src = 'https://platform.x.com/widgets.js';
            s.async = true;
            s.onerror = function () {
                // ignore; we'll poll for twttr availability
                console.debug('x-feed: widgets.js script.onerror fired');
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
                console.debug('x-feed: widgets available after', attempts, 'attempts');
                done();
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(poll);
                console.debug('x-feed: widgets not available after maxAttempts, giving up');
                // give one final attempt to call done (graceful degradation)
                done();
            }
        }, interval);
    }

    function renderEmptyState(container, message) {
        if (!container) return;
        container.innerHTML = '<p class="x-feed-empty">' + (message || '最新のX投稿を読み込めませんでした。') + '</p>';
    }

    function renderPosts(posts, container) {
        if (!Array.isArray(posts) || !container) return;
        console.debug('x-feed: renderPosts called, posts length:', posts.length, 'container id:', container && container.id);
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
                    console.debug('x-feed: widgets.load(container) invoked');
                    window.twttr.widgets.load(container);
                } else {
                    console.debug('x-feed: widgets.load not available at time of call');
                }
            } catch (e) {
                console.warn('x-feed: widgets load failed', e);
            }

            // After a short delay, if the blockquote hasn't been converted to an iframe,
            // try to create embeds programmatically via twttr.widgets.createTweet as a fallback.
            setTimeout(function () {
                try {
                    console.debug('x-feed: createTweet fallback attempt');
                    if (!container.querySelector('iframe') && window.twttr && window.twttr.widgets && typeof window.twttr.widgets.createTweet === 'function') {
                        var blockquotes = container.querySelectorAll('blockquote.twitter-tweet');
                        console.debug('x-feed: createTweet fallback - found blockquotes count', blockquotes.length);
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
                                    console.debug('x-feed: createTweet for id', id, 'url', url);
                                    // Replace blockquote with a wrapper and create the tweet
                                    var target = document.createElement('div');
                                    bq.parentNode.replaceChild(target, bq);
                                    window.twttr.widgets.createTweet(id, target, { theme: 'dark' });
                                } catch (err) {
                                    console.warn('x-feed: createTweet error for id', id, err);
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.warn('x-feed: createTweet fallback failed', err);
                }
            }, 600);

            // Extra attempt: schedule a later full-scan load to catch late-arriving scripts (adblock / slow network)
            setTimeout(function () {
                try {
                    console.debug('x-feed: scheduled full-scan load at 2000ms');
                    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                        window.twttr.widgets.load(container);
                    }
                } catch (e) {
                    console.warn('x-feed: scheduled full-scan load failed', e);
                }
            }, 2000);
        }, { maxAttempts: 15, interval: 200 });
    }

    function fetchAndRenderFeed() {
        var feedUrl = computeFeedUrl();
        var container = document.getElementById('xMediaFeed');
        console.debug('x-feed: fetching', feedUrl);

        fetch(feedUrl, { cache: 'no-cache' }).then(function (resp) {
            if (!resp.ok) throw new Error('feed not found');
            return resp.json();
        }).then(function (json) {
            var posts = [];
            if (Array.isArray(json)) posts = json;
            else if (Array.isArray(json.posts)) posts = json.posts;
            else if (Array.isArray(json.items)) posts = json.items;
            else if (Array.isArray(json.tweets)) posts = json.tweets;

            console.debug('x-feed: feed parsed, posts length', posts.length);

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
        console.debug('x-feed: processInlineEmbeds nodes', nodes.length);
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
                console.debug('x-feed: replacing node with blockquote for url', url);
                node.parentNode.replaceChild(wrapper, node);
            }
        });
        ensureWidgets(function () {
            try {
                if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                    console.debug('x-feed: widgets.load() for inline embeds');
                    window.twttr.widgets.load();
                }
            } catch (e) {
                console.warn('x-feed: widgets load failed', e);
            }

            // Fallback: try programmatic creation of embeds for inline blockquotes
            setTimeout(function () {
                try {
                    console.debug('x-feed: inline createTweet fallback attempt');
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
                                    console.debug('x-feed: inline createTweet for id', id, 'url', url);
                                    var target = document.createElement('div');
                                    bq.parentNode.replaceChild(target, bq);
                                    window.twttr.widgets.createTweet(id, target, { theme: 'dark' });
                                } catch (err) {
                                    console.warn('x-feed: inline createTweet error for id', id, err);
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.warn('x-feed: inline createTweet fallback failed', err);
                }
            }, 600);
        }, { maxAttempts: 15, interval: 200 });
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            console.debug('x-feed: DOMContentLoaded - initializing');
            fetchAndRenderFeed();
            processInlineEmbeds();
        });
    } else {
        console.debug('x-feed: DOM already ready - initializing');
        fetchAndRenderFeed();
        processInlineEmbeds();
    }
})();
