/**
 * wasm-loader.js
 *
 * 非モジュールスクリプトとして HTML に挿入されることを想定したローダー。
 * 動作:
 *  - このスクリプトは自分のスクリプトタグの場所から相対的に `../pkg/<crate>.js` を参照し、
 *    module スクリプトを動的に生成して import -> 初期化関数を呼び出します。
 *  - 既存の p5/particles スクリプトがある場合は競合を避けるため削除を試みます。
 *  - Canvas はまず `bg-canvas` を探し、なければ `menuAnimationCanvas` を探す。どちらもなければ新規に作成します。
 *
 * 想定される crate 名: `bg_wasm`（wasm-pack による出力ファイル `assets/pkg/bg_wasm.js` を期待）
 *
 * 注意:
 *  - ブラウザで動作する前提で書かれており、ビルド時に `assets/pkg/bg_wasm.js` と `.wasm` が生成されている必要があります。
 *  - 初期化関数の名前は wasm 側の実装に依ります。ここでは `default` export の関数（init）を呼び、
 *    続けて `start` または `run` という名前のエクスポートがあればそれを呼ぶようにしています。
 */

(function () {
  // crate 名。必要に応じて変更してください。
  const CRATE_NAME = "bg_wasm";

  // canvas id の候補（優先順）
  const CANVAS_IDS = ["bg-canvas", "menuAnimationCanvas"];

  // ログユーティリティ
  function log(...args) {
    if (window && window.console) {
      console.log("[wasm-loader]", ...args);
    }
  }
  function warn(...args) {
    if (window && window.console) {
      console.warn("[wasm-loader]", ...args);
    }
  }
  function error(...args) {
    if (window && window.console) {
      console.error("[wasm-loader]", ...args);
    }
  }

  // 現在のスクリプト要素を特定
  const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  // base directory of this script (ends with '/')
  const loaderDir = (function () {
    try {
      const src = currentScript && currentScript.src ? currentScript.src : location.href;
      return src.replace(/\/[^\/]*$/, "/");
    } catch (e) {
      return "./";
    }
  })();

  // pkg にある生成ファイルへの URL を計算する
  function pkgUrlFor(crateName) {
    // loader is expected at assets/js/, pkg at assets/pkg/
    // relative path from loaderDir: '../pkg/<crate>.js'
    try {
      const candidate = new URL("../pkg/" + crateName + ".js", loaderDir).href;
      return candidate;
    } catch (e) {
      // Fallback: simple join
      return loaderDir + "../pkg/" + crateName + ".js";
    }
  }

  // 競合するスクリプト（p5 / particles）を可能な限り除去しておく
  function removeConflictingScripts() {
    try {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      scripts.forEach((el) => {
        const src = el.getAttribute("src") || "";
        if (/p5(\.min)?\.js/.test(src) || /\/particles(\.min)?\.js$/.test(src) || src.indexOf("p5") !== -1 && src.indexOf("cdnjs") !== -1) {
          // p5 は完全削除してしまうと別ページなどで影響が出る可能性があるため、
          // このページに限定して実行する場合のみ削除することを想定しています。
          // ここでは安全策として削除を試みるが、削除しない選択肢も残す。
          try {
            el.parentNode && el.parentNode.removeChild(el);
            log("Removed conflicting script:", src);
          } catch (e) {
            warn("Failed to remove script:", src, e);
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }

  // Canvas を取得または生成する
  function ensureCanvas() {
    for (const id of CANVAS_IDS) {
      const el = document.getElementById(id);
      if (el && el.tagName && el.tagName.toLowerCase() === "canvas") {
        return el;
      }
    }
    // どちらも無ければ新規作成して body の末尾に挿入
    const c = document.createElement("canvas");
    c.id = CANVAS_IDS[0];
    // スタイルは既存 particles.js と同様に固定背景で pointer-events を無効化
    c.style.position = "fixed";
    c.style.left = "0";
    c.style.top = "0";
    c.style.zIndex = "-1";
    c.style.pointerEvents = "none";
    // サイズは JS 側で設定される想定だが、最低限ページに追加
    document.body.appendChild(c);
    log("Created canvas with id:", c.id);
    return c;
  }

  // module スクリプトを動的に作ってロードする（Blob を使って相対パスを解決）
  async function importAndInit(pkgPath, canvasEl) {
    // module 文字列を作成
    const moduleSource = `
      import init, * as wasmModule from '${pkgPath}';
      (async () => {
        try {
          // init がデフォルトエクスポートで初期化関数（wasm をロードして返す）である想定
          let initResult = undefined;
          if (typeof init === 'function') {
            initResult = await init();
          }
          // 優先して .start(canvas) を呼ぶ。次に run, init を探す。
          const canvas = document.getElementById('${canvasEl.id}');
          const exportedStart = wasmModule.start || wasmModule.run || wasmModule.default || (initResult && initResult.start);
          if (typeof exportedStart === 'function') {
            try {
              // start 関数は canvas DOM 要素、もしくは canvas の id を受け取る形を想定
              exportedStart(canvas);
            } catch (err) {
              // もし start が同期的な初期化ではなくオブジェクトを返す場合などのフォールバック
              console.warn('[wasm-loader] start() threw, attempting common fallbacks', err);
              if (typeof wasmModule.init === 'function') {
                await wasmModule.init();
              }
            }
          } else {
            // 明示的な start/run が無ければ、initResult を使って自動起動する実装である可能性がある
            console.info('[wasm-loader] No start/run export found; assuming module handled startup in init.');
          }
        } catch (e) {
          console.error('[wasm-loader] wasm module init failed', e);
        }
      })();
    `;

    try {
      const blob = new Blob([moduleSource], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const s = document.createElement("script");
      s.type = "module";
      s.src = blobUrl;
      s.onload = () => {
        // release blob URL after load to free memory
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      };
      s.onerror = (ev) => {
        error("Module script failed to load:", ev);
      };
      document.head.appendChild(s);
      log("Inserted module script for pkg:", pkgPath);
    } catch (e) {
      error("Failed to inject module script:", e);
    }
  }

  // メイン処理
  (function main() {
    try {
      const pkgPathAbsolute = pkgUrlFor(CRATE_NAME);
      log("Computed pkg path:", pkgPathAbsolute);

      // 競合スクリプトを除去（オプション）
      removeConflictingScripts();

      // 対象の canvas を確保
      const canvasEl = ensureCanvas();

      // 動的インポートして初期化
      importAndInit(pkgPathAbsolute, canvasEl);
    } catch (e) {
      error("wasm-loader encountered an error:", e);
    }
  })();
})();
