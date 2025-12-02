/**
 * @file build-blog.js
 * @description Markdown ブログ記事から HTML ページと blogList.json を生成するスクリプト
 * @summary
 *   - content/blog 内の .md ファイルを読み込み、blog/ ディレクトリに HTML を生成
 *   - 日本語版と英語版（.en.md）を別々に処理
 *   - サムネイル画像のダウンロードと管理
 *   - assets/data/blogList.json / blogList_en.json の更新
 *   - Giscus コメント埋め込み対応（環境変数で有効化）
 *   - いいね / ブックマーク UI の埋め込み（クライアント実装を別ファイルで提供）
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const locales = require("./locales");

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
const CONTENT_DIR = path.join(ROOT, "content", "blog");
const OUTPUT_DIR = path.join(ROOT, "blog");
const LIST_JSON_JA = path.join(
  ROOT,
  "assets",
  "data",
  "blogList.json",
);
const LIST_JSON_EN = path.join(
  ROOT,
  "assets",
  "data",
  "blogList_en.json",
);
const AD_SCRIPT_PATH = path.join(
  ROOT,
  "partials",
  "ad-script.html",
);

const THUMBNAIL_DIR = path.join(
  ROOT,
  "assets",
  "img",
  "thumbnails",
);

const BASE_URL = "https://breadmotion.github.io/WebSite";

// ---------------------------
// Giscus 設定（環境変数で設定）
// ---------------------------
const COMMENT_PROVIDER = process.env.COMMENT_PROVIDER || "";
const GISCUS_REPO =
  process.env.GISCUS_REPO ||
  "BreadMotion/breadmotion.github.io";
const GISCUS_REPO_ID = process.env.GISCUS_REPO_ID || "";
const GISCUS_CATEGORY =
  process.env.GISCUS_CATEGORY || "Comments";
const GISCUS_CATEGORY_ID =
  process.env.GISCUS_CATEGORY_ID || "";
const GISCUS_THEME = process.env.GISCUS_THEME || "light";
const GISCUS_MAPPING =
  process.env.GISCUS_MAPPING || "og:title";
const GISCUS_ENABLED =
  COMMENT_PROVIDER === "giscus" ||
  (GISCUS_REPO_ID && GISCUS_CATEGORY_ID);

// ---------------------------
// POST / Like API ベース URL
// 環境変数 POST_API_URL を設定すると上書きします。
// デフォルトは GAS Web App URL を使用。
// ---------------------------
const POST_API_URL =
  process.env.POST_API_URL ||
  "https://script.google.com/macros/s/AKfycbyWEVYHX1dV4HidCrmaTHO6wWsFR4xZo1VM_c9AC53aj7MxSM3W4_UAFR1fGd9RC-1n/exec";

// ---------------------------
// helper: XML/HTML escape
// ---------------------------
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"]/g, (c) => {
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      }[c] || c
    );
  });
}

// helper: Escape for HTML attribute (including single quotes)
function escapeHtmlAttr(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => {
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] || c
    );
  });
}

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const da = ("0" + d.getDate()).slice(-2);
  return `${y}/${m}/${da}`;
}

function createTocHtml(headings, locale) {
  if (!headings || headings.length === 0) return "";
  const filteredHeadings = headings.filter(
    (h) => h.level === 2 || h.level === 3,
  );
  if (filteredHeadings.length === 0) return "";

  let tocHtml = '<ul class="toc-list">';
  for (const heading of filteredHeadings) {
    tocHtml += `<li class="toc-item toc-item--level-${heading.level}"><a href="#${heading.id}" data-no-preview>${escapeHtml(heading.text)}</a></li>`;
  }
  tocHtml += "</ul>";
  return tocHtml;
}

/**
 * Helper: タイトルを最大長で切り詰め（マルチバイト安全）
 *  - デフォルト最大長は 20 文字（指定可能）
 *  - 切り詰めた場合は末尾に "…" を付与
 */
function truncateTitle(str = "", max = 10) {
  if (!str) return "";
  const arr = Array.from(String(str));
  return arr.length > max
    ? arr.slice(0, max).join("") + "…"
    : String(str);
}

