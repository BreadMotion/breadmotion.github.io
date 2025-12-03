/**
 * @file translate-static.js
 * @description 静的 HTML ファイルを多言語化（英語版生成）するスクリプト
 * @summary
 *   - 対象 HTML ファイルを読み込み、cheerio で DOM 操作
 *   - locales/static.js の翻訳データを適用
 *   - パスの調整、canonical URL、hreflang タグの追加
 *   - en/ ディレクトリに英語版 HTML を出力
 * @recent_changes
 *   - 簡易ロガー関数を追加（本番環境では verbose ログを抑制）
 *   - 冗長なコンソール出力を削減
 */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const locales = require("./locales/static");

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

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "en");
const BASE_URL = "https://breadmotion.github.io";

// Files to process
const TARGET_FILES = [
  "index.html",
  "blog.html",
  "portfolio.html",
  "contact.html",
];

// Ensure output directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function processFile(filename) {
  const srcPath = path.join(ROOT, filename);
  if (!fs.existsSync(srcPath)) {
    logger.warn(`Source file not found: ${filename}`);
    return;
  }

  const content = fs.readFileSync(srcPath, "utf8");
  const $ = cheerio.load(content, {
    decodeEntities: false,
  });
  const locale = locales.en;

  // 1. Apply Translations
  // Common Translations
  if (locale.common) {
    applyTranslations($, locale.common);
  }
  // Page Specific Translations
  const pageKey = filename.replace(".html", "");
  if (locale[pageKey]) {
    applyTranslations($, locale[pageKey]);
  }

  // 2. Adjust Paths for 'en/' subdirectory (../)
  adjustPaths($);

  // 3. Update Canonical URL
  const canonicalLink = $("link[rel='canonical']");
  if (canonicalLink.length) {
    canonicalLink.attr(
      "href",
      `${BASE_URL}/en/${filename}`,
    );
  } else {
    $("head").append(
      `<link rel="canonical" href="${BASE_URL}/en/${filename}" />`,
    );
  }

  // 4. Add Hreflang Tags
  addHreflangTags($, filename);

  // 5. Save File
  const distPath = path.join(DIST_DIR, filename);
  fs.writeFileSync(distPath, $.html(), "utf8");
  logger.success(`Generated: en/${filename}`);
}

function applyTranslations($, translations) {
  Object.keys(translations).forEach((selector) => {
    const value = translations[selector];
    const elements = $(selector);

    if (elements.length === 0) return;

    elements.each((_, el) => {
      const $el = $(el);
      if (typeof value === "string") {
        // Simple text replacement
        // If the element has children (like nested tags), we might want to be careful.
        // For now, we assume leaf nodes or full content replacement.
        $el.html(value); // Use html() to allow tags in translation
      } else if (
        typeof value === "object" &&
        value.attr &&
        value.value
      ) {
        // Attribute replacement
        $el.attr(value.attr, value.value);
      }
    });
  });
}

function adjustPaths($) {
  // Fix relative paths for resources to point to parent directory
  // Targets: src, href, data-nav, content (for og:image)

  const attributes = ["src", "href", "data-nav"];

  attributes.forEach((attr) => {
    $(`[${attr}]`).each((_, el) => {
      const $el = $(el);
      let val = $el.attr(attr);

      if (!val) return;

      // Ignore absolute URLs, protocol-relative URLs, data URIs, anchors
      if (
        val.startsWith("http") ||
        val.startsWith("//") ||
        val.startsWith("data:") ||
        val.startsWith("#") ||
        val.startsWith("mailto:")
      ) {
        return;
      }

      // Ignore if already pointing to parent (though simple check)
      if (val.startsWith("../")) return;

      // Handle specific assets and known directories
      if (
        val.startsWith("assets/") ||
        val.startsWith("partials/") ||
        val === "favicon.ico"
      ) {
        $el.attr(attr, `../${val}`);
      }
      // Note: We DO NOT change links to other .html files (e.g. "blog.html")
      // because we want them to link to the english version in the same directory.
    });
  });

  // Special case for meta og:image, twitter:image
  const metaImageSelectors = [
    "meta[property='og:image']",
    "meta[name='twitter:image']",
  ];
  metaImageSelectors.forEach((sel) => {
    $(sel).each((_, el) => {
      const $el = $(el);
      const content = $el.attr("content");
      // If it's a relative path starting with assets, make it absolute or fix relative
      // Usually OG images should be absolute. If they are already absolute, do nothing.
      if (
        content &&
        !content.startsWith("http") &&
        content.startsWith("assets/")
      ) {
        // Convert to absolute URL for safety in subfolder, or use ../
        // Better to use absolute URL for OG tags
        $el.attr("content", `${BASE_URL}/${content}`);
      }
    });
  });
}

function addHreflangTags($, filename) {
  // Remove existing hreflang tags if any to avoid duplicates
  $("link[rel='alternate'][hreflang]").remove();

  const jaUrl = `${BASE_URL}/${filename}`;
  const enUrl = `${BASE_URL}/en/${filename}`;

  const head = $("head");
  head.append(
    `<link rel="alternate" hreflang="ja" href="${jaUrl}" />`,
  );
  head.append(
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
  );
  head.append(
    `<link rel="alternate" hreflang="x-default" href="${jaUrl}" />`,
  );
}

// Run
TARGET_FILES.forEach((file) => {
  processFile(file);
});
