/**
 * preview.js
 * --------------------------------------------------
 * 長押し / スワイプでページ内リンクのプレビュー（モーダル）を表示するスクリプト
 *
 * 追加機能（今回の編集）
 * - iframe モードをデフォルトで追加（完全再現を優先）
 * - inline モードの際はページ固有 CSS を親 document に注入してプレビュー再現性を高める（プレビュー中のみ適用、閉じたら削除）
 * - モード切替 API（setMode）および open に mode オプションを追加
 *
 * 注意:
 * - iframe モードは「同一オリジン」環境でのみ iframe.contentDocument にアクセスしてヘッダー／フッターを非表示にできます。
 * - inline モードでの CSS 注入は親ドキュメントへスタイルを一時的に追加するため、スタイル競合の副作用が発生する可能性があります。
 * - ローカルでの確認は HTTP サーバー（http://localhost:8000 等）で行ってください（file:// だと fetch が失敗することがあります）。
 * --------------------------------------------------
 */
(() => {
  "use strict";

  // 設定
  const DEFAULT_MODE = "iframe"; // 'iframe' | 'inline'
  const LONG_PRESS_MS = 500; // 長押し判定 (ms)
  const SWIPE_OPEN_THRESHOLD = 48; // 右スワイプで開く閾値 (px)
  const SWIPE_CLOSE_THRESHOLD = 48; // 左スワイプで閉じる閾値 (px)
  const MOVE_CANCEL_TOLERANCE = 10; // 長押し中にこれ以上動いたらキャンセル (px)

  // state for pointer on anchors
  let longPressTimer = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerId = null;
  let activeAnchor = null;
  let suppressClick = false;

  // modal elements (single instance)
  let modalOverlay = null;
  let modalContainer = null;
  let modalContent = null;
  let modalCloseBtn = null;

  // runtime mode
  let mode = DEFAULT_MODE;

  // injected style elements for inline-mode cleanup
  const injectedStyleHandles = []; // { el: HTMLStyleElement, origin: string }

  // TRACK current iframe (if any) to cleanup later
  let currentIframe = null;
  let currentIframeOnLoad = null;

  // helpers
  function isSameOriginUrl(href) {
    try {
      const url = new URL(href, location.href);
      return url.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function resolveUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch (e) {
      return href;
    }
  }

  // create modal DOM using portfolio modal class names for style consistency
  function ensureModal() {
    if (modalOverlay) return;

    modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

    modalContainer = document.createElement("div");
    modalContainer.className = "modal-container";

    modalCloseBtn = document.createElement("button");
    modalCloseBtn.className = "modal-close";
    modalCloseBtn.type = "button";
    modalCloseBtn.innerHTML = "&times;";
    modalCloseBtn.setAttribute("aria-label", "Close");

    modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    modalContainer.appendChild(modalCloseBtn);
    modalContainer.appendChild(modalContent);
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // events
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) hideModal();
    });
    modalCloseBtn.addEventListener("click", hideModal);

    // Esc closes
    document.addEventListener("keydown", (ev) => {
      if (
        ev.key === "Escape" &&
        modalOverlay.classList.contains("is-open")
      ) {
        hideModal();
      }
    });

    // swipe left on modalContainer => close
    let mStartX = 0;
    let mStartY = 0;
    let mPointerId = null;
    function onModalPointerDown(ev) {
      if (ev.isPrimary === false) return;
      mPointerId = ev.pointerId;
      mStartX = ev.clientX;
      mStartY = ev.clientY;
      try {
        modalContainer.setPointerCapture &&
          modalContainer.setPointerCapture(ev.pointerId);
      } catch (_) {}
    }
    function onModalPointerMove(ev) {
      if (mPointerId !== ev.pointerId) return;
      const dx = ev.clientX - mStartX;
      const dy = ev.clientY - mStartY;
      if (
        Math.abs(dx) > Math.abs(dy) &&
        dx < -SWIPE_CLOSE_THRESHOLD
      ) {
        hideModal();
        try {
          modalContainer.releasePointerCapture &&
            modalContainer.releasePointerCapture(
              ev.pointerId,
            );
        } catch (_) {}
        mPointerId = null;
      }
    }
    function onModalPointerUp(ev) {
      if (mPointerId !== ev.pointerId) return;
      try {
        modalContainer.releasePointerCapture &&
          modalContainer.releasePointerCapture(
            ev.pointerId,
          );
      } catch (_) {}
      mPointerId = null;
    }
    modalContainer.addEventListener(
      "pointerdown",
      onModalPointerDown,
      { passive: true },
    );
    modalContainer.addEventListener(
      "pointermove",
      onModalPointerMove,
      { passive: true },
    );
    modalContainer.addEventListener(
      "pointerup",
      onModalPointerUp,
    );

    // intercept clicks inside modalContent to allow modal-internal navigation
    modalContent.addEventListener("click", (ev) => {
      const a = ev.target.closest && ev.target.closest("a");
      if (!a) return;
      const href = a.getAttribute("href") || a.href;
      if (!href) return;
      // same-origin -> load within modal; external -> open new tab
      if (isSameOriginUrl(href)) {
        ev.preventDefault();
        ev.stopPropagation();
        // load within modal: use the global open so that iframe/inline behavior applies
        loadAndShowContent(href);
      } else {
        // external: let it open in new tab
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });
  }

  function showModal() {
    ensureModal();
    modalOverlay.classList.add("is-open");
    document.body.classList.add("no-scroll");
  }

  function hideModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");

    // cleanup content after animation
    setTimeout(() => {
      if (!modalOverlay.classList.contains("is-open")) {
        // remove iframe if present
        cleanupIframe();
        // remove injected styles (inline mode)
        cleanupInjectedStyles();
        if (modalContent) modalContent.innerHTML = "";
      }
    }, 300);
  }

  // sanitize node by removing <script> and inline event handlers
  function sanitizeNode(node) {
    if (!node || !node.querySelectorAll) return;
    // remove script tags
    const scripts = node.querySelectorAll("script");
    scripts.forEach((s) => s.remove());
    // remove on* attributes
    const all = node.querySelectorAll("*");
    all.forEach((el) => {
      for (let i = el.attributes.length - 1; i >= 0; i--) {
        const attr = el.attributes[i];
        if (/^on/i.test(attr.name)) {
          el.removeAttribute(attr.name);
        }
      }
    });
  }

  // fix relative src/href attributes inside element to absolute based on baseHref
  function fixRelativePaths(element, baseHref) {
    if (!element || !element.querySelectorAll) return;
    const attrs = ["src", "href"];
    attrs.forEach((attr) => {
      const nodes = element.querySelectorAll(`[${attr}]`);
      nodes.forEach((n) => {
        const val = n.getAttribute(attr);
        if (!val) return;
        try {
          const resolved = new URL(val, baseHref).href;
          n.setAttribute(attr, resolved);
        } catch (e) {
          // leave it
        }
      });
    });
  }

  // fetch document at href and return {doc, resolvedUrl}
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
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    return { doc, resolved };
  }

  // Build a node to insert into modal from the fetched document (used by inline mode).
  function buildModalNodeFromDocument(doc, baseUrl) {
    let node =
      doc.querySelector("main") ||
      doc.querySelector(".work-detail") ||
      doc.querySelector("article");
    if (node) {
      const clone = node.cloneNode(true);
      sanitizeNode(clone);
      fixRelativePaths(clone, baseUrl);
      // optionally remove site header/footer if present inside the node
      const header = clone.querySelector(
        "header, .site-header, .page-header",
      );
      if (header) header.remove();
      const footer = clone.querySelector(
        "footer, .site-footer, .page-footer",
      );
      if (footer) footer.remove();
      return clone;
    }

    // fallback: clone body and remove common header/footer selectors
    const bodyClone = doc.body.cloneNode(true);
    const toRemove = bodyClone.querySelectorAll(
      "header, footer, nav, .site-header, .site-footer, .page-header, .page-footer",
    );
    toRemove.forEach((n) => n.remove());
    sanitizeNode(bodyClone);
    fixRelativePaths(bodyClone, baseUrl);
    return bodyClone;
  }

  // Inline-mode: extract style/link nodes and inject CSS into parent document for preview duration
  async function injectStylesFromDocument(doc, baseUrl) {
    if (!doc) return;
    const headNodes = Array.from(
      doc.querySelectorAll(
        "link[rel~='stylesheet'], style",
      ),
    );
    for (const n of headNodes) {
      if (n.tagName.toLowerCase() === "style") {
        const styleEl = document.createElement("style");
        styleEl.setAttribute(
          "data-preview-origin",
          baseUrl,
        );
        styleEl.textContent = n.textContent || "";
        document.head.appendChild(styleEl);
        injectedStyleHandles.push({
          el: styleEl,
          origin: baseUrl,
        });
      } else if (n.tagName.toLowerCase() === "link") {
        // try to fetch the CSS if same-origin to avoid CORS issues
        const href = n.getAttribute("href");
        if (!href) continue;
        try {
          const resolved = new URL(href, baseUrl).href;
          if (
            new URL(resolved).origin === location.origin
          ) {
            // fetch css text and inject as <style>
            try {
              const resp = await fetch(resolved, {
                credentials: "include",
              });
              if (resp.ok) {
                const cssText = await resp.text();
                const styleEl =
                  document.createElement("style");
                styleEl.setAttribute(
                  "data-preview-origin",
                  resolved,
                );
                styleEl.textContent = cssText;
                document.head.appendChild(styleEl);
                injectedStyleHandles.push({
                  el: styleEl,
                  origin: resolved,
                });
              } else {
                // fallback: create a link element in parent head (less ideal)
                const linkClone =
                  document.createElement("link");
                linkClone.rel = "stylesheet";
                linkClone.href = resolved;
                linkClone.setAttribute(
                  "data-preview-origin",
                  resolved,
                );
                document.head.appendChild(linkClone);
                injectedStyleHandles.push({
                  el: linkClone,
                  origin: resolved,
                });
              }
            } catch (e) {
              // can't fetch; try to insert link (may fail due to CSP)
              const linkClone =
                document.createElement("link");
              linkClone.rel = "stylesheet";
              linkClone.href = resolved;
              linkClone.setAttribute(
                "data-preview-origin",
                resolved,
              );
              document.head.appendChild(linkClone);
              injectedStyleHandles.push({
                el: linkClone,
                origin: resolved,
              });
            }
          } else {
            // cross-origin link: avoid fetching; insert link but note CSP/COEP may block it
            const linkClone =
              document.createElement("link");
            linkClone.rel = "stylesheet";
            linkClone.href = resolved;
            linkClone.setAttribute(
              "data-preview-origin",
              resolved,
            );
            document.head.appendChild(linkClone);
            injectedStyleHandles.push({
              el: linkClone,
              origin: resolved,
            });
          }
        } catch (e) {
          // ignore malformed href
        }
      }
    }
  }

  function cleanupInjectedStyles() {
    while (injectedStyleHandles.length) {
      const h = injectedStyleHandles.pop();
      try {
        h.el.remove && h.el.remove();
      } catch (_) {}
    }
  }

  // IFRAME handling
  function createAndShowIframe(resolvedUrl) {
    ensureModal();

    // cleanup any existing iframe
    cleanupIframe();

    const iframe = document.createElement("iframe");
    iframe.className = "preview-iframe";
    iframe.src = resolvedUrl;
    iframe.setAttribute("aria-label", "Preview frame");
    iframe.style.width = "100%";
    iframe.style.height = "80vh";
    iframe.style.border = "0";

    // small source note (can be styled by CSS)
    const srcNote = document.createElement("div");
    srcNote.className = "preview-source-note";
    srcNote.textContent = `Preview: ${resolvedUrl}`;

    modalContent.innerHTML = ""; // clear previous
    modalContent.appendChild(srcNote);
    modalContent.appendChild(iframe);

    showModal();

    // onload: try to hide header/footer and adjust links
    const onload = function () {
      try {
        const doc = iframe.contentDocument;
        if (!doc) throw new Error("no doc");
        // inject CSS to hide common header/footer selectors
        const hideStyle = doc.createElement("style");
        hideStyle.setAttribute(
          "data-preview-injected",
          "true",
        );
        hideStyle.textContent =
          "header, footer, .site-header, .site-footer, .page-header, .page-footer { display: none !important; }";
        doc.head && doc.head.appendChild(hideStyle);

        // ensure links: external -> open new tab; internal -> normal (navigates inside iframe)
        const fixLinksScript = doc.createElement("script");
        fixLinksScript.setAttribute(
          "data-preview-injected",
          "true",
        );
        fixLinksScript.type = "text/javascript";
        // The script will run in the iframe document and make external links open in new tab
        fixLinksScript.textContent = `
          (function(){
            try {
              const all = Array.from(document.querySelectorAll('a[href]'));
              all.forEach(a => {
                try {
                  const href = a.getAttribute('href');
                  if (!href) return;
                  const url = new URL(href, location.href);
                  if (url.origin !== location.origin) {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener noreferrer');
                  } else {
                    // internal links: keep behavior (navigates inside iframe)
                    a.removeAttribute('target');
                  }
                  // Prevent clicks that would break out of iframe via top.location in inline scripts:
                  a.addEventListener('click', function(e){
                    // allow default to let iframe navigate normally
                  }, { passive:true });
                } catch(e) {}
              });
            } catch(e){}
          })();
        `;
        // append script to iframe doc to execute
        doc.head && doc.head.appendChild(fixLinksScript);
      } catch (e) {
        // cross-origin or other access error -> fallback: show plain message and offer open in new tab
        modalContent.innerHTML =
          '<div style="padding:2rem;text-align:center;color:var(--color-text-muted);">このページはプレビューできません。<br><a class="preview-open-external" href="' +
          resolvedUrl +
          '" target="_blank" rel="noopener noreferrer">新しいタブで開く</a></div>';
      }
    };

    iframe.addEventListener("load", onload, {
      passive: true,
    });

    // store references for cleanup
    currentIframe = iframe;
    currentIframeOnLoad = onload;
  }

  function cleanupIframe() {
    if (currentIframe) {
      try {
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

  // load href and show its content inside modal (MODE-aware)
  async function loadAndShowContent(href, opts = {}) {
    const useMode = opts.mode || mode || DEFAULT_MODE;
    const resolved = resolveUrl(href);

    if (useMode === "iframe") {
      // iframe mode: try to create iframe and show it
      // but verify same-origin for injected manipulations; we still create iframe even if cross-origin
      createAndShowIframe(resolved);
      return;
    }

    // inline mode: fetch document, extract node, and inject page-specific CSS into parent
    try {
      const { doc } = await fetchDocument(href);
      // inject styles into parent head (only for inline mode)
      try {
        await injectStylesFromDocument(doc, resolved);
      } catch (e) {
        // ignore injection errors
        console.warn("preview: style injection failed", e);
      }

      const node = buildModalNodeFromDocument(
        doc,
        resolved,
      );

      // tweak node classes to match modal inner content expectations
      if (
        !node.classList ||
        !node.classList.contains("work-detail")
      ) {
        try {
          node.classList.add("work-detail");
        } catch (_) {}
      }
      node.classList.remove &&
        node.classList.remove("reveal-on-scroll");

      ensureModal();
      modalContent.innerHTML = "";
      // optional small header note (styled by preview.css)
      const srcNote = document.createElement("div");
      srcNote.className = "preview-source-note";
      srcNote.textContent = `Preview: ${resolved}`;
      modalContent.appendChild(srcNote);
      modalContent.appendChild(node);
      showModal();
    } catch (err) {
      console.error("preview: load failed", err);
      ensureModal();
      modalContent.innerHTML =
        '<div style="padding:2rem;text-align:center;color:var(--color-text-muted);">コンテンツの読み込みに失敗しました。</div>';
      showModal();
    }
  }

  // Handling long press and swipe-to-open on anchors
  function onAnchorPointerDown(ev) {
    if (ev.isPrimary === false) return;
    if (ev.pointerType === "mouse" && ev.button !== 0)
      return;

    const a = ev.target.closest && ev.target.closest("a");
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

    longPressTimer = setTimeout(async () => {
      longPressTimer = null;
      suppressClick = true;
      await loadAndShowContent(hrefAttr);
    }, LONG_PRESS_MS);
  }

  function onAnchorPointerMove(ev) {
    if (!activeAnchor) return;
    if (ev.pointerId !== pointerId) return;

    const dx = ev.clientX - pointerStartX;
    const dy = ev.clientY - pointerStartY;

    // if moved too much vertically, cancel long press
    if (
      Math.hypot(dx, dy) > MOVE_CANCEL_TOLERANCE &&
      Math.abs(dy) > Math.abs(dx)
    ) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      return;
    }

    // horizontal swipe to open: right swipe
    if (
      dx > SWIPE_OPEN_THRESHOLD &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      suppressClick = true;
      const hrefAttr =
        activeAnchor.getAttribute("href") ||
        activeAnchor.href;
      loadAndShowContent(hrefAttr);
      try {
        activeAnchor.releasePointerCapture &&
          activeAnchor.releasePointerCapture(pointerId);
      } catch (_) {}
      activeAnchor = null;
      pointerId = null;
    }
  }

  function onAnchorPointerUp(ev) {
    if (!activeAnchor) return;
    if (ev.pointerId !== pointerId) return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    try {
      activeAnchor.releasePointerCapture &&
        activeAnchor.releasePointerCapture(pointerId);
    } catch (_) {}
    activeAnchor = null;
    pointerId = null;
  }

  // click capture to suppress navigation when necessary
  function onDocumentClickCapture(ev) {
    const a = ev.target.closest && ev.target.closest("a");
    if (!a) return;
    if (suppressClick) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressClick = false;
    } else {
      // when clicking normal and modal open, do nothing here; modal internal clicks are handled
    }
  }

  // attach listeners globally to detect pointer interactions on anchors
  document.addEventListener(
    "pointerdown",
    (ev) => {
      const a = ev.target.closest && ev.target.closest("a");
      if (!a) return;
      onAnchorPointerDown(ev);
    },
    { passive: true },
  );

  document.addEventListener(
    "pointermove",
    (ev) => {
      if (activeAnchor) onAnchorPointerMove(ev);
    },
    { passive: true },
  );

  document.addEventListener("pointerup", (ev) => {
    if (activeAnchor) onAnchorPointerUp(ev);
  });

  // capture click to suppress default navigation when long-press/swipe opened preview
  document.addEventListener(
    "click",
    onDocumentClickCapture,
    true,
  );

  // Public API
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
      if (m === "iframe" || m === "inline") {
        mode = m;
      } else {
        console.warn(
          "previewModal.setMode: unsupported mode",
          m,
        );
      }
    },
    getMode: () => mode,
  };
})();