/**
 * Helper: prev/next ナビ HTML を組み立てる
 * - prev/next は postsMap の要素（{id, title, contentPath, ...}）
 * - locale はロケールオブジェクト（locale.back_to_blog などを利用）
 * - lang は 'ja' か 'en'（ラベルのデフォルト選択などに使用）
 */
function buildPrevNextNavHtml(prev, next, locale, lang) {
  const prevLabel =
    locale && locale.prev_label
      ? locale.prev_label
      : lang === "ja"
        ? "前の記事"
        : "Previous";
  const nextLabel =
    locale && locale.next_label
      ? locale.next_label
      : lang === "ja"
        ? "次の記事"
        : "Next";
  const maxLen = 13;

  let html =
    '<div class="post-detail__nav post-detail__nav--bottom">';
  // 前の記事（左）
  if (prev) {
    const prevHref = path.basename(prev.contentPath);
    const prevTitle = truncateTitle(
      prev.title || prev.id,
      maxLen,
    );
    html += `<a href="${prevHref}" class="btn btn--prev">← ${escapeHtml(prevTitle)}</a>`;
  }

  // 中央: 一覧へ戻る（既存ロケール文言）
  const blogHref =
    lang === "ja" ? "../blog.html" : "../blog.html"; // 生成ファイルは同ディレクトリ内なので ../blog.html works for both (en files are inside blog/en/)
  html += `<a href="${blogHref}" class="btn btn--back">${locale.back_to_blog}</a>`;

  // 次の記事（右）
  if (next) {
    const nextHref = path.basename(next.contentPath);
    const nextTitle = truncateTitle(
      next.title || next.id,
      maxLen,
    );
    html += `<a href="${nextHref}" class="btn btn--next">${escapeHtml(nextTitle)} →</a>`;
  }

  html += "</div>";
  return html;
}

function createShareButtonsHtml(title, url, locale) {
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);
  const shareTitle = locale.share_title;
  const labelSuffix = locale.share_label_suffix;

  const services = [
    {
      name: "Twitter",
      url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>`,
      className: "twitter",
    },
    {
      name: "Facebook",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4z"></path></svg>`,
      className: "facebook",
    },
    {
      name: "LINE",
      url: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2.5 24 24" width="24" height="24" fill="currentColor"><path d="M19.914 9.003a6.741 6.741 0 0 1-.764 2.2c-.179.324-1.056 1.558-1.325 1.884-1.478 1.788-3.953 3.851-8.092 5.857a.545.545 0 0 1-.78-.552l.21-1.885a.545.545 0 0 0-.483-.604C3.781 15.388 0 12.04 0 7.986 0 3.576 4.476 0 9.997 0c5.366 0 9.744 3.377 9.987 7.615.007.123.026.516.01.78-.011.16-.034.365-.08.608zm-15.414.6V6.24a.512.512 0 1 0-1.023 0v3.877c0 .284.23.514.512.514h2.045a.512.512 0 0 0 0-1.027H4.5zm3.154 1.028a.4.4 0 0 0 .4-.401V6.128a.4.4 0 0 0-.4-.402h-.223a.4.4 0 0 0-.4.402v4.102a.4.4 0 0 0 .4.4h.223zm4.133-4.391v2.369s-2.042-2.676-2.074-2.71a.508.508 0 0 0-.4-.172.527.527 0 0 0-.492.534v3.856a.512.512 0 1 0 1.023 0V7.763s2.073 2.698 2.104 2.727c.09.086.211.14.346.14.284.003.516-.249.516-.534V6.24a.512.512 0 1 0-1.023 0zm4.858 0a.512.512 0 0 0-.512-.514h-2.045a.512.512 0 0 0-.511.514v3.877c0 .284.229.514.511.514h2.045a.512.512 0 0 0 0-1.027H14.6v-.912h1.534a.512.512 0 0 0 0-1.027H14.6v-.912h1.534c.283 0 .512-.23.512-.513z"/></svg>`,
      className: "line",
    },
  ];

  return `<div class="share-buttons">
    <p class="share-buttons__title">${shareTitle}</p>
    <ul class="share-buttons__list">
      ${services
        .map(
          (service) => `
        <li class="share-buttons__item">
          <a href="${service.url}" class="share-buttons__link share-buttons__link--${service.className}" target="_blank" rel="noopener noreferrer" aria-label="${service.name}${labelSuffix}">
            ${service.icon}
          </a>
        </li>
      `,
        )
        .join("")}
    </ul>
  </div>`;
}

