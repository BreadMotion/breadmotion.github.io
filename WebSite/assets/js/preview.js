(() => {
  "use strict";

  // Configuration
  const DEFAULT_MODE = "iframe"; // 'iframe' | 'inline'
  const LONG_PRESS_MS = 500; // long-press threshold (ms)
  const MOVE_CANCEL_TOLERANCE = 10; // long-press cancel movement (px)

  // State for pointer interactions on anchors
  let longPressTimer = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerId = null;
  let activeAnchor = null;
  let suppressClick = false;

  // Modal singletons
  let modalOverlay = null;
  let modalContainer = null;
  let modalContent = null;
  let modalCloseBtn = null;
  let modalOpenBtn = null;
  let previewSourceNote = null;

  // runtime mode & preview target
  let mode = DEFAULT_MODE;
  let currentPreviewUrl = null;

  // iframe tracking for cleanup
  let currentIframe = null;
  let currentIframeOnLoad = null;

  // shadow host (inline-safe rendering)
  let currentShadowHost = null;
  let currentShadowRoot = null;

  // Helpers
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

  // Sanitize nodes: remove scripts and inline event attributes
  function sanitizeNode(node) {
    if (!node || !node.querySelectorAll) return;
    const scripts = node.querySelectorAll("script");
    scripts.forEach((s) => s.remove());
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
          // ignore
        }
      });
    });
  }

  // Fetch and parse document
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

  // Choose the main node to show (prefer <main>, .work-detail, <article>, otherwise body)
  function buildModalNodeFromDocument(doc, baseUrl) {
    let node =
      doc.querySelector("main") ||
      doc.querySelector(".work-detail") ||
      doc.querySelector("article");
    if (node) {
      const clone = node.cloneNode(true);
      sanitizeNode(clone);
      fixRelativePaths(clone, baseUrl);
      const hdr = clone.querySelector(
        "header, .site-header, .page-header",
      );
      if (hdr) hdr.remove();
      const ftr = clone.querySelector(
        "footer, .site-footer, .page-footer",
      );
      if (ftr) ftr.remove();
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

  // Ensure modal DOM exists
  function ensureModal() {
    if (modalOverlay) return;

    modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

    modalContainer = document.createElement("div");
    modalContainer.className = "modal-container";
    // ensure relative positioning for absolute children
    modalContainer.style.position =
      modalContainer.style.position || "relative";

    // Open-in-new-tab button (left of close)
    modalOpenBtn = document.createElement("button");
    modalOpenBtn.className = "modal-open-btn";
    modalOpenBtn.type = "button";
    modalOpenBtn.innerHTML = "⤴"; // upward-right arrow indicating open externally
    modalOpenBtn.setAttribute(
      "aria-label",
      "Open preview in a new tab",
    );
    // Basic inline styling to ensure visibility; prefer overriding in CSS
    Object.assign(modalOpenBtn.style, {
      position: "absolute",
      top: "0.6rem",
      right: "3.4rem", // place to left of the close button which will be at ~0.6rem
      zIndex: "2147483647",
      pointerEvents: "auto",
      background: "rgba(0,0,0,0.55)",
      color: "#fff",
      border: "none",
      padding: "6px 8px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "1rem",
      lineHeight: "1",
    });

    // Close button
    modalCloseBtn = document.createElement("button");
    modalCloseBtn.className = "modal-close";
    modalCloseBtn.type = "button";
    modalCloseBtn.innerHTML = "✕";
    modalCloseBtn.setAttribute(
      "aria-label",
      "Close preview",
    );
    // Styling to increase contrast and visibility; prefer CSS but set as sensible defaults here
    Object.assign(modalCloseBtn.style, {
      position: "absolute",
      top: "0.6rem",
      right: "0.6rem",
      zIndex: "2147483647",
      pointerEvents: "auto",
      background: "rgba(0,0,0,0.65)",
      color: "#ffffff",
      border: "none",
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "1.05rem",
      lineHeight: "1",
    });

    modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    // source/title note (will be updated with document.title when available)
    previewSourceNote = document.createElement("div");
    previewSourceNote.className = "preview-source-note";

    // Build DOM
    modalContainer.appendChild(modalOpenBtn);
    modalContainer.appendChild(modalCloseBtn);
    modalContainer.appendChild(previewSourceNote);
    modalContainer.appendChild(modalContent);
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // Event wiring
    // clicking outside modal closes
    modalOverlay.addEventListener("click", (ev) => {
      if (ev.target === modalOverlay) hideModal();
    });

    // close button handlers (pointerdown for robustness)
    modalCloseBtn.addEventListener("click", (ev) => {
      ev && ev.stopPropagation && ev.stopPropagation();
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

    // open button handler
    modalOpenBtn.addEventListener("click", (ev) => {
      ev && ev.stopPropagation && ev.stopPropagation();
      if (currentPreviewUrl) {
        try {
          window.open(
            currentPreviewUrl,
            "_blank",
            "noopener,noreferrer",
          );
        } catch (_) {
          // fallback
          window.open(currentPreviewUrl, "_blank");
        }
      }
    });

    // Esc closes
    document.addEventListener("keydown", (ev) => {
      if (
        ev.key === "Escape" &&
        modalOverlay.classList.contains("is-open")
      ) {
        hideModal();
      }
    });

    // capture-phase safeguard: ensure any click/touch/pointer that targets the close button closes the modal,
    // even if another script interferes with bubbling.
    function captureCloseHandler(e) {
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
      captureCloseHandler,
      true,
    );
    document.addEventListener(
      "mousedown",
      captureCloseHandler,
      true,
    );
    document.addEventListener(
      "touchstart",
      captureCloseHandler,
      { capture: true, passive: false },
    );
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

  function cleanupShadowHost() {
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

    // cleanup after animation (small delay to allow CSS transition)
    setTimeout(() => {
      if (!modalOverlay.classList.contains("is-open")) {
        cleanupIframe();
        cleanupShadowHost();
        currentPreviewUrl = null;
        if (modalContent) modalContent.innerHTML = "";
        if (previewSourceNote)
          previewSourceNote.textContent = "";
      }
    }, 220);
  }

  // inject styles into shadow root for inline mode; only fetch same-origin CSS and inline them
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
            } else {
              // skip cross-origin to avoid CORS/CSP problems
            }
          } catch (_) {
            // on failure, try @import fallback inside shadow
            try {
              const fallback =
                document.createElement("style");
              fallback.textContent = `@import url("${resolved}");`;
              shadowRoot.appendChild(fallback);
            } catch (_) {}
          }
        }
      } catch (_) {
        // ignore per-node failures
      }
    }
  }

  // Create iframe and show
  function createAndShowIframe(resolvedUrl) {
    ensureModal();

    cleanupIframe();
    cleanupShadowHost();

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

    // set preview URL for open button
    currentPreviewUrl = resolvedUrl;

    // preview note
    previewSourceNote &&
      (previewSourceNote.textContent = `Preview: ${resolvedUrl}`);

    modalContent.innerHTML = "";
    modalContent.appendChild(iframe);

    showModal();

    const onload = function () {
      try {
        const doc = iframe.contentDocument;
        if (!doc) throw new Error("no doc");
        // try update title
        try {
          const t = doc.title;
          if (t) previewSourceNote.textContent = t;
        } catch (_) {
          // cross-origin: keep URL
        }

        // hide header/footer inside iframe (best-effort; same-origin only)
        try {
          const hideStyle = doc.createElement("style");
          hideStyle.textContent =
            "header, footer, .site-header, .site-footer, .page-header, .page-footer { display: none !important; } body { margin: 0 !important; }";
          doc.head && doc.head.appendChild(hideStyle);
        } catch (_) {}

        // adjust links: external -> open new tab; internal -> allow iframe navigation
        try {
          const anchors = Array.from(
            doc.querySelectorAll("a[href]"),
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
        // cross-origin or other error: show fallback
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

  // load and show content; default to iframe mode, inline supported
  async function loadAndShowContent(href, opts = {}) {
    const useMode = opts.mode || mode || DEFAULT_MODE;
    const resolved = resolveUrl(href);

    if (useMode === "iframe") {
      createAndShowIframe(resolved);
      return;
    }

    // inline mode (safe rendering inside shadow root)
    try {
      const { doc, resolved: base } =
        await fetchDocument(href);
      const node = buildModalNodeFromDocument(doc, base);

      // ensure work-detail class for styling compatibility
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

      // create shadow host
      cleanupShadowHost();
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
        // minimal wrapper style inside shadow
        const wrapperStyle =
          document.createElement("style");
        wrapperStyle.textContent = `:host{display:block} .preview-body{padding:0.25rem 0.5rem}`;
        shadowRoot.appendChild(wrapperStyle);

        // inject same-origin styles into shadow
        await injectIntoShadow(doc, base, shadowRoot);

        // insert content into shadow
        const wrapper = document.createElement("div");
        wrapper.className = "preview-body";
        wrapper.appendChild(node);
        shadowRoot.appendChild(wrapper);

        currentShadowHost = host;
        currentShadowRoot = shadowRoot;
      } else {
        // fallback without shadow
        modalContent.appendChild(node);
        currentShadowHost = null;
        currentShadowRoot = null;
      }

      // set preview URL for open button
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

  // Long-press / anchor pointer interactions
  function onAnchorPointerDown(ev) {
    if (ev.isPrimary === false) return;
    if (ev.pointerType === "mouse" && ev.button !== 0)
      return;

    const a = ev.target.closest && ev.target.closest("a");
    if (!a || !a.getAttribute) return;
    const hrefAttr = a.getAttribute("href");
    if (!hrefAttr) return;
    // only same-origin previews
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

    // NOTE: swipe-to-open has been intentionally removed per request.
    // This function now only tracks movement to cancel long-press when appropriate.
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

  // Prevent immediate navigation when long-press triggered preview
  function onDocumentClickCapture(ev) {
    const a = ev.target.closest && ev.target.closest("a");
    if (!a) return;
    if (suppressClick) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressClick = false;
    }
  }

  // Attach global listeners for anchor pointer interactions
  document.addEventListener(
    "pointerdown",
    (ev) => {
      try {
        const a =
          ev.target.closest && ev.target.closest("a");
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

  // capture clicks for suppression
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
      if (m === "iframe" || m === "inline") mode = m;
      else
        console.warn(
          "previewModal.setMode: unsupported mode",
          m,
        );
    },
    getMode: () => mode,
  };
})();
