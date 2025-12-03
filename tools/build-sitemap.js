/**
 * @file build-sitemap.js
 * @description プロジェクト内の HTML ファイルからサイトマップ (sitemap.xml) を自動生成するスクリプト
 * @summary
 *   - プロジェクトルートから再帰的に HTML ファイルを収集
 *   - node_modules, .git, tools などの除外ディレクトリをスキップ
 *   - 各 URL の lastmod を更新日時から取得
 * @recent_changes
 *   - 簡易ロガー関数を追加（本番環境では verbose ログを抑制）
 *   - 冗長なコンソール出力を削減
 */

const fs = require("fs");
const path = require("path");

// ───────────────────────────────────────────────────────────────
// 簡易ロガー: NODE_ENV !== 'production' の場合のみ verbose 出力
// ───────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";
const logger = {
  info: (msg) => !isProduction && console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
};

const BASE_URL = "https://breadmotion.github.io";
// プロジェクトのルート (breadmotion.github.io)
const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "sitemap.xml");

// スキャンから完全に除外するディレクトリ名
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".github",
  ".zed", // Zed editor directory
  "tools",
  "partials",
  "content",
]);

// スキャンから除外するファイル名
const IGNORE_FILES = new Set([
  "sitemap.xml", // 生成物自体は除外
  "package.json",
  "package-lock.json",
  ".gitignore",
  "serve.js",
  "README.md",
]);

/**
 * XMLの特殊文字をエスケープする
 * @param {string} unsafe
 * @returns {string}
 */
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
  });
}

/**
 * 指定されたディレクトリから再帰的にHTMLファイルを集める
 * @param {string} dir
 * @param {string[]} allFiles
 * @param {string} baseDir
 * @returns {string[]}
 */
function collectHtmlFiles(
  dir,
  allFiles = [],
  baseDir = dir,
) {
  const entries = fs.readdirSync(dir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (
      IGNORE_DIRS.has(entry.name) ||
      IGNORE_FILES.has(entry.name)
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectHtmlFiles(fullPath, allFiles, baseDir);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".html")
    ) {
      // プロジェクトルートからの相対パスを計算
      const relPath = path
        .relative(baseDir, fullPath)
        .split(path.sep)
        .join("/");
      allFiles.push(relPath);
    }
  }
  return allFiles;
}

// プロジェクトのルートからHTMLファイルのスキャンを開始
const htmlFiles = collectHtmlFiles(ROOT);

/**
 * 相対パスから完全な公開URLを生成する
 * @param {string} relPath
 * @returns {string}
 */
function toUrl(relPath) {
  let urlPath = relPath.replace(/\\/g, "/");

  // プロジェクトルートの index.html はサイトのルートURL `/` にする
  if (urlPath === "index.html") {
    return `${BASE_URL}/`;
  }

  // その他の index.html は末尾を削除してディレクトリのURLにする (例: WebSite/index.html -> /WebSite/)
  if (urlPath.endsWith("/index.html")) {
    const dirPath = urlPath.substring(
      0,
      urlPath.length - "index.html".length,
    );
    return `${BASE_URL}/${dirPath}`;
  }

  // それ以外のファイルはそのままパスとして結合
  return `${BASE_URL}/${urlPath}`;
}

/**
 * DateオブジェクトをYYYY-MM-DD形式の文字列にフォーマットする
 * @param {Date} d
 * @returns {string}
 */
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

const urlEntries = htmlFiles.map((relPath) => {
  const filePath = path.join(ROOT, relPath);
  const stat = fs.statSync(filePath);
  const lastmod = formatDate(stat.mtime);
  const loc = escapeXml(toUrl(relPath));

  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join("\n")}
</urlset>
`;

fs.writeFileSync(OUTPUT, xml.trim(), "utf8");
logger.success(`Sitemap generated: ${OUTPUT}`);
logger.info("Included URLs:");
htmlFiles.forEach((rel) => logger.info(` - ${toUrl(rel)}`));
