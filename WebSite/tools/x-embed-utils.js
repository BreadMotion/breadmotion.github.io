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
          // X (Twitter) API から拒否されないよう User-Agent を明示的に追加
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      const req = https.get(options, (res) => {
        // フォローが必要なリダイレクト応答を受け取った場合
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers && res.headers.location) {
          if (maxRedirects > 0) {
            const loc = res.headers.location.startsWith('http')
              ? res.headers.location
              : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
            // 再帰的にフォロー（maxRedirects をデクリメント）
            resolve(safeFetch(loc, maxRedirects - 1));
            return;
          }
          // リダイレクト上限に達した
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

  // X公式 oEmbed API エンドポイント
  const key = hashUrl(origUrl);
  const cacheFile = path.join(CACHE_DIR, `${key}.html`);

  try {
    // キャッシュ確認
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < ttlDays * 24 * 60 * 60 * 1000) {
        return fs.readFileSync(cacheFile, 'utf8');
      }
    }

    let html = '';
    try {
      const m = origUrl.match(/status\/(\d+)/);
      if (m && m[1]) {
        const id = m[1];
        // TODO: fallback やめろ
        const iframeSrc = `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`;
        html = `<div class="x-embed-iframe-fallback"><iframe src="${iframeSrc}" width="100%" height="400" frameborder="0" scrolling="no" allowtransparency="true"></iframe></div>`;
      }
    } catch (e) {}

    let embedHtml = `<div class="x-embed-wrapper">${html}</div>`;
    try {
      fs.writeFileSync(cacheFile, embedHtml, 'utf8');
    } catch (e) {}

    return embedHtml;
  } catch (e) {
    // ネットワーク/DNS エラーなどは警告にし、可能なら cache を返す
    console.warn(`[WARN] fetchPublishXEmbed error: ${e.message}`);
    if (fs.existsSync(cacheFile)) {
      try { return fs.readFileSync(cacheFile, 'utf8'); } catch (e) {}
    }
    return null;
  }
}

module.exports = { fetchPublishXEmbed };
