const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'x-embeds');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function safeFetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      const req = https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers && res.headers.location) {
          if (maxRedirects > 0) {
            const loc = res.headers.location.startsWith('http')
              ? res.headers.location
              : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
            resolve(safeFetch(loc, maxRedirects - 1));
            return;
          }
          resolve({ ok: false, status: res.statusCode, statusText: 'Too many redirects', text: async () => '' });
          return;
        }

        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            text: async () => data,
            status: res.statusCode,
            statusText: res.statusMessage,
          });
        });
      });

      req.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

function fetchFinalUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const options = {
        method: 'HEAD',
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };
      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers && res.headers.location) {
          if (maxRedirects > 0) {
            const loc = res.headers.location.startsWith('http')
              ? res.headers.location
              : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
            resolve(fetchFinalUrl(loc, maxRedirects - 1));
            return;
          }
          resolve({ ok: false, status: res.statusCode, headers: res.headers, url: urlObj.href });
          return;
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, headers: res.headers, url: urlObj.href });
      });
      req.on('error', (err) => reject(err));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function escapeHtmlAttr(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function sanitizeHtml(html) {
  // Remove any <script> tags for safety (defensive; omit_script=true should already prevent scripts)
  return String(html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

async function fetchPublishXEmbed(origUrl, options = {}) {
  const ttlDays = typeof options.ttlDays === 'number' ? options.ttlDays : 7;

  const key = hashUrl(origUrl);
  const cacheFile = path.join(CACHE_DIR, `${key}.html`);

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < ttlDays * 24 * 60 * 60 * 1000) {
        return fs.readFileSync(cacheFile, 'utf8');
      }
    }

    // Try publish.twitter.com oEmbed (omit script) for server-side HTML embed (static card)
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(origUrl)}&theme=dark&omit_script=true&dnt=true&format=json`;
      const res = await safeFetch(oembedUrl);
      if (res && res.ok) {
        const txt = await res.text();
        try {
          const data = JSON.parse(txt);
          if (data) {
            // sanitize any scripts from returned HTML (omit_script=true should help, but be defensive)
            const sanitizedHtml = sanitizeHtml(data.html || '');

            // Extract tweet text from blockquote if present
            let tweetInnerHtml = '';
            try {
              const bqMatch = sanitizedHtml.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
              if (bqMatch && bqMatch[1]) {
                const pMatch = bqMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                tweetInnerHtml = pMatch && pMatch[1] ? pMatch[1] : bqMatch[1];
              } else {
                const pMatch2 = sanitizedHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                tweetInnerHtml = pMatch2 ? pMatch2[1] : sanitizedHtml;
              }
            } catch (e) {
              tweetInnerHtml = sanitizedHtml;
            }

            // Collect media candidates from oEmbed + original page
            const mediaSet = new Set();
            if (data.thumbnail_url) mediaSet.add(String(data.thumbnail_url));

            // img tags present in oEmbed HTML
            try {
              const imgTagRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
              let m;
              while ((m = imgTagRe.exec(sanitizedHtml)) !== null) {
                if (m[1]) mediaSet.add(m[1]);
              }
            } catch (e) {}

            // Resolve pic.twitter.com / t.co short links found in oEmbed HTML (follow redirects to pbs.twimg.com)
            try {
              const shortLinkRe = /https?:\/\/(?:t\.co|pic\.twitter\.com)\/[^"'\s<]+/gi;
              const found = sanitizedHtml.match(shortLinkRe) || [];
              for (const s of Array.from(new Set(found))) {
                try {
                  const r = await fetchFinalUrl(s);
                  if (r && r.url && /pbs\.twimg\.com/i.test(r.url)) {
                    mediaSet.add(r.url);
                    continue;
                  }
                  // Fallback: GET and search body for pbs links
                  try {
                    const getRes = await safeFetch(s);
                    if (getRes && getRes.ok) {
                      const body = await getRes.text().catch(()=>'') || '';
                      const pbsMatch = body.match(/https?:\/\/pbs\.twimg\.com\/media\/[^"'\s<]+/gi);
                      if (pbsMatch && pbsMatch[0]) mediaSet.add(pbsMatch[0]);
                    }
                  } catch (e) {}
                } catch (e) {}
              }
            } catch (e) {}

            // Try to fetch the original tweet page and parse meta tags for images/videos
            try {
              const pageRes = await safeFetch(origUrl);
              if (pageRes && pageRes.ok) {
                const pageHtml = await pageRes.text();
                const metaRe = /<meta\s+(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
                let mm;
                while ((mm = metaRe.exec(pageHtml)) !== null) {
                  const key = (mm[1] || '').toLowerCase();
                  const val = mm[2];
                  if (!val) continue;
                  if (/^(og:image|twitter:image|og:image:secure_url|twitter:image[0-9]*)$/i.test(key)) {
                    mediaSet.add(val);
                  }
                  if (/^(og:video|og:video:url|og:video:secure_url|twitter:player|twitter:player:stream)$/i.test(key)) {
                    if (/\.(mp4|webm|m3u8|mpd)(?:\?|$)/i.test(val)) {
                      mediaSet.add(val);
                    } else if (/\.(jpe?g|png|gif|webp)(?:\?|$)/i.test(val)) {
                      mediaSet.add(val);
                    }
                  }
                }

                // find pbs.twimg.com media links directly in page HTML
                try {
                  const mediaImgRe = /https?:\/\/pbs\.twimg\.com\/media\/[^"]+/gi;
                  let mm2;
                  while ((mm2 = mediaImgRe.exec(pageHtml)) !== null) {
                    mediaSet.add(mm2[0]);
                  }
                } catch (e) {}
              }
            } catch (e) {
              // ignore network errors
            }

            let medias = Array.from(mediaSet).filter(Boolean);
            let videoThumb = null;
            const videoIndex = medias.findIndex(u => /\.(mp4|webm|m3u8|mpd)(?:\?|$)/i.test(u) || /video/i.test(u));
            if (videoIndex !== -1) {
              videoThumb = medias[videoIndex];
              medias.splice(videoIndex, 1);
            }
            medias = medias.slice(0, 4);

            // Build enhanced static card HTML
            let card = '<div class="x-embed-wrapper"><div class="x-embed-static">';
            if (data.author_name) {
              card += `<div class="x-embed-static-author"><a href="${escapeHtmlAttr(data.author_url || origUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlAttr(data.author_name)}</a></div>`;
            }
            card += `<div class="x-embed-static-body">${tweetInnerHtml}</div>`;

            if (videoThumb) {
              card += `<div class="x-embed-static-media-grid"><a class="x-embed-media-item x-embed-media-video" href="${escapeHtmlAttr(origUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtmlAttr(videoThumb)}" alt="" loading="lazy"><span class="x-embed-play" aria-hidden="true">▶</span></a></div>`;
            } else if (medias.length > 0) {
              card += '<div class="x-embed-static-media-grid">';
              for (const img of medias) {
                card += `<a class="x-embed-media-item" href="${escapeHtmlAttr(origUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtmlAttr(img)}" alt="" loading="lazy"></a>`;
              }
              card += '</div>';
            }

            card += `<div class="x-embed-static-footer"><a href="${escapeHtmlAttr(origUrl)}" target="_blank" rel="noopener noreferrer">View on X</a></div>`;
            card += '</div></div>';
            try { fs.writeFileSync(cacheFile, card, 'utf8'); } catch (e) {}
            return card;
          }
        } catch (e) {
          // ignore parse error
        }
      }
    } catch (e) {
      // ignore
    }

    // fallback: detect tweetId and return simple blockquote (anchor)
    let tweetId = null;
    try {
      const m = origUrl.match(/status\/(\d+)/);
      if (m && m[1]) {
        tweetId = m[1];
      } else {
        try {
          const res = await safeFetch(origUrl);
          if (res && res.ok) {
            const txt = await res.text();
            const mm = txt.match(/https?:\/\/(?:x|twitter)\.com\/[^\"]*status\/(\d+)/);
            if (mm && mm[1]) tweetId = mm[1];
          }
        } catch (e) {}
      }
    } catch (e) {}

    if (tweetId) {
      const safeUrl = String(origUrl).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const html = `<blockquote class="twitter-tweet x-embed-fallback" data-dnt="true" data-theme="dark" data-x-url="${safeUrl}"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open on X (opens in a new tab)">View on X</a></blockquote>`;
      const embedHtml = `<div class="x-embed-wrapper">${html}</div>`;
      try { fs.writeFileSync(cacheFile, embedHtml, 'utf8'); } catch (e) {}
      return embedHtml;
    }

    return null;
  } catch (e) {
    console.warn(`[WARN] fetchPublishXEmbed error: ${e.message}`);
    if (fs.existsSync(cacheFile)) {
      try { return fs.readFileSync(cacheFile, 'utf8'); } catch (e) {}
    }
    return null;
  }
}

module.exports = { fetchPublishXEmbed };
