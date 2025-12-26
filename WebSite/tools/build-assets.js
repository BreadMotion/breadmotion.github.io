#!/usr/bin/env node
/**
 * build-assets.js
 *
 * - Concatenate and minify CSS files -> assets/dist/styles.min.css
 * - Concatenate and minify JS files  -> assets/dist/scripts.min.js
 * - Update generated HTML files under WebSite/ to reference the dist files
 * - Normalize canonical / og: / twitter: image URLs to BASE_URL when appropriate
 *
 * Usage:
 *   node --env-file-if-exists=.env tools/build-assets.js
 *
 * Notes:
 * - This script creates backups of each HTML file it modifies as "file.html.bak".
 * - It preserves whether script tags used "defer" by setting the output script tag
 *   to have "defer" if any of the removed scripts had it.
 *
 * Dependencies (already present in this repo):
 * - cheerio
 * - csso
 * - esbuild
 * - glob
 *
 * Design decisions:
 * - CSS files and JS files are combined in a fixed, explicit order that mirrors the
 *   site's current structure. If you add/remove asset files, update the arrays below.
 * - External CDN scripts (e.g. p5.js) are left untouched.
 */

const fs = require("fs");
const path = require("path");
const csso = require("csso");
const esbuild = require("esbuild");
const cheerio = require("cheerio");
const glob = require("glob");

// Root paths (relative to this script location)
const ROOT = path.resolve(__dirname, ".."); // WebSite
const ASSETS_DIR = path.join(ROOT, "assets");
const DIST_DIR = path.join(ASSETS_DIR, "dist");

// Default BASE_URL (can be overridden by .env or package.json config)
let BASE_URL = process.env.BASE_URL || null;
if (!BASE_URL) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "package.json"),
        "utf8",
      ),
    );
    if (pkg && pkg.config && pkg.config.baseUrl) {
      BASE_URL = pkg.config.baseUrl;
    }
  } catch (e) {
    // ignore
  }
}
if (!BASE_URL) {
  BASE_URL = "https://breadmotion.github.io/WebSite/";
}
if (!BASE_URL.endsWith("/")) BASE_URL += "/";

function log(...args) {
  console.log("[build-assets]", ...args);
}

/**
 * Configuration: order of CSS and JS files to concatenate.
 * If you add new files that must be included on most pages, add them here.
 */
const cssFiles = [
  "css/base.css",
  "css/layout.css",
  "css/top.css",
  "css/portfolio.css",
  "css/preview.css",
  "css/blog.css",
  "css/contact.css",
  "css/post-interactions.css",
].map((p) => path.join(ASSETS_DIR, p));

const jsFiles = [
  "js/layout.js",
  "js/ui.js",
  "js/top.js",
  "js/recommend.js",
  "js/preview.js",
  "js/post-interactions.js",
  "js/blog.js",
  "js/portfolio.js",
  "js/contact.js",
  "js/toc.js",
  "js/mermaid-interactions.js",
  "js/particles.js",
].map((p) => path.join(ASSETS_DIR, p));

// Output file names
const outCss = path.join(DIST_DIR, "styles.min.css");
const outJs = path.join(DIST_DIR, "scripts.min.js");

function ensureDist() {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
    log("Created dist directory:", DIST_DIR);
  }
}

function readAndConcatFiles(fileList) {
  let buf = "";
  for (const f of fileList) {
    if (!fs.existsSync(f)) {
      log(
        "WARN: asset not found, skipping:",
        path.relative(ROOT, f),
      );
      continue;
    }
    const content = fs.readFileSync(f, "utf8");
    // Add a comment between files for easier debugging
    buf +=
      `\n/* ---- ${path.basename(f)} ---- */\n` +
      content +
      "\n";
  }
  return buf;
}

function buildCss() {
  log("Building CSS...");
  const concatenated = readAndConcatFiles(cssFiles);
  const minified = csso.minify(concatenated, {
    restructure: false,
  }).css;
  fs.writeFileSync(outCss, minified, "utf8");
  log("Wrote:", path.relative(ROOT, outCss));
}

function buildJs() {
  log("Building JS...");
  const concatenated = readAndConcatFiles(jsFiles);
  // Wrap in IIFE to avoid accidental top-level leaking and to better minify
  const wrapped = `(function(){\n'use strict';\n${concatenated}\n})();\n`;
  // Use esbuild transform to minify
  const result = esbuild.transformSync(wrapped, {
    minify: true,
    target: ["es2017"],
    loader: "js",
  });
  fs.writeFileSync(outJs, result.code, "utf8");
  log("Wrote:", path.relative(ROOT, outJs));
}

