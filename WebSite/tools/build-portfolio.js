// tools/build-portfolio.js
// Markdown から作品ページ HTML と portfolioList.json を生成するスクリプト

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

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
    <meta name="view-transition" content="same">

    <meta property="og:title" content="${safeTitle} | PanKUN Portfolio" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="https://breadmotion.github.io/WebSite/assets/img/ogp.png" />
    <meta property="og:site_name" content="PanKUN" />
    <meta property="og:email" content="pankun.dev@gmail.com" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="https://breadmotion.github.io/WebSite/assets/img/ogp.png" />

    <link rel="shortcut icon" href="../favicon.ico">
    <link rel="icon" type="image/png" href="../assets/img/favicon-32.png" sizes="32x32">
    <link rel="icon" type="image/png" href="../assets/img/favicon-192.png" sizes="192x192">
    <link rel="apple-touch-icon" href="../assets/img/favicon-192.png">

    <link rel="stylesheet" href="../assets/css/base.css" />
    <link rel="stylesheet" href="../assets/css/layout.css" />
    <link rel="stylesheet" href="../assets/css/portfolio.css" />
    <link rel="stylesheet" href="../assets/css/transition.css" />
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

    <script src="../assets/js/layout.js" defer></script>
    <script src="../assets/js/ui.js"></script>

    <canvas id="menuAnimationCanvas"></canvas>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js"></script>
    <script src="../assets/js/particles.js"></script>
    <script src="../assets/js/transition.js"></script>
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

    const { data, content } = matter(raw);
    const htmlBody = marked.parse(content);

    const title = data.title || id;
    const description = data.description || "";
    const date = data.date || "";
    const category = data.category || "";
    const role = data.role || "";
    const tech = data.tech || "";
    let thumbnail = data.thumbnail || "";

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

          console.log(
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
    console.log(`generated: portfolio/${id}.html`);

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
  console.log(`updated: assets/data/portfolioList.json`);

  // Clean up unused portfolio thumbnails
  if (fs.existsSync(THUMBNAIL_DIR)) {
    const allThumbnails = fs.readdirSync(THUMBNAIL_DIR);
    for (const file of allThumbnails) {
      if (
        file.startsWith("portfolio_") &&
        !usedThumbnails.has(file)
      ) {
        console.log(`Removing unused thumbnail: ${file}`);
        fs.unlinkSync(path.join(THUMBNAIL_DIR, file));
      }
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
