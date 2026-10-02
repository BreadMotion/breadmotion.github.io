/**
 * @file find-unused-css.js
 * @description プロジェクト内の未使用 CSS セレクタを検出し、必要に応じてコメントアウトするスクリプト
 * @summary
 *   - CSS ファイルからクラス名・ID を抽出
 *   - HTML, JS, MD などのコンテンツファイルを検索して使用状況を確認
 *   - 未使用と判定されたセレクタを報告し、--apply 指定時にファイルへコメント化を反映
 * @note
 *   このスクリプトは完全ではないため、「未使用」と判定されてもJavaScriptで動的に組み立てられている
 *   クラス名（例: `'icon-' + type`）などは目視で確認する必要があります。
 */

const fs = require("fs");
const path = require("path");
const postcss = require("postcss");

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

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

const ROOT_DIR = path.resolve(__dirname, "..");
const CSS_DIR = path.join(ROOT_DIR, "assets", "css");

// 検索対象から除外するディレクトリ
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".zed",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// CSSファイル一覧を取得
function getCssFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getCssFiles(file));
    } else if (file.endsWith(".css")) {
      results.push(file);
    }
  });
  return results;
}

// 検索対象となるコンテンツファイル一覧を取得（HTML, JS, MDなど）
function getContentFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!IGNORE_DIRS.has(file)) {
        results = results.concat(getContentFiles(filePath));
      }
    } else if (
      !file.endsWith(".css") &&
      !file.endsWith("find-unused-css.js") &&
      !file.endsWith(".png") &&
      !file.endsWith(".jpg") &&
      !file.endsWith(".ico") &&
      !file.endsWith(".map")
    ) {
      results.push(filePath);
    }
  });
  return results;
}

// CSSコンテンツからクラス名とID名を抽出
function extractSelectors(cssContent) {
  const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = new Set();

  const classRegex = /\.([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = classRegex.exec(cleanCss)) !== null) {
    if (isNaN(parseInt(match[1][0], 10))) {
      selectors.add(`class:${match[1]}`);
    }
  }

  const idRegex = /#([a-zA-Z0-9_-]+)/g;
  while ((match = idRegex.exec(cleanCss)) !== null) {
    const name = match[1];
    if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(name)) {
      continue;
    }
    if (isNaN(parseInt(name[0], 10))) {
      selectors.add(`id:${name}`);
    }
  }

  return Array.from(selectors).map((selector) => {
    const [type, ...rest] = selector.split(":");
    return { type, name: rest.join(":") };
  });
}

function selectorMatchesUnused(selectorText, unusedSelectors) {
  return unusedSelectors.some((sel) => {
    const pattern = sel.type === "class"
      ? new RegExp(`(^|[^a-zA-Z0-9_-])\\.${escapeRegExp(sel.name)}(?=[^a-zA-Z0-9_-]|$)`, "i")
      : new RegExp(`(^|[^a-zA-Z0-9_-])#${escapeRegExp(sel.name)}(?=[^a-zA-Z0-9_-]|$)`, "i");

    return pattern.test(selectorText);
  });
}

function applyUnusedSelectorComments(cssContent, unusedSelectors) {
  const root = postcss.parse(cssContent, { from: undefined });
  let changed = false;

  root.walkRules((rule) => {
    const selectorList = postcss.list.comma(rule.selector)
      .map((selector) => selector.trim())
      .filter(Boolean);

    if (!selectorList.length) {
      return;
    }

    const removedSelectors = selectorList.filter((selector) => selectorMatchesUnused(selector, unusedSelectors));
    if (!removedSelectors.length) {
      return;
    }

    changed = true;
    const remainingSelectors = selectorList.filter((selector) => !removedSelectors.includes(selector));

    rule.before(postcss.comment({ text: `UNUSED SELECTORS: ${removedSelectors.join(", ")}` }));

    if (!remainingSelectors.length) {
      rule.remove();
      return;
    }

    rule.selector = remainingSelectors.join(", ");
  });

  if (!changed) {
    return cssContent;
  }

  return root.toString();
}

function main() {
  try {
    logger.info("Scanning project for unused CSS selectors...");

    const cssFiles = getCssFiles(CSS_DIR);
    const contentFiles = getContentFiles(ROOT_DIR);

    logger.info(`Target CSS files: ${cssFiles.length}`);
    logger.info(`Content files to search: ${contentFiles.length}`);

    const contents = contentFiles.map((f) => fs.readFileSync(f, "utf8"));
    const appliedFiles = [];

    cssFiles.forEach((cssFile) => {
      const cssContent = fs.readFileSync(cssFile, "utf8");
      const selectors = extractSelectors(cssContent);

      logger.info(`Checking ${path.relative(ROOT_DIR, cssFile)} (${selectors.length} selectors)...`);

      const unusedSelectors = [];
      let unusedCount = 0;

      selectors.forEach((sel) => {
        const pattern = new RegExp(
          `[^a-zA-Z0-9_-]${sel.name}[^a-zA-Z0-9_-]`,
        );

        let isUsed = false;
        for (const content of contents) {
          if (content.includes(sel.name)) {
            if (pattern.test(` ${content} `)) {
              isUsed = true;
              break;
            }
          }
        }

        if (!isUsed) {
          console.log(`  [UNUSED] ${sel.type === "class" ? "." : "#"}${sel.name}`);
          unusedSelectors.push(sel);
          unusedCount++;
        }
      });

      if (unusedCount === 0) {
        logger.info("  All selectors seem to be used.");
        return;
      }

      if (shouldApply) {
        const updatedCss = applyUnusedSelectorComments(cssContent, unusedSelectors);
        if (updatedCss !== cssContent) {
          const backupPath = `${cssFile}.bak`;
          fs.copyFileSync(cssFile, backupPath);
          fs.writeFileSync(cssFile, updatedCss, "utf8");
          appliedFiles.push({ cssFile, backupPath, unusedCount });
          logger.info(`  Updated ${path.relative(ROOT_DIR, cssFile)} with ${unusedCount} commented selector(s).`);
        }
      } else {
        logger.info(`  ${unusedCount} selector(s) would be commented out in dry-run mode.`);
      }
    });

    if (shouldApply && appliedFiles.length > 0) {
      logger.success(`Applied changes to ${appliedFiles.length} CSS file(s). Backups created at .bak files.`);
    } else if (shouldApply) {
      logger.success("No CSS changes were required.");
    }

    logger.success("Done.");
  } catch (err) {
    logger.error(err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractSelectors,
  selectorMatchesUnused,
  applyUnusedSelectorComments,
  getCssFiles,
  getContentFiles,
};
