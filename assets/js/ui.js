/**
 * ui.js
 * --------------------------------------------------
 * UIユーティリティスクリプト。
 * スクロールアニメーション（reveal-on-scroll）と
 * ポートフォリオモーダルの表示制御を管理。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  const targets = document.querySelectorAll(
    ".reveal-on-scroll",
  );

  if (true) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target); // 一度きりでOK
        }
      });
    },
    {
      threshold: 0.12,
    },
  );

  targets.forEach((el) => observer.observe(el));
});

// Portfolio Modal Logic
(function () {
  let modalOverlay,
    modalContainer,
    modalContent,
    modalCloseBtn,
    scrollPosition = 0;

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("is-open");

    // Restore body position
    document.body.style.paddingRight = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollPosition);

    setTimeout(() => {
      if (
        modalOverlay &&
        !modalOverlay.classList.contains("is-open")
      ) {
        modalContent.innerHTML = "";
      }
    }, 300);
  }

  /**
   * Adjusts asset paths inside loaded HTML content.
   * On non-english pages, paths like ../assets/ need to become assets/
   * On english pages (/en/), ../assets/ is correct relative to the page, so no change.
   * @param {HTMLElement} element The root element of the loaded content.
   * @param {boolean} isEn True if the current page is English.
   */
  function fixPaths(element, isEn) {
    if (isEn) return;

    const attrs = ["src", "href"];
    attrs.forEach((attr) => {
      const nodes = element.querySelectorAll(`[${attr}]`);
      nodes.forEach((node) => {
        const val = node.getAttribute(attr);
        if (val && val.startsWith("../")) {
          // Do not adjust absolute URLs or anchor links
          if (
            !val.startsWith("../#") &&
            val.indexOf(":") === -1
          ) {
            node.setAttribute(attr, val.substring(3));
          }
        }
      });
    });
  }

  /**
   * Hooks into links within the modal content.
   * Specifically targets portfolio tag links to trigger a handler instead of navigating.
   * @param {HTMLElement} element The root element of the loaded content.
   * @param {Function} linkHandler A function to call when a tag link is clicked.
   */
  function hookLinks(element, linkHandler) {
    if (typeof linkHandler !== "function") return;

    const links = element.querySelectorAll("a");
    links.forEach((a) => {
      const href = a.getAttribute("href");
      if (
        href &&
        (href.includes("portfolio.html") ||
          href.startsWith("?"))
      ) {
        // Exclude external links that might contain "portfolio.html"
        if (
          a.hostname !== location.hostname &&
          a.hostname !== ""
        ) {
          return;
        }

        a.addEventListener("click", (e) => {
          e.preventDefault();
          const qStart = href.indexOf("?");
          let tag = null;
          if (qStart !== -1) {
            const search = href.substring(qStart);
            const params = new URLSearchParams(search);
            tag = params.get("tag");
          }

          linkHandler(tag);
          closeModal();
        });
      }
    });
  }

  function initModal() {
    if (document.querySelector(".modal-overlay")) {
      // Ensure elements are selected if they already exist
      modalOverlay = document.querySelector(
        ".modal-overlay",
      );
      modalContainer = document.querySelector(
        ".modal-container",
      );
      modalContent = document.querySelector(
        ".modal-content",
      );
      modalCloseBtn =
        document.querySelector(".modal-close");
      return;
    }

    modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";
    modalContainer = document.createElement("div");
    modalContainer.className = "modal-container";
    modalCloseBtn = document.createElement("button");
    modalCloseBtn.className = "modal-close";
    modalCloseBtn.innerHTML = "&times;";
    modalCloseBtn.ariaLabel = "Close";
    modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    modalContainer.appendChild(modalCloseBtn);
    modalContainer.appendChild(modalContent);
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    modalCloseBtn.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        modalOverlay.classList.contains("is-open")
      ) {
        closeModal();
      }
    });
  }

  /**
   * Opens the portfolio detail modal.
   * @param {string} contentPath Path to the HTML content to load.
   * @param {boolean} isEn True if the current page is English (to handle pathing).
   * @param {Function} linkHandler Callback for when a tag link is clicked.
   */
  async function openPortfolioModal(
    contentPath,
    isEn,
    linkHandler,
  ) {
    if (!contentPath) return;
    initModal();

    // Prevent layout shift (horizontal) by accounting for scrollbar width
    const scrollbarWidth =
      window.innerWidth -
      document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Store scroll position and fix body to prevent layout shift (vertical)
    scrollPosition = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.width = "100%";

    modalContent.innerHTML =
      '<div style="padding:4rem;text-align:center;color:var(--color-text-muted);">Loading...</div>';
    modalOverlay.classList.add("is-open");

    try {
      const res = await fetch(contentPath);
      if (!res.ok)
        throw new Error(
          `HTTP ${res.status} ${res.statusText}`,
        );
      const text = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const detail = doc.querySelector(".work-detail");

      if (detail) {
        detail.classList.remove("reveal-on-scroll");
        fixPaths(detail, isEn);
        hookLinks(detail, linkHandler);
        modalContent.innerHTML = "";
        modalContent.appendChild(detail);
      } else {
        throw new Error(
          "Content not found in fetched HTML.",
        );
      }
    } catch (err) {
      console.error("Modal load error:", err);
      modalContent.innerHTML =
        '<div style="padding:4rem;text-align:center;color:var(--color-text-muted);">コンテンツの読み込みに失敗しました。</div>';
    }
  }

  window.openPortfolioModal = openPortfolioModal;
})();