// ---------------------------
// Giscus snippet generator
// ---------------------------
function makeGiscusHtml(locale) {
  // 必須: GISCUS_REPO_ID と GISCUS_CATEGORY_ID が必要
  if (!GISCUS_REPO_ID || !GISCUS_CATEGORY_ID) {
    logger.warn(
      "Giscus enabled but GISCUS_REPO_ID or GISCUS_CATEGORY_ID is missing.",
    );
  }

  const commentTitle = locale.comment_title || "Comments";

  // Escape JSON for HTML attribute to prevent XSS
  const giscusConfig = escapeHtmlAttr(
    JSON.stringify({
      repo: GISCUS_REPO,
      repoId: GISCUS_REPO_ID,
      category: GISCUS_CATEGORY,
      categoryId: GISCUS_CATEGORY_ID,
      mapping: GISCUS_MAPPING,
      theme: GISCUS_THEME,
    }),
  );

  // Lazy-load: Giscus script is loaded only when the comment section is visible
  return `<section class="section section--comments">
    <h2 class="section__title">${escapeHtml(commentTitle)}</h2>
    <div id="comments" class="post-comments">
      <div class="giscus-placeholder" data-giscus-config='${giscusConfig}'>
        <p class="giscus-loading">${escapeHtml(locale.comment_loading || "Loading comments...")}</p>
      </div>
    </div>
  </section>
  <script>
  (function() {
    var placeholder = document.querySelector('.giscus-placeholder');
    if (!placeholder) return;
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          observer.disconnect();
          try {
            var config = JSON.parse(placeholder.getAttribute('data-giscus-config'));
            var script = document.createElement('script');
            script.src = 'https://giscus.app/client.js';
            script.setAttribute('data-repo', config.repo);
            script.setAttribute('data-repo-id', config.repoId);
            script.setAttribute('data-category', config.category);
            script.setAttribute('data-category-id', config.categoryId);
            script.setAttribute('data-mapping', config.mapping);
            script.setAttribute('data-strict', '0');
            script.setAttribute('data-reactions-enabled', '1');
            script.setAttribute('data-emit-metadata', '0');
            script.setAttribute('data-input-position', 'bottom');
            script.setAttribute('data-theme', config.theme);
            script.setAttribute('crossorigin', 'anonymous');
            script.async = true;
            placeholder.innerHTML = '';
            placeholder.appendChild(script);
          } catch (e) {
            console.error('Failed to load Giscus comments:', e);
            placeholder.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">Failed to load comments.</p>';
          }
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(placeholder);
  })();
  </script>`;
}

