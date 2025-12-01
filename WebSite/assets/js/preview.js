/**
 * preview.js
 * --------------------------------------------------
 * aタグを長押しで遷移先ページをプレビュー表示するスクリプト（単体モーダル実装）。
 * - portfolio.js に依存せず、preview.js 単独でモーダルを生成して表示します。
 * - 長押しで対象ページを fetch し、.work-detail があればその内容を流用、
 *   なければメタ情報（title, og:image, p抜粋）を使ってフォールバック表示を行います。
 * - 同一オリジンのみ対象（セキュリティ上の理由）。
 * - Pointer Events を用いて長押しを検出します。
 *
 * 導入:
 * <script src="assets/js/preview.js" defer></script>
 *
 * 注意:
 * - fetch による GET リクエストが発生します。認証クッキーを含めるため credentials: 'include' を使用しています。
 * - 既存の global modal がある場合と競合しないよう、要素名は preview 固有のクラス名を使用します。
 * --------------------------------------------------
 */
(() => {
  "use strict";

  // 長押しの判定ミリ秒
  const LONG_PRESS_MS = 500;
  // 長押し時に許容する移動量（px）
  const MOVE_TOLERANCE = 10;

  let longPressTimer = null;
  let startX = 0;
  let startY = 0;
  let activeAnchor = null;
  let suppressClick = false;

  // モーダル要素（単一インスタンス）
  let modalOverlay = null;
  let modalContainer = null;
  let modalContent = null;
  let modalCloseBtn = null;

  /**
   * 同一オリジン判定
   * href は相対パスでも可。location.href を基準に確認する。
   */
  function isSameOriginUrl(href) {
    try {
      const url = new URL(href, location.href);
      return url.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  /**
   * モーダル DOM を作成（既にあればそれを返す）
   * クラス名は preview-... として既存の modal と衝突しないようにする
   */
  function ensureModal() {
    if (modalOverlay && modalContainer && modalContent)
      return;

    // オーバーレイ
    modalOverlay = document.createElement("div");
    modalOverlay.className = "preview-modal-overlay";
    modalOverlay.setAttribute("role", "dialog");
    modalOverlay.setAttribute("aria-modal", "true");
    modalOverlay.style.position = "fixed";
    modalOverlay.style.left = 0;
    modalOverlay.style.top = 0;
    modalOverlay.style.width = "100%";
    modalOverlay.style.height = "100%";
    modalOverlay.style.zIndex = 10000;
    modalOverlay.style.display = "none";
    modalOverlay.style.alignItems = "center";
    modalOverlay.style.justifyContent = "center";
    modalOverlay.style.background = "rgba(0,0,0,0.45)";

    // コンテナ
    modalContainer = document.createElement("div");
    modalContainer.className = "preview-modal-container";
    modalContainer.style.maxWidth = "900px";
    modalContainer.style.width = "min(95vw, 900px)";
    modalContainer.style.maxHeight = "90vh";
    modalContainer.style.overflow = "auto";
    modalContainer.style.background = "#fff";
    modalContainer.style.borderRadius = "8px";
    modalContainer.style.boxShadow =
      "0 12px 40px rgba(0,0,0,0.35)";
    modalContainer.style.position = "relative";
    modalContainer.style.padding = "16px";
    modalContainer.style.boxSizing = "border-box";
    modalContainer.style.fontFamily =
      "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

    // 閉じるボタン
    modalCloseBtn = document.createElement("button");
    modalCloseBtn.className = "preview-modal-close";
    modalCloseBtn.innerHTML = "✕";
    modalCloseBtn.setAttribute("aria-label", "閉じる");
    modalCloseBtn.style.position = "absolute";
    modalCloseBtn.style.right = "8px";
    modalCloseBtn.style.top = "8px";
    modalCloseBtn.style.border = "none";
    modalCloseBtn.style.background = "transparent";
    modalCloseBtn.style.cursor = "pointer";
    modalCloseBtn.style.fontSize = "18px";
    modalCloseBtn.style.lineHeight = "1";
    modalCloseBtn.style.padding = "6px";

    // コンテンツ領域
    modalContent = document.createElement("div");
    modalContent.className = "preview-modal-content";
    modalContent.style.paddingTop = "28px";

    modalContainer.appendChild(modalCloseBtn);
    modalContainer.appendChild(modalContent);
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // イベント: オーバーレイクリックで閉じる（コンテナ内クリックは閉じない）
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) hideModal();
    });

    modalCloseBtn.addEventListener("click", () =>
      hideModal(),
    );

    // Esc キーで閉じる
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") hideModal();
    });

    // モーダル内のリンククリックは要素の href に従うが、
    // 同一オリジンは同じタブで、外部は新しいタブで開くようにする
    modalContent.addEventListener("click", (ev) => {
      const a = ev.target.closest && ev.target.closest("a");
      if (!a) return;
      // prevent default してから処理
      ev.preventDefault();
      ev.stopPropagation();
      const hrefAttr = a.getAttribute("href") || a.href;
      if (!hrefAttr) return;
      if (isSameOriginUrl(hrefAttr)) {
        hideModal();
        // 相対パスのまま遷移（ブラウザが解決）
        location.href = hrefAttr;
      } else {
        window.open(hrefAttr, "_blank", "noopener");
      }
    });
  }

  function showModalWithNode(node) {
    ensureModal();
    // 既存コンテンツを差し替え
    modalContent.innerHTML = "";
    modalContent.appendChild(node);
    modalOverlay.style.display = "flex";
    // フォーカスを閉じるボタンに移す
    try {
      modalCloseBtn.focus();
    } catch (e) {}
    // prevent body scroll
    document.documentElement.classList.add(
      "preview-modal-open",
    );
    document.body.classList.add("preview-modal-open");
    document.body.style.overflow = "hidden";
  }

  function hideModal() {
    if (!modalOverlay) return;
    modalOverlay.style.display = "none";
    document.documentElement.classList.remove(
      "preview-modal-open",
    );
    document.body.classList.remove("preview-modal-open");
    document.body.style.overflow = "";
    // クリア（軽い遅延で中身を空にしておく）
    setTimeout(() => {
      if (modalContent) modalContent.innerHTML = "";
    }, 200);
  }

  /**
   * fetch して Document を返す（例外は呼び出し元で処理する）
   */
  async function fetchDocument(href) {
    const resolved = new URL(href, location.href).href;
    const resp = await fetch(resolved, {
      credentials: "include",
    });
    if (!resp.ok)
      throw new Error(
        `HTTP ${resp.status} ${resp.statusText}`,
      );
    const text = await resp.text();
    const parser = new DOMParser();
    return parser.parseFromString(text, "text/html");
  }

  /**
   * 取得したドキュメントの相対パスを補正する（../ を取り除く）
   * これにより挿入したノード内の相対パスが正しく動作しやすくする
   */
  function fixPaths(element) {
    if (!element || !element.querySelectorAll) return;
    const attrs = ["src", "href"];
    attrs.forEach((attr) => {
      const nodes = element.querySelectorAll(`[${attr}]`);
      nodes.forEach((node) => {
        const val = node.getAttribute(attr);
        if (!val) return;
        // ../ を取り除く簡易補正（プロジェクトの構造に依存するため必要なら調整）
        if (val.startsWith("../")) {
          node.setAttribute(
            attr,
            val.replace(/\.\.\//g, ""),
          );
        }
      });
    });
  }

  /**
   * Document からプレビュー用の要素を抽出して Node を返す
   * - doc に .work-detail があればそのノードを返す（スクリプトは削除）
   * - なければフォールバックでプレビューボディを生成して返す
   */
  function buildPreviewNodeFromDoc(doc, sourceHref) {
    // 1) .work-detail があるか
    const workDetail = doc.querySelector(".work-detail");
    if (workDetail) {
      // クローンしてスクリプト要素を削除
      const cloned = workDetail.cloneNode(true);
      // remove scripts for safety
      const scripts = cloned.querySelectorAll("script");
      scripts.forEach((s) => s.remove());
      // fix internal paths
      fixPaths(cloned);
      // optional: add a small caption or source link
      const footer = document.createElement("div");
      footer.style.marginTop = "12px";
      footer.style.fontSize = "13px";
      footer.style.color = "#666";
      footer.textContent = `Preview: ${sourceHref}`;
      cloned.appendChild(footer);
      return cloned;
    }

    // 2) フォールバック: title, og:image, p抜粋 を使ってカード風に作る
    const container = document.createElement("div");
    container.className = "preview-fallback";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "12px";

    // タイトル
    const title = (
      doc.querySelector('meta[property="og:title"]')
        ?.content ||
      doc.querySelector('meta[name="twitter:title"]')
        ?.content ||
      doc.querySelector("title")?.textContent ||
      ""
    ).trim();
    if (title) {
      const h = document.createElement("h2");
      h.textContent = title;
      h.style.margin = "0";
      h.style.fontSize = "18px";
      container.appendChild(h);
    }

    // 画像 (og:image)
    const imageUrl =
      doc.querySelector('meta[property="og:image"]')
        ?.content ||
      doc.querySelector('meta[name="twitter:image"]')
        ?.content ||
      null;
    if (imageUrl) {
      const imgWrap = document.createElement("div");
      imgWrap.style.width = "100%";
      imgWrap.style.maxHeight = "360px";
      imgWrap.style.overflow = "hidden";
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = title || "";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.objectFit = "cover";
      imgWrap.appendChild(img);
      container.appendChild(imgWrap);
    }

    // 抜粋（main p / article p / first p）
    let excerpt = "";
    const candidates = [
      doc.querySelector("main p"),
      doc.querySelector("article p"),
      doc.querySelector(".lead"),
      doc.querySelector("p"),
    ];
    for (const c of candidates) {
      if (c && c.textContent.trim()) {
        excerpt = c.textContent.trim();
        break;
      }
    }
    if (excerpt) {
      if (excerpt.length > 400)
        excerpt = excerpt.slice(0, 397) + "…";
      const p = document.createElement("p");
      p.textContent = excerpt;
      p.style.margin = "0";
      p.style.color = "#333";
      container.appendChild(p);
    }

    // リンク（開くボタン）
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "8px";

    const openBtn = document.createElement("button");
    openBtn.textContent = "開く";
    openBtn.style.background = "#0366d6";
    openBtn.style.color = "#fff";
    openBtn.style.border = "none";
    openBtn.style.padding = "8px 12px";
    openBtn.style.borderRadius = "6px";
    openBtn.style.cursor = "pointer";
    openBtn.addEventListener("click", () => {
      // 同一オリジンなら同タブで遷移、外部は新規タブ
      if (isSameOriginUrl(sourceHref)) {
        hideModal();
        location.href = sourceHref;
      } else {
        window.open(sourceHref, "_blank", "noopener");
      }
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "閉じる";
    closeBtn.style.background = "transparent";
    closeBtn.style.color = "#333";
    closeBtn.style.border = "1px solid #ddd";
    closeBtn.style.padding = "8px 12px";
    closeBtn.style.borderRadius = "6px";
    closeBtn.style.cursor = "pointer";
    closeBtn.addEventListener("click", () => hideModal());

    actions.appendChild(openBtn);
    actions.appendChild(closeBtn);

    container.appendChild(actions);

    // source hint
    const hint = document.createElement("div");
    hint.style.marginTop = "8px";
    hint.style.fontSize = "12px";
    hint.style.color = "#666";
    hint.textContent = `Preview: ${sourceHref}`;
    container.appendChild(hint);

    return container;
  }

  /**
   * 長押しトリガで呼ぶ処理
   * - href の getAttribute を使って相対パスを保つ
   * - fetch -> parse -> build node -> showModalWithNode
   */
  async function handleLongPressForAnchor(a) {
    if (!a || !a.getAttribute) return;
    const rawHref = a.getAttribute("href") || a.href;
    if (!rawHref) return;
    if (!isSameOriginUrl(rawHref)) return;

    try {
      const doc = await fetchDocument(rawHref);
      // build node（.work-detail があれば流用、なければフォールバック）
      const node = buildPreviewNodeFromDoc(doc, rawHref);
      showModalWithNode(node);
    } catch (err) {
      // fetch が失敗したらログを残して何もしない（UI を壊さない）
      console.error(
        "preview: failed to load target for preview",
        err,
      );
    }
  }

  // --- Pointer Events による長押し検出 --- //
  function onPointerDown(e) {
    // マウスなら左ボタンのみ
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const a = e.target.closest && e.target.closest("a");
    if (!a || !a.getAttribute) return;
    const hrefAttr = a.getAttribute("href");
    if (!hrefAttr) return;
    // 同一オリジンのみ
    if (!isSameOriginUrl(hrefAttr)) return;

    activeAnchor = a;
    suppressClick = false;
    startX = e.clientX;
    startY = e.clientY;

    longPressTimer = setTimeout(async () => {
      suppressClick = true;
      try {
        await handleLongPressForAnchor(activeAnchor);
      } catch (err) {
        console.error(
          "preview: long press handler error",
          err,
        );
      }
    }, LONG_PRESS_MS);

    // pointer capture（可能なら）
    try {
      e.target.setPointerCapture &&
        e.target.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function onPointerUpOrCancel(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    // タッチを離した後は suppressClick をそのままにして
    // クリックイベントで遷移抑止する（長押しで開いた場合）
  }

  function onPointerMove(e) {
    if (!longPressTimer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // 長押し直後の click を抑止する
  function onClickCapture(e) {
    const a = e.target.closest && e.target.closest("a");
    if (!a) return;
    if (suppressClick && activeAnchor === a) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    } else {
      // 通常のクリックなら modal を閉じる（もし開いていれば）
      // ただし通常のクリックで開いた場合は suppressClick が true になるためここで閉じる
      // hideModal();
    }
  }

  // outside click でプレヴューを閉じる（モーダル以外の小さいプレビューも想定）
  function onDocumentClick(e) {
    // 既存の small preview は modalOverlay とは別なので、
    // ここでは modalOverlay に対する外部クリックは modalOverlay 自身で処理しているため何もしない。
    // （小さい inline preview があればその要素を閉じる処理を追加する）
  }

  // イベント登録
  document.addEventListener("pointerdown", onPointerDown, {
    passive: true,
  });
  document.addEventListener(
    "pointerup",
    onPointerUpOrCancel,
  );
  document.addEventListener(
    "pointercancel",
    onPointerUpOrCancel,
  );
  document.addEventListener("pointermove", onPointerMove, {
    passive: true,
  });
  document.addEventListener("click", onClickCapture, true); // キャプチャで先に抑止

  // Expose a global event for other scripts if they want to react to preview opens
  // 例: document.addEventListener('preview:opened', (e) => {...})
  // Dispatch は showModalWithNode の直後に行う
  const origShowModalWithNode = showModalWithNode;
  showModalWithNode = function (node) {
    origShowModalWithNode(node);
    try {
      const ev = new CustomEvent("preview:opened", {
        detail: { node },
      });
      document.dispatchEvent(ev);
    } catch (err) {}
  };

  // 初期化: 必要ならスタイルの最小セットを埋め込む（存在しない場合に備え）
  (function injectMinimalStyles() {
    // 既に埋め込まれていればスキップ
    if (document.getElementById("preview-js-styles"))
      return;
    const css = `
.preview-modal-overlay { backdrop-filter: none; }
.preview-modal-container { animation: previewModalShow .12s ease; }
@keyframes previewModalShow { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.preview-modal-content img { max-width: 100%; height: auto; display: block; }
.preview-modal-open { /* reserved for body lock if needed */ }
    `;
    const s = document.createElement("style");
    s.id = "preview-js-styles";
    s.type = "text/css";
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  })();
})();
