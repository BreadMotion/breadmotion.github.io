#!/usr/bin/env node
/**
 * tools/build-wasm.js
 *
 * wasm-pack が利用可能であれば wasm-pack を実行して wasm をビルドします。
 * - Windows や各シェルのクォート問題を回避するために、長い node -e の一行実行ではなく
 *   ファイルベースで子プロセスを起動する実装にしています。
 * - wasm-pack が見つからない場合は警告を出して正常終了（exit 0）します。
 *
 * 使い方（プロジェクトルートの WebSite ディレクトリから呼ばれる想定）:
 *   npm run build:wasm   -> このスクリプトを実行
 *
 * 出力:
 *   成功時: assets/pkg に wasm-pack の出力が生成される（wasm-pack の設定次第）
 *   失敗時: 非ゼロで終了（子プロセスのコードを継承）
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function log(...args) {
  console.log("[build-wasm]", ...args);
}
function warn(...args) {
  console.warn("[build-wasm]", ...args);
}
function error(...args) {
  console.error("[build-wasm]", ...args);
}

// wasm ソースディレクトリ（このスクリプトは WebSite/tools に置かれる想定）
const WASM_DIR = path.resolve(__dirname, "..", "wasm");

// 安全に実行環境を確認するユーティリティ
function hasCommand(cmd) {
  try {
    // --version を投げてコマンドの存在を確認
    const r = spawnSync(cmd, ["--version"], { stdio: "ignore" });
    return r && r.status === 0;
  } catch (e) {
    return false;
  }
}

// 実行開始
(function main() {
  log("Starting wasm build check...");

  // wasm ディレクトリが無ければスキップ
  if (!fs.existsSync(WASM_DIR) || !fs.statSync(WASM_DIR).isDirectory()) {
    warn(`WASM source directory not found, skipping: ${WASM_DIR}`);
    process.exit(0);
  }

  // wasm-pack の存在確認
  if (!hasCommand("wasm-pack")) {
    warn("wasm-pack not available - skipping wasm build");
    process.exit(0);
  }

  log("wasm-pack found. Running wasm-pack build in:", WASM_DIR);

  // wasm-pack build --target web --out-dir ../assets/pkg
  // out-dir は相対パスで指定（wasm ディレクトリ基準）
  const args = ["build", "--target", "web", "--out-dir", "../assets/pkg"];
  const opts = {
    cwd: WASM_DIR,
    stdio: "inherit", // stdout/stderr を親プロセスに渡す
    shell: false,
  };

  try {
    const r = spawnSync("wasm-pack", args, opts);
    if (r.error) {
      error("Failed to spawn wasm-pack:", r.error);
      process.exit(r.status || 1);
    }
    if (typeof r.status === "number" && r.status !== 0) {
      error(`wasm-pack exited with code ${r.status}`);
      process.exit(r.status);
    }
    log("wasm-pack build completed successfully.");
    process.exit(0);
  } catch (e) {
    error("Unexpected error while running wasm-pack:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