function createHtml({
  id,
  title,
  description,
  date,
  category,
  tags = [],
  bodyHtml,
  tocHtml,
  thumbnail,
  adScript = "",
  locale,
  lang,
  relativePrefix,
  commentHtml = "",
}) {
  const pathPrefix = lang === "ja" ? ".." : "../..";
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || "");
  const safeDate = escapeHtml(formatDate(date));
  const safeCategory = escapeHtml(category || "");
  const safeTagsArr = (
    Array.isArray(tags)
      ? tags
      : String(tags || "").split(",")
  )
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((t) => escapeHtml(t));

  const tagsHtml = safeTagsArr.length
    ? `<p class="post-detail__tags">${safeTagsArr.map((t) => `<a class="tag" href="${pathPrefix}/blog.html?tag=${encodeURIComponent(t)}">${t}</a>`).join(" ")}</p>`
    : "";

  const canonicalUrl =
    lang === "ja"
      ? `${BASE_URL}/blog/${id}.html`
      : `${BASE_URL}/blog/en/${id}.html`;

  const shareButtonsHtml = createShareButtonsHtml(
    title,
    canonicalUrl,
    locale,
  );

  // ----- ここで Like / Bookmark UI を組み立て -----
  const likeLabel =
    locale.like_button ||
    (locale.lang === "ja" ? "いいね" : "Like");
  const bookmarkLabel =
    locale.bookmark_button ||
    (locale.lang === "ja" ? "ブックマーク" : "Bookmark");

  const postActionsHtml = `
    <div class="post-actions" aria-hidden="false">
      <button type="button" class="btn btn--icon btn-like" data-post-id="${escapeHtmlAttr(id)}" aria-pressed="false" aria-label="${escapeHtmlAttr(likeLabel)}">
        <span class="icon-like" aria-hidden="true">❤</span>
        <span class="like-count">0</span>
      </button>
      <button type="button" class="btn btn--icon btn-bookmark" data-post-id="${escapeHtmlAttr(id)}" aria-pressed="false" aria-label="${escapeHtmlAttr(bookmarkLabel)}">
        <span class="icon-bookmark" aria-hidden="true">🔖</span>
      </button>
    </div>
  `;

  let imageUrl = thumbnail;

  if (imageUrl && !imageUrl.startsWith("http")) {
    const cleanPath = imageUrl
      .replace(/^(\.\.\/)+/, "")
      .replace(/^\/+/, "");
    imageUrl = `${BASE_URL}/${cleanPath}`;
  } else if (!imageUrl) {
    imageUrl = `${BASE_URL}/assets/img/ogp.png`;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    headline: title,
    description: description || "",
    image: [imageUrl],
    datePublished: date,
    dateModified: date,
    author: {
      "@type": "Person",
      name: "PanKUN",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "PanKUN",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/assets/img/favicon-192.png`,
      },
    },
  };

  const jaUrl = `${BASE_URL}/blog/${id}.html`;
  const enUrl = `${BASE_URL}/blog/en/${id}.html`;

  // クライアント設定（POST API など）をページに埋め込む
  const clientConfig = {
    apiUrl: POST_API_URL || "",
    postId: id,
  };

  return `<!doctype html>
<html lang="${locale.lang}">
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle}${locale.site_title_suffix}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${safeDesc}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <link rel="alternate" hreflang="ja" href="${jaUrl}" />
    <link rel="alternate" hreflang="en" href="${enUrl}" />
    <link rel="alternate" hreflang="x-default" href="${enUrl}" />
    ${adScript}
    <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
    <meta property="og:title" content="${safeTitle}${locale.site_title_suffix}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:site_name" content="PanKUN" />
    <link rel="shortcut icon" href="${pathPrefix}/../favicon.ico">
    <link rel="icon" type="image/png" href="${pathPrefix}/assets/img/favicon-32.png" sizes="32x32">
    <link rel="icon" type="image/png" href="${pathPrefix}/assets/img/favicon-192.png" sizes="192x192">
    <link rel="apple-touch-icon" href="${pathPrefix}/assets/img/favicon-192.png">
    <link rel="stylesheet" href="${pathPrefix}/assets/css/base.css" />
    <link rel="stylesheet" href="${pathPrefix}/assets/css/layout.css" />
    <link rel="stylesheet" href="${pathPrefix}/assets/css/blog.css" />
    <link rel="stylesheet" href="${pathPrefix}/assets/css/preview.css" />
    <link rel="stylesheet" href="${pathPrefix}/assets/css/post-interactions.css" />
  </head>
  <body data-page="blog" data-post-id="${escapeHtmlAttr(id)}">
    <div class="page-shell">
      <main class="main-container">
        <div class="post-layout">
          <div class="post-content reveal-on-scroll">
            <article class="post-detail">
              <nav aria-label="breadcrumb" class="breadcrumb">
                <ol class="breadcrumb__list">
                  <li class="breadcrumb__item"><a href="${pathPrefix}/index.html">${locale.breadcrumb_home}</a></li>
                  <li class="breadcrumb__item"><a href="${pathPrefix}/blog.html">${locale.breadcrumb_blog}</a></li>
                  <li class="breadcrumb__item" aria-current="page">${safeTitle}</li>
                </ol>
              </nav>
              <header class="post-detail__header">
                <p class="post-detail__meta">${safeDate}${safeCategory ? " / " + safeCategory : ""}</p>
                <h1 class="post-detail__title">${safeTitle}</h1>
                ${safeDesc ? `<p class="post-detail__description">${safeDesc}</p>` : ""}
                ${tagsHtml}
                ${postActionsHtml}
                ${shareButtonsHtml}
              </header>
              <section class="post-detail__body markdown-body reveal-on-scroll">${bodyHtml}</section>
              ${shareButtonsHtml}
              <div class="post-detail__nav post-detail__nav--bottom">
                <a href="${pathPrefix}/blog.html" class="btn btn--back">${locale.back_to_blog}</a>
              </div>
            </article>
          </div>
          <aside class="post-sidebar">
            <div class="toc-sticky-container">
              <nav class="toc">
                <h2 class="toc__title">${locale.toc_title}</h2>
                ${tocHtml}
              </nav>
            </div>
          </aside>
        </div>
        <section class="section section--related">
          <h2 class="section__title">${locale.related_title}</h2>
          <div id="relatedList" class="recommend-grid"></div>
        </section>
        <section class="section section--recommend">
          <h2 class="section__title">${locale.recommended_title}</h2>
          <div id="recommendList" class="recommend-grid"></div>
        </section>
         ${commentHtml}
      </main>
      <div class="toc-overlay"></div>
      <button type="button" class="toc-toggle" aria-label="${locale.toc_button_label}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"></path></svg>
        <span>${locale.toc_button_text}</span>
      </button>
    </div>

    <!-- 生成時に埋め込むクライアント設定 -->
    <script>window.__POST_INTERACTIONS_CONFIG = ${JSON.stringify(clientConfig)};</script>

    <script src="${pathPrefix}/assets/js/layout.js" defer></script>
    <script src="${pathPrefix}/assets/js/ui.js"></script>
    <script src="${pathPrefix}/assets/js/post-interactions.js" defer></script>
    <script src="${pathPrefix}/assets/js/preview.js"></script>
    <canvas id="menuAnimationCanvas"></canvas>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js"></script>
    <script src="${pathPrefix}/assets/js/particles.js"></script>
    <script src="${pathPrefix}/assets/js/toc.js" defer></script>
    <script src="${pathPrefix}/assets/js/recommend.js" defer></script>
  </body>
</html>`;
}

(async () => {
  const { marked } = await import("marked");

  const enOutputDir = path.join(OUTPUT_DIR, "en");

  if (!fs.existsSync(OUTPUT_DIR))
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(enOutputDir))
    fs.mkdirSync(enOutputDir, { recursive: true });
  if (!fs.existsSync(THUMBNAIL_DIR))
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

  const adScript = fs.existsSync(AD_SCRIPT_PATH)
    ? fs.readFileSync(AD_SCRIPT_PATH, "utf8")
    : "";

  const postsMap = {
    ja: [],
    en: [],
  };

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md"));
  const ids = new Set();
  const usedThumbnails = new Set();
  files.forEach((f) => {
    if (f.endsWith(".en.md")) {
      ids.add(path.basename(f, ".en.md"));
    } else {
      ids.add(path.basename(f, ".md"));
    }
  });

  for (const id of ids) {
    const jaPath = path.join(CONTENT_DIR, `${id}.md`);
    const enPath = path.join(CONTENT_DIR, `${id}.en.md`);

    if (!fs.existsSync(jaPath)) {
      logger.warn(
        `Japanese content not found for ID: ${id}`,
      );
      continue;
    }

    for (const lang of ["ja", "en"]) {
      let sourcePath = jaPath;
      if (lang === "en" && fs.existsSync(enPath)) {
        sourcePath = enPath;
      }

      const locale = locales[lang] || locales.ja;
      const relativePrefix = lang === "ja" ? ".." : "../..";

      // DEBUG: ロケールの主要キーが揃っているか確認（問題の切り分け用）
      logger.info(
        `Generating ${id} (${lang}) - locale keys: ${Object.keys(locale).join(", ")}`,
      );

      const raw = fs.readFileSync(sourcePath, "utf8");
      const { data, content } = matter(raw);

      const headings = [];
      const slugger = new marked.Slugger();
      const renderer = new marked.Renderer();
      renderer.heading = (text, level) => {
        const id = slugger.slug(text);
        headings.push({ level, text, id });
        return `<h${level} id="${id}">${text}</h${level}>`;
      };

      renderer.image = (href, title, text) => {
        let src = href;
        if (src && src.startsWith("../")) {
          src = `${relativePrefix}/${src.substring(3)}`;
        }
        return `<img src="${src}" alt="${text}" title="${title || ""}" />`;
      };

      const htmlBody = marked.parse(content, { renderer });
      const tocHtml = createTocHtml(headings, locale);

      const { title, description, date, category } = data;
      let { thumbnail } = data;

      if (thumbnail) {
        try {
          if (thumbnail.startsWith("http")) {
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
              `Downloading thumbnail for ${id} (${lang}) from ${thumbnail}`,
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
      const tags = (
        Array.isArray(tagsRaw)
          ? tagsRaw
          : String(tagsRaw).split(",")
      )
        .map((t) => String(t).trim())
        .filter(Boolean);

      // -------------------------
      // コメント HTML を決定（Giscus）
      // -------------------------
      const commentHtml = GISCUS_ENABLED
        ? makeGiscusHtml(locale)
        : "";

      const html = createHtml({
        id,
        title: title,
        description: description || "",
        date: date || "",
        category: category || "",
        tags,
        bodyHtml: htmlBody,
        tocHtml,
        thumbnail,
        adScript,
        locale,
        lang,
        relativePrefix,
        commentHtml,
      });

      const outputFilePath =
        lang === "ja"
          ? path.join(OUTPUT_DIR, `${id}.html`)
          : path.join(enOutputDir, `${id}.html`);

      fs.writeFileSync(outputFilePath, html, "utf8");
      logger.info(
        `Generated (${lang}): ${path.relative(ROOT, outputFilePath)}`,
      );

      postsMap[lang].push({
        id,
        title: title || id,
        date: date || "",
        category: category || "",
        description: description || "",
        tags,
        thumbnail,
        contentPath:
          lang === "ja"
            ? `blog/${id}.html`
            : `blog/en/${id}.html`,
        recommended: data.recommended || false,
      });
    }
  }

  if (fs.existsSync(THUMBNAIL_DIR)) {
    const allThumbnails = fs.readdirSync(THUMBNAIL_DIR);
    for (const file of allThumbnails) {
      if (!usedThumbnails.has(file)) {
        logger.info(`Removing unused thumbnail: ${file}`);
        fs.unlinkSync(path.join(THUMBNAIL_DIR, file));
      }
    }
  }

  postsMap.ja.sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  fs.writeFileSync(
    LIST_JSON_JA,
    JSON.stringify(postsMap.ja, null, 2),
    "utf8",
  );
  logger.success("Updated: assets/data/blogList.json");

  postsMap.en.sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  fs.writeFileSync(
    LIST_JSON_EN,
    JSON.stringify(postsMap.en, null, 2),
    "utf8",
  );
  logger.success("Updated: assets/data/blogList_en.json");

  // ------------------------------------------------------------
  // 生成済み記事 HTML に対して「前の記事 / 一覧へ戻る / 次の記事」を注入する
  // - postsMap は既に日付降順（新しい順）でソート済み
  // - 配列インデックスの扱い: 新しい順なので
  //     index - 1 => next (より新しい記事)
  //     index + 1 => prev (より古い記事)
  // ------------------------------------------------------------
  try {
    for (const lang of ["ja", "en"]) {
      const list = postsMap[lang] || [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const prev = list[i + 1] || null;
        const next = list[i - 1] || null;

        const outPath =
          lang === "ja"
            ? path.join(OUTPUT_DIR, `${item.id}.html`)
            : path.join(enOutputDir, `${item.id}.html`);

        if (!fs.existsSync(outPath)) {
          logger.warn(
            `Output file not found for nav injection: ${path.relative(ROOT, outPath)}`,
          );
          continue;
        }

        let htmlText = fs.readFileSync(outPath, "utf8");

        // 既存の nav ブロックを置換（最初のマッチのみ）
        const newNavHtml = buildPrevNextNavHtml(
          prev,
          next,
          locales[lang] || locales.ja,
          lang,
        );
        const replaced = htmlText.replace(
          /<div class="post-detail__nav post-detail__nav--bottom">[\s\S]*?<\/div>/,
          newNavHtml,
        );

        if (replaced !== htmlText) {
          fs.writeFileSync(outPath, replaced, "utf8");
          logger.info(
            `Updated nav for ${path.relative(ROOT, outPath)}`,
          );
        } else {
          logger.info(
            `No nav block replaced for ${path.relative(ROOT, outPath)}`,
          );
        }
      }
    }
  } catch (e) {
    logger.error(
      `Failed to inject prev/next nav: ${e.message}`,
    );
  }
})().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
