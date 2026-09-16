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

function sanitizeHtml(html) {
  if (!html) return '';
  // Remove script tags
  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  // Remove inline event handlers like onclick, onload
  html = html.replace(/\son[a-zA-Z]+=("[^"]*"|'[^']*')/gi, '');
  // Neutralize javascript: URIs in href/src
  html = html.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
  html = html.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
  return html;
}

async function fetchPublishXEmbed(origUrl, options = {}) {
  const ttlDays = typeof options.ttlDays === 'number' ? options.ttlDays : 7;
  const pubUrl = 'https://publish.x.com/?query=' + encodeURIComponent(origUrl) + '&widget=Tweet';
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

    const res = await safeFetch(pubUrl);
    if (!res || !res.ok) return null;
    const text = await res.text();

    // Try to extract a sensible embed: prefer blockquote.twitter-tweet, then any blockquote, then a div/article
    let match = text.match(/<blockquote[^>]*class=["'][^"']*twitter-tweet[^"']*["'][\s\S]*?<\/blockquote>/i);
    if (!match) match = text.match(/<blockquote[\s\S]*?<\/blockquote>/i);
    if (!match) match = text.match(/<div[^>]*class=["'][^"']*(tweet|twitter)[^"']*["'][\s\S]*?<\/div>/i);
    if (!match) match = text.match(/<article[\s\S]*?<\/article>/i);

    const extracted = match ? match[0] : text;
    const sanitized = sanitizeHtml(extracted);

    try {
      fs.writeFileSync(cacheFile, sanitized, 'utf8');
    } catch (e) {
      // ignore cache write failures
    }
    return sanitized;
  } catch (e) {
    return null;
  }
}

module.exports = { fetchPublishXEmbed };