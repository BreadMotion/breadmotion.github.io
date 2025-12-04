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
  "https://script.google.com/macros/s/AKfycbyuVrlM-7-Jps0GuZxLJtGw_y5R2bouUVYapYBhk5-CFL-xUiS8bIYUlw2crFnkcrWg/exec";

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
    <div class="post-header-actions" aria-hidden="false">
      <div class="post-header-actions__left">
        ${shareButtonsHtml}
      </div>
      <div class="post-header-actions__right">
        <div class="post-actions">
          <button type="button" class="btn btn--icon btn-like" data-post-id="${escapeHtmlAttr(id)}" aria-pressed="false" aria-label="${escapeHtmlAttr(likeLabel)}">
            <span class="icon-like" aria-hidden="true">❤</span>
            <span class="like-count">0</span>
          </button>
          <button type="button" class="btn btn--icon btn-bookmark" data-post-id="${escapeHtmlAttr(id)}" aria-pressed="false" aria-label="${escapeHtmlAttr(bookmarkLabel)}">
            <span class="icon-bookmark" aria-hidden="true">🔖</span>
          </button>
        </div>
      </div>
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

  // Additional JSON-LD: Person with sameAs and BreadcrumbList for richer results
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "PanKUN",
    url: BASE_URL,
    sameAs: [
      "https://github.com/breadmotion",
      "https://x.com/pankun2000_",
      "https://twitter.com/pankun2000_",
    ],
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${BASE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${BASE_URL}/blog.html`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: canonicalUrl,
      },
    ],
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

    <!-- Performance hints -->
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
    <link rel="preload" as="image" href="${BASE_URL}/assets/img/ogp.png">

    ${adScript}
    <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
    <script type="application/ld+json">${JSON.stringify(personJsonLd, null, 2)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd, null, 2)}</script>
    <meta property="og:title" content="${safeTitle}${locale.site_title_suffix}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css" />
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
              </header>
              <section class="post-detail__body markdown-body reveal-on-scroll">${bodyHtml}</section>
              ${postActionsHtml}
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
    <script src="${pathPrefix}/assets/js/ui.js" defer></script>
    <script src="${pathPrefix}/assets/js/post-interactions.js" defer></script>
    <script src="${pathPrefix}/assets/js/preview.js" defer></script>
    <canvas id="menuAnimationCanvas"></canvas>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js" defer></script>
    <script src="${pathPrefix}/assets/js/particles.js" defer></script>
    <script src="${pathPrefix}/assets/js/toc.js" defer></script>
    <script src="${pathPrefix}/assets/js/recommend.js" defer></script>
    <script src="${pathPrefix}/assets/js/mermaid-interactions.js" defer></script>

    <!-- Highlight.js: syntax highlighting for code blocks -->
    <!-- Highlight.js (CDN) -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js" defer></script>

    <!-- Mermaid (CDN) -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js" defer></script>

    <script>
      // Ensure Highlight.js runs after it has loaded and DOM is ready
      document.addEventListener('DOMContentLoaded', function() {
        if (window.hljs && typeof hljs.highlightAll === 'function') {
          try {
            hljs.highlightAll();
          } catch (e) {
            console.error('Highlight.js failed:', e);
          }
        }
      });

      // Initialize mermaid when available; retry briefly if script not loaded yet
      (function initMermaid() {
        function tryInit() {
          if (window.mermaid && typeof mermaid.initialize === 'function') {
            try {
              mermaid.initialize({ startOnLoad: false });
              mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            } catch (e) {
              console.error('Mermaid init failed:', e);
            }
          } else {
            // retry a few times
            setTimeout(tryInit, 200);
          }
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', tryInit);
        } else {
          tryInit();
        }
      })();
    </script>
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

      // 言語マップ: フェンス識別子を人間向け表示に変換
      const LANG_MAP = {
        js: "JavaScript",
        jsx: "JavaScript (JSX)",
        ts: "TypeScript",
        tsx: "TypeScript (TSX)",
        py: "Python",
        rb: "Ruby",
        java: "Java",
        c: "C",
        cpp: "C++",
        h: "C/C++ Header",
        cs: "C#",
        go: "Go",
        rs: "Rust",
        php: "PHP",
        swift: "Swift",
        kt: "Kotlin",
        sh: "Shell",
        bash: "Bash",
        zsh: "Zsh",
        json: "JSON",
        html: "HTML",
        css: "CSS",
        yml: "YAML",
        yaml: "YAML",
        md: "Markdown",
        mermaid: "Mermaid",
        mmd: "Mermaid",
      };

      // 言語アイコンマップ: 簡易SVGをインラインで埋め込み（不足する言語は default を使用）
      const ICON_MAP = {
        js: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M2 3h20v18H2z" fill="none"/><path d="M8.5 7.3l1.8 11.2H8l-0.9-5.8L6.2 18H4.7L6.8 6.7h1.7zM15.7 7.1c1.8 0 3.1.8 3.1 2.6 0 1.2-.6 2-1.7 2.5l1.1 2.2c1-.4 1.6-1.4 1.8-2.9.2-2-1.2-3.6-4.4-3.6-2.6 0-4.1 1.2-4.1 3.1 0 1.9 1.1 2.6 2.7 3.4l1.1.5c1.5.7 2 1.3 2 2.2 0 .9-.7 1.6-1.9 1.6-1.3 0-2.1-.6-2.5-1.4l-1.5.9c.7 1.6 2.6 2.6 4.7 2.6 2.9 0 4.9-1.5 4.9-4.1 0-1.8-.9-2.9-2.6-3.7l-1.1-.5c-1.4-.6-2.1-1.2-2.1-2.1 0-.8.7-1.4 1.8-1.4z"/></svg>',
        ts: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 4h16v16H4z" fill="none"/><path d="M7 7h3v10H7zM14 7h3v2h-2v2h2v2h-2v4h-3V7z"/></svg>',
        py: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2C8.7 2 6 4.7 6 8v1h6V8c0-1.1.9-2 2-2h2V4h-2c-1.7 0-3 1.3-3 3v1H8V8C8 4.7 10.7 2 14 2h-2zM6 13v3c0 3.3 2.7 6 6 6h2v-4h-6v-5H6z"/></svg>',
        java: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 3s3 1 6 0 6-1 6-1-1 2-5 3c0 0 3 1 4 3 0 0-3 2-8 1s-7-3-3-6c0 0-2 2-1 3 0 0 2-1 1-3z"/></svg>',
        cpp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 12h18M12 3v18"/></svg>',
        default:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3 7h18v2H3zM3 11h18v2H3zM3 15h18v2H3z"/></svg>',
      };

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
        // Add lazy loading and decoding to improve performance and reduce CLS
        return `<img src="${src}" alt="${escapeHtml(text)}" title="${escapeHtml(title || "")}" loading="lazy" decoding="async" />`;
      };

      // カスタム code レンダラー:
      // - mermaid / mmd の場合は <div class="mermaid"> を出力してクライアントで描画（ラッパーでスクロール可能に）
      // - その他は言語ラベル（アイコン + 表示名）を上部に表示する <figure class="code-block"> を生成
      renderer.code = (code, infostring, escaped) => {
        const lang =
          (infostring || "").trim().split(/\s+/)[0] || "";
        const label =
          LANG_MAP[lang] ||
          (lang
            ? lang.charAt(0).toUpperCase() + lang.slice(1)
            : "");
        // Mermaid: クライアント側で初期化して描画する。ラッパーでスクロールを有効にする
        if (lang === "mermaid" || lang === "mmd") {
          return `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(code)}</div></div>`;
        }
        const langClass = lang
          ? `language-${escapeHtmlAttr(lang)}`
          : "";
        // アイコンを取得（なければdefault）
        const iconHtml = ICON_MAP[lang] || ICON_MAP.default;
        const headerHtml = label
          ? `<div class="code-header"><span class="lang-icon">${iconHtml}</span><span class="lang-label">${escapeHtml(label)}</span></div>`
          : "";
        const codeHtml = escaped ? code : escapeHtml(code);
        return `<figure class="code-block" data-lang="${escapeHtmlAttr(lang)}">${headerHtml}<pre><code class="${langClass}">${codeHtml}</code></pre></figure>`;
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
