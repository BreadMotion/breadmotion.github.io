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

function safeFetch(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        // X (Twitter) API から拒否されないよう User-Agent を明示的に追加
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    https.get(options, (res) => {
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
    }).on('error', reject);
  });
}

async function fetchPublishXEmbed(origUrl, options = {}) {
  const ttlDays = typeof options.ttlDays === 'number' ? options.ttlDays : 7;

  // X公式 oEmbed API エンドポイント
  const oembedUrl = 'https://publish.twitter.com/oembed?url=' + encodeURIComponent(origUrl) + '&theme=dark&dnt=true';
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

    const res = await safeFetch(oembedUrl);
    if (!res || !res.ok) {
      console.warn(`[WARN] oEmbed fetch failed for ${origUrl}`);
      return null;
    }

    const text = await res.text();
    const data = JSON.parse(text);

    if (data && data.html) {
      // 1. レスポンスから script タグを除去
      let embedHtml = data.html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();

      // 2. ラッパー要素で包む
      embedHtml = `<div class="x-embed-wrapper">${embedHtml}</div>`;

      try {
        fs.writeFileSync(cacheFile, embedHtml, 'utf8');
      } catch (e) {}

      return embedHtml;
    }

    return null;
  } catch (e) {
    console.error(`[ERROR] fetchPublishXEmbed error: ${e.message}`);
    return null;
  }
}

module.exports = { fetchPublishXEmbed };