/**
 * Update HTML files to reference dist assets instead of multiple individual files.
 * - Replace all <link rel="stylesheet" href="assets/css/..."> groups with one link to /assets/dist/styles.min.css
 * - Replace scripts with src starting with 'assets/js/' with one script to /assets/dist/scripts.min.js
 * - Preserve 'defer' if any of replaced scripts had it
 * - Create backup of each HTML as .bak before overwriting
 *
 * Also normalizes canonical / og / twitter image urls to BASE_URL when they are relative
 */
function updateHtmlReferences() {
  log("Updating HTML references...");

  // Use forward-slash patterns so glob matches on Windows and Unix reliably
  const htmlGlob = [
    path.join(ROOT, "*.html").replace(/\\/g, "/"),
    path.join(ROOT, "blog", "*.html").replace(/\\/g, "/"),
    path
      .join(ROOT, "en", "**", "*.html")
      .replace(/\\/g, "/"),
  ];

  const files = htmlGlob
    .flatMap((pattern) =>
      glob.sync(pattern, { nodir: true }),
    )
    .sort();

  log(`Found ${files.length} HTML files to process.`);

  for (const filePath of files) {
    const relPath = path
      .relative(ROOT, filePath)
      .replace(/\\/g, "/"); // e.g. blog/blog_00001.html
    let html = fs.readFileSync(filePath, "utf8");
    const $ = cheerio.load(html, { decodeEntities: false });

    // Helper: detect local CSS/JS asset references anywhere in the href/src
    const looksLikeLocalCss = (href) => {
      if (!href) return false;
      if (isAbsoluteUrl(href) || href.startsWith("//"))
        return false;
      return (
        href.indexOf("assets/css/") !== -1 ||
        href.indexOf("/assets/css/") !== -1
      );
    };
    const looksLikeLocalJs = (src) => {
      if (!src) return false;
      if (isAbsoluteUrl(src) || src.startsWith("//"))
        return false;
      return (
        src.indexOf("assets/js/") !== -1 ||
        src.indexOf("/assets/js/") !== -1
      );
    };

    // --- CSS links handling ---
    const cssLinks = $('link[rel="stylesheet"]').filter(
      (i, el) => {
        const href = $(el).attr("href") || "";
        return looksLikeLocalCss(href);
      },
    );

    if (cssLinks.length > 0) {
      // Determine insertion point: position of the first matched local CSS link
      const firstCss = cssLinks.first();
      // compute a relative href from the HTML file to the dist CSS (works for nested files)
      const newCssHref = path
        .relative(path.dirname(filePath), outCss)
        .replace(/\\/g, "/");
      // Replace the first matched link with the bundled link, then remove all other matched links.
      // This avoids inserting before a node that was removed from the DOM.
      firstCss.replaceWith(
        `<link rel="stylesheet" href="${newCssHref}" />`,
      );
      // remove other matched css links (if any)
      cssLinks.not(firstCss).remove();
      log(
        `Replaced CSS links in ${relPath} -> ${newCssHref}`,
      );
    } else {
      // if no local css link found, ensure at least dist exists, optionally insert in head
      if ($("head").length) {
        const newCssHref = path
          .relative(path.dirname(filePath), outCss)
          .replace(/\\/g, "/");
        // Avoid inserting if a similar dist link already exists
        if ($(`link[href="${newCssHref}"]`).length === 0) {
          $("head").append(
            `<link rel="stylesheet" href="${newCssHref}" />`,
          );
          log(
            `Inserted CSS link in head of ${relPath} -> ${newCssHref}`,
          );
        }
      }
    }

    // --- JS scripts handling ---
    const scriptEls = $("script[src]").filter((i, el) => {
      const src = $(el).attr("src") || "";
      return looksLikeLocalJs(src);
    });

    if (scriptEls.length > 0) {
      // Keep defer if any had defer
      const anyDefer = scriptEls
        .toArray()
        .some((el) => $(el).attr("defer") !== undefined);
      const newJsSrc = path
        .relative(path.dirname(filePath), outJs)
        .replace(/\\/g, "/");

      // Choose insertion point: replace the first matched script with the bundled script,
      // then remove all other matched scripts. This avoids inserting relative to a node
      // that has been removed.
      const firstScript = scriptEls.first();
      firstScript.replaceWith(
        `<script src="${newJsSrc}"${anyDefer ? " defer" : ""}></script>`,
      );
      // remove other matched script elements
      scriptEls.not(firstScript).remove();
      log(
        `Replaced JS scripts in ${relPath} -> ${newJsSrc} (defer=${anyDefer})`,
      );
    } else {
      // if no local script element found, append to body (but avoid duplicates)
      if ($("body").length) {
        const newJsSrc = path
          .relative(path.dirname(filePath), outJs)
          .replace(/\\/g, "/");
        if ($(`script[src="${newJsSrc}"]`).length === 0) {
          $("body").append(
            `<script src="${newJsSrc}" defer></script>`,
          );
          log(
            `Appended JS script to body of ${relPath} -> ${newJsSrc}`,
          );
        }
      }
    }

    // --- Normalize canonical and OGP/Twitter image URLs to BASE_URL when relative ---
    // canonical
    const canonicalEl = $('link[rel="canonical"]');
    if (canonicalEl.length > 0) {
      // compute canonical as BASE_URL + relPath
      const canonicalHref =
        ensureUrlSlash(BASE_URL) + relPath;
      canonicalEl.attr("href", canonicalHref);
      log(
        `Updated canonical for ${relPath} -> ${canonicalHref}`,
      );
    } else {
      // Insert canonical in head
      const canonicalHref =
        ensureUrlSlash(BASE_URL) + relPath;
      if ($("head").length) {
        $("head").append(
          `<link rel="canonical" href="${canonicalHref}" />`,
        );
        log(
          `Inserted canonical for ${relPath} -> ${canonicalHref}`,
        );
      }
    }

    // og:url
    const ogUrl = $('meta[property="og:url"]');
    if (ogUrl.length > 0) {
      ogUrl.attr(
        "content",
        ensureUrlSlash(BASE_URL) + relPath,
      );
    } else if ($("head").length) {
      $("head").append(
        `<meta property="og:url" content="${ensureUrlSlash(BASE_URL) + relPath}" />`,
      );
    }

    // og:image and twitter:image: if value is relative, prefix with BASE_URL + relative path
    const normalizeImageMeta = (selector) => {
      $(selector).each((i, el) => {
        const content = $(el).attr("content") || "";
        if (!content) return;
        if (
          isAbsoluteUrl(content) ||
          content.startsWith("//")
        ) {
          // leave absolute URLs untouched
        } else {
          // content is relative path - make absolute against BASE_URL
          const newUrl =
            ensureUrlSlash(BASE_URL) +
            content.replace(/^\/+/, "");
          $(el).attr("content", newUrl);
          log(
            `Normalized ${selector} in ${relPath} -> ${newUrl}`,
          );
        }
      });
    };

    normalizeImageMeta('meta[property="og:image"]');
    normalizeImageMeta('meta[name="twitter:image"]');

    // favicon: make href absolute for link rel="icon" and rel="shortcut icon"
    $('link[rel="icon"], link[rel="shortcut icon"]').each(
      (i, el) => {
        const href = $(el).attr("href") || "";
        if (
          href &&
          !isAbsoluteUrl(href) &&
          !href.startsWith("//")
        ) {
          const newHref =
            ensureUrlSlash(BASE_URL) +
            href.replace(/^\/+/, "");
          $(el).attr("href", newHref);
          log(
            `Normalized favicon in ${relPath} -> ${newHref}`,
          );
        }
      },
    );

    // --- Write backup and new HTML ---
    const backupPath = filePath + ".bak";
    try {
      // Write backup only if not exists previously, to avoid overwriting older backups
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, html, "utf8");
        log(
          `Backup created: ${path.relative(ROOT, backupPath)}`,
        );
      } else {
        log(
          `Backup already exists: ${path.relative(ROOT, backupPath)}`,
        );
      }
      // Write modified HTML
      const outHtml = $.html();
      fs.writeFileSync(filePath, outHtml, "utf8");
      log(`Updated HTML: ${path.relative(ROOT, filePath)}`);
    } catch (err) {
      console.error("Failed to write file:", filePath, err);
    }
  } // for each file
}

function ensureUrlSlash(u) {
  if (!u) return "";
  return u.endsWith("/") ? u : u + "/";
}

function isAbsoluteUrl(u) {
  return (
    /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(u) ||
    u.startsWith("//")
  );
}

function run() {
  log("Starting build-assets...");
  ensureDist();
  try {
    buildCss();
  } catch (e) {
    console.error("CSS build failed:", e);
    process.exitCode = 2;
    return;
  }
  try {
    buildJs();
  } catch (e) {
    console.error("JS build failed:", e);
    process.exitCode = 3;
    return;
  }
  try {
    updateHtmlReferences();
  } catch (e) {
    console.error("HTML update failed:", e);
    process.exitCode = 4;
    return;
  }
  log("build-assets complete.");
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  buildCss,
  buildJs,
  updateHtmlReferences,
};
