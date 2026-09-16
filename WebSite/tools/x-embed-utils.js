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
  if (typeof fetch === 'function') return fetch(url);
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
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
      })
      .on('error', reject);
  });
}

async function fetchPublishXEmbed(origUrl, options = {}) {
  const ttlDays = typeof options.ttlDays === 'number' ? options.ttlDays : 7;

  // X (Twitter) の公式 oEmbed API エンドポイントを利用
  const oembedUrl = 'https://publish.twitter.com/oembed?url=' + encodeURIComponent(origUrl) + '&theme=dark';
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
    if (!res || !res.ok) return null;

    const text = await res.text();
    const data = JSON.parse(text);

    // APIから返される html プロパティ（<blockquote ...>...</blockquote><script ...></script>）を取得
    if (data && data.html) {
      // 必要に応じて <script> タグを除外する場合はここで除去（HTML側で widgets.js を読み込んでいる場合）
      const embedHtml = data.html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

      try {
        fs.writeFileSync(cacheFile, embedHtml, 'utf8');
      } catch (e) {}

      return embedHtml;
    }

    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { fetchPublishXEmbed };
