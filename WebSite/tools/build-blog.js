const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const locales = require("./locales");

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
    tocHtml += `<li class="toc-item toc-item--level-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`;
  }
  tocHtml += "</ul>";
  return tocHtml;
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
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M21.5,4.9C20.2,3.7,18.6,3,16.9,3c-3.7,0-6.8,2.8-7.2,6.4c-0.1,0.5-0.1,1-0.1,1.6c0,0-0.1,0.2-0.2,0.3c-0.3,0.3-0.7,0.2-1.2,0.1C7.8,11,7.4,10.8,7,10.7c-0.2-0.1-0.4-0.1-0.6-0.1c-0.3,0-0.6,0-0.8,0.1c-0.3,0.1-0.5,0.3-0.5,0.6c0,0.2,0.1,0.4,0.2,0.5c0.2,0.2,0.5,0.4,0.8,0.6c0.7,0.4,1.5,0.8,2.2,1.2c0.2,0.1,0.3,0.2,0.3,0.3c0,0.1,0,0.2-0.1,0.3C8.4,14.6,8,15,7.5,15.4c-0.2,0.2-0.4,0.3-0.5,0.5c-0.1,0.2-0.2,0.4-0.2,0.6c0,0.3,0.1,0.6,0.4,0.8C7.5,17.5,8,17.7,8.5,17.7c0.2,0,0.4-0.1,0.6-0.1c0.5-0.2,1-0.5,1.5-0.8c0.2-0.1,0.3-0.2,0.5-0.2c0.1,0,0.2,0,0.2,0.1c0.3,0.3,0.6,0.8,0.8,1.3c0.1,0.1,0.1,0.2,0.1,0.3c0,0.4-0.2,0.9-0.5,1.4c-0.1,0.2-0.2,0.3-0.2,0.5c0,0.2,0,0.4,0.1,0.5c0.1,0.2,0.3,0.3,0.5,0.4c0.2,0.1,0.5,0.1,0.7,0.1c0.6,0,1.2-0.2,1.7-0.6c0.1-0.1,0.2-0.2,0.3-0.2c0.1,0,0.2,0,0.3,0.1c0.7,0.5,1.5,0.8,2.4,0.8c3.7,0,6.8-2.8,7.2-6.4c0-0.1,0.1-0.2,0.1-0.4c0-0.1,0-0.2,0-0.3c0-0.1,0-0.1,0-0.2c0,0,0-0.1,0-0.1C22.2,9,22.2,8.9,22.2,8.8c0,0,0,0,0,0c0-0.2,0-0.4,0-0.6c-0.1-0.8-0.2-1.5-0.4-2.2C21.6,5.5,21.6,5.2,21.5,4.9z M16.9,4c1.5,0,2.9,0.6,3.9,1.6c0.1,0.1,0.1,0.2,0.1,0.3c0.3,0.7,0.5,1.4,0.5,2.2c0,0.2,0,0.3,0,0.5c0,0,0,0.1,0,0.1c0,0.1,0,0.1,0,0.2c0,0,0,0.1,0,0.1c0,0,0,0,0,0c0,0.1-0.1,0.2-0.1,0.3c-0.3,3.1-3.1,5.4-6.3,5.4c-0.8,0-1.6-0.2-2.3-0.6c-0.1-0.1-0.2-0.1-0.3-0.1c-0.1,0-0.3,0.1-0.4,0.2c-0.5,0.4-1.1,0.6-1.7,0.6c-0.1,0-0.2,0-0.3-0.1c-0.1,0-0.1-0.1-0.1-0.1c0-0.1,0.1-0.2,0.1-0.2c0.2-0.5,0.5-0.9,0.7-1.3c0.1-0.1,0.1-0.3,0.1-0.5c0-0.1-0.1-0.2-0.2-0.3c-0.2-0.2-0.5-0.5-0.8-0.8c-0.1-0.1-0.1-0.2-0.1-0.3c0-0.2,0.1-0.4,0.2-0.5c0.5-0.4,0.9-0.8,1.1-1.1c0.1-0.1,0.1-0.2,0.1-0.3c0-0.1-0.1-0.1-0.1-0.2c-0.7-0.4-1.4-0.8-2.1-1.1c-0.3-0.2-0.5-0.3-0.7-0.5c-0.1-0.1-0.2-0.2-0.2-0.3c0-0.1,0.1-0.2,0.1-0.2c0.1,0,0.2-0.1,0.3-0.1c0.2,0,0.5,0.1,0.6,0.1c0.4,0.1,0.9,0.4,1.2,0.5c0.5,0.2,0.9,0.2,1.2,0.1c0.1,0,0.1,0,0.2-0.1c0.3-3.1,3.1-5.4,6.3-5.4z M9.5,8.8C9.2,8.8,9,9,9,9.3v1.8c0,0.3,0.2,0.5,0.5,0.5h1.3c0.3,0,0.5-0.2,0.5-0.5V9.3c0-0.3-0.2-0.5-0.5-0.5H9.5z M14.8,8.8c-0.3,0-0.5,0.2-0.5,0.5v1.8c0,0.3,0.2,0.5,0.5,0.5h1.3c0.3,0,0.5-0.2,0.5-0.5V9.3c0-0.3-0.2-0.5-0.5-0.5H14.8z"></path></svg>`,
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

  return `<!doctype html>
<html lang="${locale.lang}">
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle}${locale.site_title_suffix}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${safeDesc}" />
    <meta name="view-transition" content="same">

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
    <link rel="stylesheet" href="${pathPrefix}/assets/css/transition.css" />
  </head>
  <body data-page="blog" view-transition-name="page">
    <div class="page-shell">
      <main class="main-container">
        <div class="post-layout">
          <div class="post-content">
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
                ${shareButtonsHtml}
              </header>
              <section class="post-detail__body markdown-body">${bodyHtml}</section>
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
      </main>
      <div class="toc-overlay"></div>
      <button type="button" class="toc-toggle" aria-label="${locale.toc_button_label}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"></path></svg>
        <span>${locale.toc_button_text}</span>
      </button>
    </div>
    <script src="${pathPrefix}/assets/js/layout.js" defer></script>
    <script src="${pathPrefix}/assets/js/ui.js"></script>
    <canvas id="menuAnimationCanvas"></canvas>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js"></script>
    <script src="${pathPrefix}/assets/js/particles.js"></script>
    <script src="${pathPrefix}/assets/js/toc.js" defer></script>
    <script src="${pathPrefix}/assets/js/recommend.js" defer></script>
    <script src="${pathPrefix}/assets/js/transition.js"></script>
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
      console.warn(
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

            console.log(
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
              console.error(
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
          console.error(
            `Failed to process thumbnail for ${id}:`,
            e,
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

      const html = createHtml({
        id,
        title: title || id,
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
      });

      const outputFilePath =
        lang === "ja"
          ? path.join(OUTPUT_DIR, `${id}.html`)
          : path.join(enOutputDir, `${id}.html`);

      fs.writeFileSync(outputFilePath, html, "utf8");
      console.log(
        `generated (${lang}): ${path.relative(ROOT, outputFilePath)}`,
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
        console.log(`Removing unused thumbnail: ${file}`);
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
  console.log(`updated: assets/data/blogList.json`);

  postsMap.en.sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  fs.writeFileSync(
    LIST_JSON_EN,
    JSON.stringify(postsMap.en, null, 2),
    "utf8",
  );
  console.log(`updated: assets/data/blogList_en.json`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
