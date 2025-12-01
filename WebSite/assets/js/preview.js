/**
 * preview.js
 * --------------------------------------------------
 * 長押しでリンク先をプレビュー表示するスクリプト（リファクタ版）
 *
 * 概要（日本語コメント主体）:
 * - 同一オリジンのリンクを長押し（500ms）するとプレビューをモーダルで表示します。
 * - デフォルトは iframe モード（完全再現）。inline モードは Shadow DOM による安全レンダリング。
 * - ユーザー補助のために以下の UI を実装:
 *   - ホバー時のヒント（デスクトップ向け）
 *   - 長押しの進捗を示す「プレスインジケータ」（指／カーソル追従）
 * - 外部公開 API:
 *   - window.previewModal.open(href, opts)
 *   - window.previewModal.close()
 *   - window.previewModal.setMode(mode)
 *   - window.previewModal.getMode()
 *
 * 実装方針:
 * - イベントは基本的にイベントデリゲーションで扱い、ページ負荷を抑える。
 * - Shadow DOM を用いて inline モードの CSS 注入を親ドキュメントへ影響させず行う。
 * - 同一オリジンでない場合は iframe の DOM にアクセスできないのでフォールバック表示を行う。
 *
 * 注意:
 * - ローカルファイル (file://) での動作は不安定になりがちなので HTTP サーバ上で確認してください。
 * - CSS は `assets/css/preview.css` を優先します。読み込まれていない場合は簡易フォールバックスタイルを注入します。
 * --------------------------------------------------
 */
