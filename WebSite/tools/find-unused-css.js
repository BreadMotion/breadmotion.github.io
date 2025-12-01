/**
 * @file find-unused-css.js
 * @description プロジェクト内の未使用 CSS セレクタを検出するスクリプト
 * @summary
 *   - CSS ファイルからクラス名・ID を抽出
 *   - HTML, JS, MD などのコンテンツファイルを検索して使用状況を確認
 *   - 未使用と判定されたセレクタを報告（JS で動的に生成されるものは目視確認が必要）
 * @recent_changes
 *   - 簡易ロガー関数を追加（本番環境では verbose ログを抑制）
 *   - 冗長なコンソール出力を削減
 * @note
 *   このスクリプトは完全ではないため、「未使用」と判定されてもJavaScriptで動的に組み立てられている
 *   クラス名（例: `'icon-' + type`）などは目視で確認する必要があります。
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

const ROOT_DIR = path.resolve(__dirname, "..");
const CSS_DIR = path.join(ROOT_DIR, "assets", "css");

// 検索対象から除外するディレクトリ
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".zed",
]);

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
    } else {
      if (file.endsWith(".css")) {
        results.push(file);
      }
    }
  });
  return results;
}

// 検索対象となるコンテンツファイル一覧を取得（HTML, JS, MDなど）
function getContentFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!IGNORE_DIRS.has(file)) {
        results = results.concat(getContentFiles(filePath));
      }
    } else {
      // CSSファイル、自分自身、画像ファイルなどは除外
      if (
        !file.endsWith(".css") &&
        !file.endsWith("find-unused-css.js") &&
        !file.endsWith(".png") &&
        !file.endsWith(".jpg") &&
        !file.endsWith(".ico") &&
        !file.endsWith(".map")
      ) {
        // テキストファイルっぽいものを対象にする
        results.push(filePath);
      }
    }
  });
  return results;
}

// CSSコンテンツからクラス名とID名を抽出
function extractSelectors(cssContent) {
  // コメント削除
  const cleanCss = cssContent.replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const selectors = new Set();

  // クラス (.classname)
  // 擬似クラスなどは除外して名前部分だけとる
  const classRegex = /\.([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = classRegex.exec(cleanCss)) !== null) {
    // 数字で始まるものは除外（数値リテラル誤検知防止）
    if (isNaN(parseInt(match[1][0]))) {
      selectors.add({ type: "class", name: match[1] });
    }
  }

  // ID (#idname)
  const idRegex = /#([a-zA-Z0-9_-]+)/g;
  while ((match = idRegex.exec(cleanCss)) !== null) {
    const name = match[1];
    // カラーコード(#fff, #000000)っぽいものは除外
    if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(name))
      continue;
    if (isNaN(parseInt(name[0]))) {
      selectors.add({ type: "id", name: name });
    }
  }
  return Array.from(selectors);
}

try {
  logger.info("Scanning project for unused CSS selectors...");

  const cssFiles = getCssFiles(CSS_DIR);
  const contentFiles = getContentFiles(ROOT_DIR);

  logger.info(`Target CSS files: ${cssFiles.length}`);
  logger.info(`Content files to search: ${contentFiles.length}`);

  // コンテンツファイルをメモリにロード
  // ファイル数が多い場合はストリーム処理にすべきだが、今回は一括でOK
  const contents = contentFiles.map((f) =>
    fs.readFileSync(f, "utf8"),
  );

  cssFiles.forEach((cssFile) => {
    const cssContent = fs.readFileSync(cssFile, "utf8");
    const selectors = extractSelectors(cssContent);

    logger.info(`Checking ${path.relative(ROOT_DIR, cssFile)} (${selectors.length} selectors)...`);

    let unusedCount = 0;

    selectors.forEach((sel) => {
      // 「英数字・ハイフン・アンダースコア」以外の文字に挟まれているかチェック
      // これにより部分一致（例: "card" が "card-body" にヒットする）を防ぐ
      const pattern = new RegExp(
        `[^a-zA-Z0-9_-]${sel.name}[^a-zA-Z0-9_-]`,
      );

      let isUsed = false;
      for (const content of contents) {
        // 高速化のため、まず単純な includes でフィルタリング
        if (content.includes(sel.name)) {
          // ヒットしたら、厳密な単語境界チェックを行う
          // 文頭・文末に対応するためスペースでパディングしてチェック
          if (pattern.test(" " + content + " ")) {
            isUsed = true;
            break;
          }
        }
      }

      if (!isUsed) {
        // 未使用セレクタは常に報告（重要な情報のため）
        console.log(`  [UNUSED] ${sel.type === "class" ? "." : "#"}${sel.name}`);
        unusedCount++;
      }
    });

    if (unusedCount === 0) {
      logger.info("  All selectors seem to be used.");
    }
  });

  logger.success("Done.");
} catch (err) {
  logger.error(err.message);
}
