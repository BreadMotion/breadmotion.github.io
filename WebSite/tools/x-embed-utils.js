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

    // Try publish.twitter.com oEmbed (omit script) for server-side HTML embed
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(origUrl)}&theme=dark&omit_script=true&dnt=true`;
      const res = await safeFetch(oembedUrl);
      if (res && res.ok) {
        const txt = await res.text();
        try {
          const data = JSON.parse(txt);
          if (data && data.html) {
            const embedHtml = `<div class="x-embed-wrapper">${data.html}</div>`;
            try { fs.writeFileSync(cacheFile, embedHtml, 'utf8'); } catch (e) {}
            return embedHtml;
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