(function () {
  "use strict";

  /* =========================
   * 設定
   * ========================= */
  const DEFAULT_MODE = "iframe"; // 'iframe' | 'inline'
  const LONG_PRESS_MS = 500; // 長押し判定(ms)
  const MOVE_CANCEL_TOLERANCE = 10; // 長押し中にこれ以上動いたらキャンセル(px)

  /* =========================
   * 状態
   * ========================= */
  let mode = DEFAULT_MODE;

  // 長押し検知用 state
  let longPressTimer = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerId = null;
  let activeAnchor = null;
  let suppressClick = false;

  // モーダル/iframe/inline 用 DOM シングルトン
  let modalOverlay = null;
  let modalContainer = null;
  let modalContent = null;
  let modalCloseBtn = null;
  let modalOpenBtn = null; // 新しいタブで開くボタン
  let previewSourceNote = null;
  let currentPreviewUrl = null;

  // iframe / inline のクリーンアップ参照
  let currentIframe = null;
  let currentIframeOnLoad = null;
  let currentShadowHost = null;
  let currentShadowRoot = null;

  // プレスインジケータ UI
  let pressIndicator = null;
  let pressRaf = null;
  let pressStartTime = 0;

  // ホバーヒント
  let hoverHint = null;

  /* =========================
   * ヘルパー
   * ========================= */
  function resolveUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch (e) {
      return href;
    }
  }

  function isSameOriginUrl(href) {
    try {
      const u = new URL(href, location.href);
      return u.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function elOrNull(sel, root = document) {
    try {
      return root.querySelector(sel);
    } catch (_) {
      return null;
    }
  }

  /* =========================
   * モーダルの作成/表示/破棄
   * ========================= */
  function ensureModal() {
    if (modalOverlay) return;

    modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

    modalContainer = document.createElement("div");
    modalContainer.className = "modal-container";
    modalContainer.style.position = "relative";

    // Open (new tab) ボタン
    modalOpenBtn = document.createElement("button");
    modalOpenBtn.className = "modal-open-btn";
    modalOpenBtn.type = "button";
    modalOpenBtn.setAttribute(
      "aria-label",
      "Open preview in new tab",
    );
    modalOpenBtn.textContent = "⤴";
    Object.assign(modalOpenBtn.style, {
      position: "absolute",
      top: "0.6rem",
      right: "3.6rem",
      zIndex: "2147483647",
      background: "rgba(0,0,0,0.55)",
      color: "#fff",
      border: "none",
      padding: "6px 8px",
      borderRadius: "6px",
      cursor: "pointer",
    });
    modalOpenBtn.addEventListener("click", (ev) => {
      try {
        ev && ev.stopPropagation && ev.stopPropagation();
      } catch (_) {}
      if (currentPreviewUrl) {
        try {
          window.open(
            currentPreviewUrl,
            "_blank",
            "noopener,noreferrer",
          );
        } catch (_) {
          const a = document.createElement("a");
          a.href = currentPreviewUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.click();
        }
      }
    });

    // Close ボタン
    modalCloseBtn = document.createElement("button");
    modalCloseBtn.className = "modal-close";
    modalCloseBtn.type = "button";
    modalCloseBtn.setAttribute(
      "aria-label",
      "Close preview",
    );
    modalCloseBtn.innerHTML = "✕";
    Object.assign(modalCloseBtn.style, {
      position: "absolute",
      top: "0.6rem",
      right: "0.6rem",
      zIndex: "2147483647",
      pointerEvents: "auto",
      background: "rgba(0,0,0,0.65)",
      color: "#fff",
      border: "none",
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "1.05rem",
      lineHeight: "1",
    });
    modalCloseBtn.addEventListener("click", (ev) => {
      try {
        ev && ev.stopPropagation && ev.stopPropagation();
      } catch (_) {}
      hideModal();
    });
    modalCloseBtn.addEventListener(
      "pointerdown",
      (ev) => {
        try {
          ev && ev.stopPropagation && ev.stopPropagation();
        } catch (_) {}
        hideModal();
      },
      { passive: false },
    );

    // コンテンツ領域とソースノート
    previewSourceNote = document.createElement("div");
    previewSourceNote.className = "preview-source-note";
    modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    // DOM 組み立て
    modalContainer.appendChild(modalOpenBtn);
    modalContainer.appendChild(modalCloseBtn);
    modalContainer.appendChild(previewSourceNote);
    modalContainer.appendChild(modalContent);
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // バックドロップクリックで閉じる
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) hideModal();
    });

    // Esc で閉じる
    document.addEventListener("keydown", (ev) => {
      if (
        ev.key === "Escape" &&
        modalOverlay.classList.contains("is-open")
      )
        hideModal();
    });

    // capture での close 保険（他の拡張等がバブリングを止めるケースに対処）
    function captureClose(e) {
      try {
        const btn =
          e.target &&
          e.target.closest &&
          e.target.closest(".modal-close");
        if (btn) {
          try {
            e.stopImmediatePropagation &&
              e.stopImmediatePropagation();
            e.preventDefault && e.preventDefault();
          } catch (_) {}
          hideModal();
        }
      } catch (_) {}
    }
    document.addEventListener(
      "pointerdown",
      captureClose,
      true,
    );
    document.addEventListener(
      "mousedown",
      captureClose,
      true,
    );
    document.addEventListener("touchstart", captureClose, {
      capture: true,
      passive: false,
    });
  }

  function showModal() {
    ensureModal();
    modalOverlay.classList.add("is-open");
    document.body.classList.add("no-scroll");
  }

  function cleanupIframe() {
    if (currentIframe) {
      try {
        currentIframe.removeEventListener &&
          currentIframe.removeEventListener(
            "load",
            currentIframeOnLoad,
          );
      } catch (_) {}
      try {
        currentIframe.remove && currentIframe.remove();
      } catch (_) {}
      currentIframe = null;
      currentIframeOnLoad = null;
    }
  }

  function cleanupShadow() {
    if (currentShadowHost) {
      try {
        currentShadowHost.remove();
      } catch (_) {}
      currentShadowHost = null;
      currentShadowRoot = null;
    }
  }

  function hideModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
      cleanupIframe();
      cleanupShadow();
      currentPreviewUrl = null;
      if (modalContent) modalContent.innerHTML = "";
      if (previewSourceNote)
        previewSourceNote.textContent = "";
    }, 220);
  }

  /* =========================
   * iframe / inline 表示
   * ========================= */
  async function fetchDocument(href) {
    const resolved = resolveUrl(href);
    const resp = await fetch(resolved, {
      credentials: "include",
    });
    if (!resp.ok)
      throw new Error(
        `HTTP ${resp.status} ${resp.statusText}`,
      );
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(
      text,
      "text/html",
    );
    return { doc, resolved };
  }

  function buildModalNodeFromDocument(doc, baseUrl) {
    let node =
      doc.querySelector("main") ||
      doc.querySelector(".work-detail") ||
      doc.querySelector("article");
    if (node) {
      const clone = node.cloneNode(true);
      sanitizeNode(clone);
      fixRelativePaths(clone, baseUrl);
      const h = clone.querySelector(
        "header, .site-header, .page-header",
      );
      if (h) h.remove();
      const f = clone.querySelector(
        "footer, .site-footer, .page-footer",
      );
      if (f) f.remove();
      return clone;
    }
    const bodyClone = doc.body.cloneNode(true);
    const toRemove = bodyClone.querySelectorAll(
      "header, footer, nav, .site-header, .site-footer, .page-header, .page-footer",
    );
    toRemove.forEach((n) => n.remove());
    sanitizeNode(bodyClone);
    fixRelativePaths(bodyClone, baseUrl);
    return bodyClone;
  }

  async function injectIntoShadow(
    doc,
    baseUrl,
    shadowRoot,
  ) {
    if (!doc || !shadowRoot) return;
    const nodes = Array.from(
      doc.querySelectorAll(
        "style, link[rel~='stylesheet']",
      ),
    );
    for (const n of nodes) {
      try {
        if (n.tagName.toLowerCase() === "style") {
          const s = document.createElement("style");
          s.textContent = n.textContent || "";
          shadowRoot.appendChild(s);
        } else if (n.tagName.toLowerCase() === "link") {
          const href = n.getAttribute("href");
          if (!href) continue;
          const resolved = new URL(href, baseUrl).href;
          try {
            const urlObj = new URL(resolved);
            if (urlObj.origin === location.origin) {
              const resp = await fetch(resolved, {
                credentials: "include",
              });
              if (resp.ok) {
                const cssText = await resp.text();
                const s = document.createElement("style");
                s.textContent = cssText;
                shadowRoot.appendChild(s);
              }
            }
          } catch (_) {
            // fallback @import
            try {
              const s = document.createElement("style");
              s.textContent = `@import url("${resolved}");`;
              shadowRoot.appendChild(s);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  function createAndShowIframe(resolvedUrl) {
    ensureModal();
    cleanupIframe();
    cleanupShadow();

    const iframe = document.createElement("iframe");
    iframe.className = "preview-iframe";
    iframe.src = resolvedUrl;
    iframe.setAttribute(
      "aria-label",
      `Preview: ${resolvedUrl}`,
    );
    iframe.style.width = "100%";
    iframe.style.height = "80vh";
    iframe.style.border = "0";
    iframe.style.background = "transparent";

    currentPreviewUrl = resolvedUrl;
    if (previewSourceNote)
      previewSourceNote.textContent = `Preview: ${resolvedUrl}`;

    modalContent.innerHTML = "";
    modalContent.appendChild(iframe);
    showModal();

    const onload = function () {
      try {
        const idoc = iframe.contentDocument;
        if (!idoc) throw new Error("no doc");
        try {
          const t = idoc.title;
          if (t) previewSourceNote.textContent = t;
        } catch (_) {}
        try {
          const hideStyle = idoc.createElement("style");
          hideStyle.textContent =
            "header, footer, .site-header, .site-footer, .page-header, .page-footer { display: none !important; } body { margin: 0 !important; }";
          idoc.head && idoc.head.appendChild(hideStyle);
        } catch (_) {}
        try {
          const anchors = Array.from(
            idoc.querySelectorAll("a[href]"),
          );
          anchors.forEach((a) => {
            try {
              const ahref = a.getAttribute("href");
              const url = new URL(ahref, resolvedUrl);
              if (url.origin !== location.origin) {
                a.setAttribute("target", "_blank");
                a.setAttribute(
                  "rel",
                  "noopener noreferrer",
                );
              } else {
                a.removeAttribute("target");
              }
            } catch (_) {}
          });
        } catch (_) {}
      } catch (e) {
        modalContent.innerHTML =
          '<div style="padding:2rem;text-align:center;color:var(--color-text-muted);">このページはプレビューできません。<br><a href="' +
          resolvedUrl +
          '" target="_blank" rel="noopener noreferrer">新しいタブで開く</a></div>';
      }
    };

    iframe.addEventListener("load", onload, {
      passive: true,
    });
    currentIframe = iframe;
    currentIframeOnLoad = onload;
  }

  async function loadAndShowContent(href, opts = {}) {
    const useMode = opts.mode || mode || DEFAULT_MODE;
    const resolved = resolveUrl(href);

    if (useMode === "iframe") {
      createAndShowIframe(resolved);
      return;
    }

    try {
      const { doc, resolved: base } =
        await fetchDocument(href);
      const node = buildModalNodeFromDocument(doc, base);
      try {
        if (!node.classList.contains("work-detail"))
          node.classList.add("work-detail");
      } catch (_) {}
      sanitizeNode(node);
      fixRelativePaths(node, base);

      ensureModal();
      modalContent.innerHTML = "";
      previewSourceNote.textContent =
        doc.title || `Preview: ${base}`;

      cleanupShadow();
      const host = document.createElement("div");
      host.className = "preview-shadow-host";
      modalContent.appendChild(host);
      let shadowRoot = null;
      try {
        shadowRoot = host.attachShadow
          ? host.attachShadow({ mode: "open" })
          : null;
      } catch (_) {
        shadowRoot = null;
      }

      if (shadowRoot) {
        const wrapperStyle =
          document.createElement("style");
        wrapperStyle.textContent =
          ":host{display:block} .preview-body{padding:0.25rem 0.5rem}";
        shadowRoot.appendChild(wrapperStyle);
        await injectIntoShadow(doc, base, shadowRoot);
        const wrapper = document.createElement("div");
        wrapper.className = "preview-body";
        wrapper.appendChild(node);
        shadowRoot.appendChild(wrapper);
        currentShadowHost = host;
        currentShadowRoot = shadowRoot;
      } else {
        modalContent.appendChild(node);
        currentShadowHost = null;
        currentShadowRoot = null;
      }

      currentPreviewUrl = base;
      showModal();
    } catch (err) {
      console.error("preview: load failed", err);
      ensureModal();
      modalContent.innerHTML =
        '<div style="padding:2rem;text-align:center;color:var(--color-text-muted);">コンテンツの読み込みに失敗しました。</div>';
      showModal();
    }
  }

  /* =========================
   * プレスインジケータ（長押しのビジュアル）
   * - カーソル／指に追従する円形の進捗表示
   * ========================= */
  function ensurePressIndicator() {
    if (pressIndicator) return;
    pressIndicator = document.createElement("div");
    pressIndicator.className = "preview-press-indicator";
    pressIndicator.setAttribute("aria-hidden", "true");
    pressIndicator.innerHTML =
      '<div class="ppi-ring"></div>';
    document.body.appendChild(pressIndicator);
  }

  function showPressIndicator(x, y) {
    ensurePressIndicator();
    const size = 48;
    pressIndicator.style.display = "flex";
    pressIndicator.style.left = x - size / 2 + "px";
    pressIndicator.style.top = y - size / 2 + "px";
    pressStartTime = performance.now();
    cancelPressRaf();
    pressRaf = requestAnimationFrame(updatePressIndicator);
  }

  function updatePressIndicator(now) {
    const elapsed = now - pressStartTime;
    const progress = Math.max(
      0,
      Math.min(1, elapsed / LONG_PRESS_MS),
    );
    pressIndicator.style.setProperty(
      "--ppi-progress",
      String(progress),
    );
    if (progress >= 1) {
      pressIndicator.classList.add("completed");
      setTimeout(hidePressIndicator, 140);
      cancelPressRaf();
      return;
    }
    pressRaf = requestAnimationFrame(updatePressIndicator);
  }

  function cancelPressRaf() {
    if (pressRaf) {
      cancelAnimationFrame(pressRaf);
      pressRaf = null;
    }
  }

  function hidePressIndicator() {
    cancelPressRaf();
    if (!pressIndicator) return;
    pressIndicator.style.display = "none";
    pressIndicator.classList.remove("completed");
    pressIndicator.style.setProperty("--ppi-progress", "0");
  }

  /* =========================
   * ホバーヒント（デスクトップ）
   * ========================= */
  function ensureHoverHint() {
    if (hoverHint) return;
    hoverHint = document.createElement("div");
    hoverHint.className = "preview-hint";
    hoverHint.setAttribute("aria-hidden", "true");
    hoverHint.textContent = "長押しでプレビュー";
    document.body.appendChild(hoverHint);
  }

  function showHoverHintFor(el) {
    ensureHoverHint();
    const rect = el.getBoundingClientRect();
    hoverHint.style.display = "block";
    const x = rect.left + rect.width / 2;
    const y = rect.top - 8;
    const hw = hoverHint.offsetWidth || 140;
    hoverHint.style.left = x - hw / 2 + "px";
    hoverHint.style.top = y - hoverHint.offsetHeight + "px";
  }

  function hideHoverHint() {
    if (!hoverHint) return;
    hoverHint.style.display = "none";
  }

  /* =========================
   * 長押しイベントハンドラ
   * ========================= */
  function onAnchorPointerDown(ev) {
    if (ev.isPrimary === false) return;
    if (ev.pointerType === "mouse" && ev.button !== 0)
      return;

    const a =
      ev.target &&
      ev.target.closest &&
      ev.target.closest("a");
    if (!a || !a.getAttribute) return;
    const hrefAttr = a.getAttribute("href");
    if (!hrefAttr) return;
    if (!isSameOriginUrl(hrefAttr)) return;

    activeAnchor = a;
    pointerStartX = ev.clientX;
    pointerStartY = ev.clientY;
    pointerId = ev.pointerId;
    suppressClick = false;

    try {
      a.setPointerCapture && a.setPointerCapture(pointerId);
    } catch (_) {}

    // show indicator and start timer
    showPressIndicator(ev.clientX, ev.clientY);

    longPressTimer = setTimeout(async () => {
      longPressTimer = null;
      suppressClick = true;
      hidePressIndicator();
      await loadAndShowContent(hrefAttr);
    }, LONG_PRESS_MS);
  }

  function onAnchorPointerMove(ev) {
    if (!activeAnchor) return;
    if (ev.pointerId !== pointerId) return;

    const dx = ev.clientX - pointerStartX;
    const dy = ev.clientY - pointerStartY;

    // cancel if moved vertically more than horizontal (user likely scrolled)
    if (
      Math.hypot(dx, dy) > MOVE_CANCEL_TOLERANCE &&
      Math.abs(dy) > Math.abs(dx)
    ) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      hidePressIndicator();
      return;
    }

    // update indicator position
    if (pressIndicator) {
      const size = 48;
      pressIndicator.style.left =
        ev.clientX - size / 2 + "px";
      pressIndicator.style.top =
        ev.clientY - size / 2 + "px";
    }
  }

  function onAnchorPointerUp(ev) {
    if (!activeAnchor) return;
    if (ev.pointerId !== pointerId) return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    hidePressIndicator();
    try {
      activeAnchor.releasePointerCapture &&
        activeAnchor.releasePointerCapture(pointerId);
    } catch (_) {}
    activeAnchor = null;
    pointerId = null;
  }

  function onDocumentClickCapture(ev) {
    const a =
      ev.target &&
      ev.target.closest &&
      ev.target.closest("a");
    if (!a) return;
    if (suppressClick) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressClick = false;
    }
  }

  /* =========================
   * イベントの接続
   * ========================= */
  // pointer events: delegation
  document.addEventListener(
    "pointerdown",
    (ev) => {
      try {
        const a =
          ev.target &&
          ev.target.closest &&
          ev.target.closest("a");
        if (!a) return;
        onAnchorPointerDown(ev);
      } catch (e) {
        console.warn(
          "preview: onAnchorPointerDown error",
          e,
        );
      }
    },
    { passive: false },
  );

  document.addEventListener(
    "pointermove",
    (ev) => {
      if (activeAnchor) {
        try {
          onAnchorPointerMove(ev);
        } catch (e) {
          console.warn(
            "preview: onAnchorPointerMove error",
            e,
          );
        }
      }
    },
    { passive: false },
  );

  document.addEventListener("pointerup", (ev) => {
    if (activeAnchor) onAnchorPointerUp(ev);
  });

  // click suppression
  document.addEventListener(
    "click",
    onDocumentClickCapture,
    true,
  );

  // hover hint on desktop
  document.addEventListener("mouseover", (ev) => {
    try {
      const a =
        ev.target &&
        ev.target.closest &&
        ev.target.closest("a");
      if (!a) return;
      const href = a.getAttribute && a.getAttribute("href");
      if (!href) return;
      if (!isSameOriginUrl(href)) return;
      if (
        navigator.maxTouchPoints &&
        navigator.maxTouchPoints > 0
      )
        return;
      showHoverHintFor(a);
    } catch (_) {}
  });
  document.addEventListener("mouseout", (ev) => {
    hideHoverHint();
  });

  /* =========================
   * Public API
   * ========================= */
  window.previewModal = {
    open: (href, opts = {}) => {
      if (!href) return;
      loadAndShowContent(href, opts);
    },
    close: () => hideModal(),
    isOpen: () =>
      !!(
        modalOverlay &&
        modalOverlay.classList.contains("is-open")
      ),
    setMode: (m) => {
      if (m === "iframe" || m === "inline") mode = m;
      else
        console.warn(
          "previewModal.setMode: unsupported mode",
          m,
        );
    },
    getMode: () => mode,
  };

  /* =========================
   * CSS フォールバック（preview.css が未ロードの場合の最小スタイル）
   * ========================= */
  (function ensureCssFallback() {
    if (document.getElementById("preview-css-fallback"))
      return;
    const css = `
.preview-press-indicator{position:fixed;display:none;width:48px;height:48px;border-radius:50%;align-items:center;justify-content:center;pointer-events:none;z-index:2147483646}
.preview-press-indicator .ppi-ring{width:40px;height:40px;border-radius:50%;background:conic-gradient(#fff calc(var(--ppi-progress,0)*1turn), rgba(255,255,255,0.12) 0);opacity:0.95}
.preview-hint{position:fixed;display:none;padding:6px 8px;background:rgba(0,0,0,0.8);color:#fff;border-radius:6px;font-size:12px;z-index:2147483646}
.modal-container .modal-close{z-index:2147483647}
.modal-content{padding:1rem;box-sizing:border-box;max-height:92vh;overflow:auto}
.preview-source-note{font-size:12px;color:var(--color-text-muted,#666);margin-bottom:8px}
`;
    const s = document.createElement("style");
    s.id = "preview-css-fallback";
    s.textContent = css;
    document.head.appendChild(s);
  })();
})();
