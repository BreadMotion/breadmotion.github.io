/**
 * @file build-portfolio.js
 * @description Markdown からポートフォリオページ HTML と portfolioList.json を生成するスクリプト
 * @summary
 *   - content/portfolio 内の .md ファイルを読み込み、portfolio/ ディレクトリに HTML を生成
 *   - サムネイル画像のダウンロードと管理（Base64、URL、ローカルパス対応）
 *   - assets/data/portfolioList.json の更新
 * @recent_changes
 *   - 簡易ロガー関数を追加（本番環境では verbose ログを抑制）
 *   - 冗長なコンソール出力を削減
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { fetchPublishXEmbed } = require("./x-embed-utils");

// ───────────────────────────────────────────────────────────────
// 簡易ロガー: NODE_ENV !== 'production' の場合のみ verbose 出力
// ───────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";
const logger = {
  info: (msg) =>
    !isProduction && console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
};

const ROOT = path.join(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "portfolio");
const OUTPUT_DIR = path.join(ROOT, "portfolio");
const LIST_JSON = path.join(
  ROOT,
  "assets",
  "data",
  "portfolioList.json",
);

const THUMBNAIL_DIR = path.join(
  ROOT,
  "assets",
  "img",
  "thumbnails",
);

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"]/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }[c];
  });
}

function escapeHtmlAttr(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

function createXEmbedMarkup(url) {
  const safeUrl = escapeHtmlAttr(url || "");
  // Emit a blockquote with an empty anchor; this matches Twitter's expected markup
  // and avoids inserting visible fallback link text that appears when widgets don't run.
  return `<blockquote class="twitter-tweet x-embed-fallback" data-dnt="true" data-theme="dark" data-x-url="${safeUrl}"><a href="${safeUrl}"></a></blockquote>`;
}

function createEmbedInitScript() {
  return `<script>(function(){var s=document.currentScript;var container=s.previousElementSibling||s.parentNode;function extractIdFromUrl(url){try{if(!url) return null;var parts=url.split('?')[0].split('/').filter(Boolean);var last=parts[parts.length-1]||'';var m=last.match(/\\d+/);return m?m[0]:null;}catch(e){return null;}}function tryLoad(){try{if(window.twttr&&window.twttr.widgets&&typeof window.twttr.widgets.load==='function'){try{window.twttr.widgets.load(container);}catch(e){}return;}if(window.twttr&&window.twttr.widgets&&typeof window.twttr.widgets.createTweet==='function'){var bq=container.querySelectorAll('blockquote.twitter-tweet');bq.forEach(function(el){try{var a=el.querySelector('a[href]');var url=(a&&a.href)||el.getAttribute('data-x-url')||'';var id=extractIdFromUrl(url);if(id){var tgt=document.createElement('div');el.parentNode.replaceChild(tgt,el);window.twttr.widgets.createTweet(id,tgt,{theme:'dark'});} }catch(e){} });return;} }catch(e){}setTimeout(tryLoad,200);}tryLoad();})();</script>`;
}

// 作品ページ HTML テンプレート
function createHtml({
  id,
  title,
  description,
  date,
  category,
  role,
  tech,
  tags = [],
  bodyHtml,
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || "");
  const safeDate = escapeHtml(date || "");
  const safeCategory = escapeHtml(category || "");
  const safeRole = escapeHtml(role || "");
  const safeTech = escapeHtml(tech || "");

  // tags を配列として正規化・エスケープ（既にある場合）
  const safeTagsArr = Array.isArray(tags)
    ? tags
        .map((t) => String(t).trim())
        .filter(Boolean)
        .map((t) => escapeHtml(t))
    : String(tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => escapeHtml(t));

  const tagsHtml = safeTagsArr.length
    ? `<p class="work-detail__tags">${safeTagsArr
        .map(
          (t) =>
            `<a class="tag" href="../portfolio.html?tag=${encodeURIComponent(
              t,
            )}">${t}</a>`,
        )
        .join(" ")}</p>`
    : "";

  // meta 部分は存在する要素だけを配列に入れて " / " で join する
  const metaParts = [];
  if (safeDate) metaParts.push(safeDate);
  if (safeCategory) metaParts.push(safeCategory);
  if (safeRole) metaParts.push(`Role: ${safeRole}`);
  const metaText = metaParts.join(" / ");

  return `<!doctype html>
<html lang="ja">
  <head prefix="og: https://ogp.me/ns#">
    <meta charset="UTF-8" />
    <title>${safeTitle} | PanKUN Portfolio</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${safeDesc}" />
    <link rel="canonical" href="https://breadmotion.github.io/WebSite/portfolio/${id}.html" />

    <!-- Performance hints -->
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
    <link rel="preload" as="image" href="https://breadmotion.github.io/WebSite/assets/img/ogp.png">

    <script>(function(){if(window.__TWITTER_WIDGETS_LOADER)return;window.__TWITTER_WIDGETS_LOADER=true;function injectWidgets(){if(document.querySelector('script[src*="platform.twitter.com/widgets.js"]'))return;var s=document.createElement('script');s.src='https://platform.twitter.com/widgets.js';s.async=true;s.crossOrigin='anonymous';s.onload=function(){try{if(window.twttr&&window.twttr.widgets&&typeof window.twttr.widgets.load==='function'){window.twttr.widgets.load();}}catch(e){}};s.onerror=function(){console.warn('x: widgets.js failed to load');};document.head.appendChild(s);}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',injectWidgets);}else{injectWidgets();}})();</script>

    <meta property="og:title" content="${safeTitle} | PanKUN Portfolio" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="https://breadmotion.github.io/WebSite/assets/img/ogp.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="PanKUN" />
    <meta property="og:email" content="pankun.dev@gmail.com" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="https://breadmotion.github.io/WebSite/assets/img/ogp.png" />

    <script type="application/ld+json">${JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: safeTitle,
        description: safeDesc,
        image: [
          `https://breadmotion.github.io/WebSite/assets/img/ogp.png`,
        ],
        url: `https://breadmotion.github.io/WebSite/portfolio/${id}.html`,
        datePublished: date || "",
        author: {
          "@type": "Person",
          name: "PanKUN",
          url: "https://breadmotion.github.io/WebSite/",
          sameAs: [
            "https://github.com/breadmotion",
            "https://x.com/pankun2000_",
          ],
        },
      },
      null,
      2,
    )}</script>

    <link rel="icon" type="image/x-icon" href="https://breadmotion.github.io/favicon.ico" />
    <link rel="icon" type="image/png" href="https://breadmotion.github.io/assets/img/favicon-32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="https://breadmotion.github.io/assets/img/favicon-192.png" sizes="192x192" />

    <link rel="stylesheet" href="../assets/css/base.css" />
    <link rel="stylesheet" href="../assets/css/layout.css" />
    <link rel="stylesheet" href="../assets/css/portfolio.css" />
    <link rel="stylesheet" href="../assets/css/preview.css" />
  </head>
  <body data-page="portfolio">
    <div class="page-shell">
      <main class="main-container">
        <article class="work-detail reveal-on-scroll">
          <header class="work-detail__header">
            <p class="work-detail__meta">${metaText}</p>
            <h1 class="work-detail__title">${safeTitle}</h1>
            ${
              safeDesc
                ? `<p class="work-detail__description">${safeDesc}</p>`
                : ""
            }
            ${
              safeTech
                ? `<p class="work-detail__meta">Tech: ${safeTech}</p>`
                : ""
            }
            ${tagsHtml}
          </header>

          <section class="work-detail__body markdown-body">
${bodyHtml}
          </section>
        </article>
      </main>
    </div>

    <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
    <script>
          (function checkTwttr() {
            if (window.twttr && window.twttr.widgets) {
              // widgets.js の読み込み完了後に、DOM上の blockquote を全スキャンしてカード化
              window.twttr.widgets.load();
            } else {
              // まだ読み込まれていない場合は 100ms 後に再試行
              setTimeout(checkTwttr, 100);
            }
          })();
        </script>
    <script>
          // DOMレンダリング後に X の埋め込みウィジェットをレンダリング強制実行
          window.addEventListener('DOMContentLoaded', function() {
            if (window.twttr && window.twttr.widgets) {
              window.twttr.widgets.load();
            }
          });
        </script>
    <script src="../assets/js/x-feed.js" defer data-embed-style="native_embed"></script>
    <script src="../assets/js/layout.js" defer></script>
    <script src="../assets/js/ui.js" defer></script>
    <script src="../assets/js/preview.js" defer></script>

    <canvas id="menuAnimationCanvas"></canvas>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js" defer></script>
    <script src="../assets/js/particles.js" defer></script>
  </body>
</html>`;
}

// メイン処理（marked は ESM なので dynamic import）
(async () => {
  const { marked } = await import("marked");

  // 出力先ディレクトリが無ければ作る
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
  }

  const works = [];
  const files = fs.existsSync(CONTENT_DIR)
    ? fs
        .readdirSync(CONTENT_DIR)
        .filter((f) => f.endsWith(".md"))
    : [];
  const usedThumbnails = new Set();

  for (const file of files) {
    const id = path.basename(file, ".md"); // work_0001 など
    const fullPath = path.join(CONTENT_DIR, file);
    const raw = fs.readFileSync(fullPath, "utf8");

    const { data, content: rawContent } = matter(raw);

    // Support [!CARD], [!WILDCARD], [!X] embeds (CARD / WILDCARD use OGP, X uses publish.x if available)
    // Helper: fetch basic OGP/title/description/image and domain
    async function fetchOgp(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const html = await res.text();

        const getMeta = (prop) => {
          const regex = new RegExp(`<meta\\s+(?:property|name)="${prop}"\\s+content=\"([^\"]+)\"`, "i");
          const m = html.match(regex);
          return m ? m[1] : "";
        };

        const title = getMeta("og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
        const description = getMeta("og:description") || getMeta("description");
        const image = getMeta("og:image");
        let domain = "";
        try { domain = new URL(url).hostname; } catch (e) {}
        return { title, description, image, domain, url };
      } catch (e) {
        return null;
      }
    }

    function createLinkCardHtml(ogp, type) {
      const isWide = type === "WILDCARD";

      if (isWide) {
        const imageHtml = ogp.image
          ? `<span class="og-image-wide"><img src="${escapeHtmlAttr(ogp.image)}" alt="${escapeHtmlAttr(ogp.title)}" loading="lazy"><span class="og-title-overlay">${escapeHtml(ogp.title)}</span></span>`
          : `<span class="og-image-wide no-image"><span class="og-title-overlay">${escapeHtml(ogp.title)}</span></span>`;

        return `<a href="${escapeHtmlAttr(ogp.url)}" class="og-card wide" target="_blank" rel="noopener noreferrer">${imageHtml}<span class="og-site-footer">${escapeHtml(ogp.domain)} から</span></a>`;
      } else {
        const imageHtml = ogp.image
          ? `<span class="og-thumbnail"><img src="${escapeHtmlAttr(ogp.image)}" alt="${escapeHtmlAttr(ogp.title)}" loading="lazy"></span>`
          : `<span class="og-thumbnail no-image"></span>`;

        return `<a href="${escapeHtmlAttr(ogp.url)}" class="og-card" target="_blank" rel="noopener noreferrer">${imageHtml}<span class="og-content"><span class="og-site">${escapeHtml(ogp.domain)}</span><span class="og-title">${escapeHtml(ogp.title)}</span><span class="og-description">${escapeHtml(ogp.description)}</span></span></a>`;
      }
    }

    let content = rawContent;
    const linkCardRegex = /\[!(CARD|WILDCARD|X)\]\((.*?)\)/g;
    const matches = [...content.matchAll(linkCardRegex)];
    if (matches.length) {
      const uniqueMatches = Array.from(new Map(matches.map((m) => [m[0], m])).values());
      const replacements = new Map();

      await Promise.all(uniqueMatches.map(async (match) => {
        const type = match[1];
        const url = match[2];
        const key = match[0];

        try {
          if (type === 'X') {
                      // Force client-side blockquote + init script for consistent client rendering and sizing.
                      replacements.set(key, createXEmbedMarkup(url) + createEmbedInitScript());
                      return;
                    }

          const ogp = await fetchOgp(url);
          if (ogp) {
            replacements.set(key, createLinkCardHtml(ogp, type));
          } else {
            replacements.set(key, `[${url}](${url})`);
          }
        } catch (e) {
          logger.warn(`Failed to fetch OGP for ${url}: ${e.message}`);
          replacements.set(key, `[${url}](${url})`);
        }
      }));

      for (const [k, v] of replacements) {
        content = content.split(k).join(v);
      }
    }

    const htmlBody = marked.parse(content);

    const title = data.title || id;
    const description = data.description || "";
    const date = data.date || "";
    const category = data.category || "";
    const role = data.role || "";
    const tech = data.tech || "";
    let thumbnail = typeof data.thumbnail === 'string' ? data.thumbnail.trim() : "";

    if (thumbnail) {
      try {
        if (thumbnail.startsWith("data:image")) {
          const matches = thumbnail.match(
            /^data:image\/([a-zA-Z0-9]+);base64,(.+)$/,
          );
          if (matches) {
            const ext =
              matches[1] === "jpeg" ? "jpg" : matches[1];
            const filename = `${id}.${ext}`;
            const thumbPath = path.join(
              THUMBNAIL_DIR,
              filename,
            );
            fs.writeFileSync(
              thumbPath,
              Buffer.from(matches[2], "base64"),
            );
            thumbnail = `assets/img/thumbnails/${filename}`;
            usedThumbnails.add(filename);
          }
        } else if (thumbnail.startsWith("http")) {
          const urlObj = new URL(thumbnail);
          let ext = path
            .extname(urlObj.pathname)
            .substring(1);
          if (!ext) ext = "png";

          const filename = `${id}.${ext}`;
          const thumbPath = path.join(
            THUMBNAIL_DIR,
            filename,
          );

          logger.info(
            `Downloading thumbnail for ${id} from ${thumbnail}`,
          );
          const res = await fetch(thumbnail);
          if (res.ok) {
            const buffer = Buffer.from(
              await res.arrayBuffer(),
            );
            fs.writeFileSync(thumbPath, buffer);
            thumbnail = `assets/img/thumbnails/${filename}`;
            usedThumbnails.add(filename);
          } else {
            logger.error(
              `Failed to fetch thumbnail for ${id}: ${res.statusText}`,
            );
          }
        } else if (
          thumbnail.includes("assets/img/thumbnails/")
        ) {
          const filename = path.basename(thumbnail);
          usedThumbnails.add(filename);
        }
      } catch (e) {
        logger.error(
          `Failed to process thumbnail for ${id}: ${e.message}`,
        );
      }
    }

    const tagsRaw = data.tags || [];
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw
      : String(tagsRaw)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

    const links = Array.isArray(data.links)
      ? data.links
      : [];
    const relPath = `portfolio/${id}.html`;

    // 個別作品 HTML を書き出し（tags を渡す）
    const html = createHtml({
      id,
      title,
      description,
      date,
      category,
      role,
      tech,
      tags, // ← ここで渡す
      bodyHtml: htmlBody,
    });

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${id}.html`),
      html,
      "utf8",
    );
    logger.info(`Generated: portfolio/${id}.html`);

    // 一覧用データ
    works.push({
      id,
      title,
      date,
      category,
      role,
      description,
      tech,
      tags,
      thumbnail,
      links,
      contentPath: relPath,
    });
  }

  // 日付で新しい順（YYYY-MM-DD 前提）
  works.sort((a, b) => (a.date < b.date ? 1 : -1));

  // JSON に書き出し
  fs.writeFileSync(
    LIST_JSON,
    JSON.stringify(works, null, 2),
    "utf8",
  );
  logger.success("Updated: assets/data/portfolioList.json");

  // Clean up unused portfolio thumbnails
  if (fs.existsSync(THUMBNAIL_DIR)) {
    const allThumbnails = fs.readdirSync(THUMBNAIL_DIR);
    for (const file of allThumbnails) {
      if (
        file.startsWith("portfolio_") &&
        !usedThumbnails.has(file)
      ) {
        logger.info(`Removing unused thumbnail: ${file}`);
        fs.unlinkSync(path.join(THUMBNAIL_DIR, file));
      }
    }
  }
})().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
