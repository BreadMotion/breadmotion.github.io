/**
 * @file giscus-lazy.js
 * @description Lazy-load Giscus comments when the placeholder scrolls into view
 * @summary
 *   - Uses IntersectionObserver to detect when the comment placeholder is visible
 *   - Loads the Giscus script only when needed for better performance
 *   - Supports dark mode by detecting system preference
 */

(function () {
  "use strict";

  // Configuration constants
  var LAZY_LOAD_MARGIN = "200px 0px"; // Load slightly before element comes into view
  var INTERSECTION_THRESHOLD = 0.01;

  var placeholder = document.querySelector(".giscus-placeholder");
  if (!placeholder) return;

  let loaded = false;

  /**
   * Determine the appropriate Giscus theme based on system preference
   * @returns {string} The theme name for Giscus
   */
  function getGiscusTheme() {
    const configuredTheme = placeholder.dataset.giscusTheme;
    if (
      configuredTheme &&
      configuredTheme !== "preferred_color_scheme" &&
      configuredTheme !== "light"
    ) {
      return configuredTheme;
    }

    // Auto-detect based on system preference
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }

  /**
   * Load the Giscus script and inject it into the placeholder
   */
  function loadGiscus() {
    if (loaded) return;
    loaded = true;

    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", placeholder.dataset.giscusRepo || "");
    script.setAttribute(
      "data-repo-id",
      placeholder.dataset.giscusRepoId || ""
    );
    script.setAttribute(
      "data-category",
      placeholder.dataset.giscusCategory || ""
    );
    script.setAttribute(
      "data-category-id",
      placeholder.dataset.giscusCategoryId || ""
    );
    script.setAttribute(
      "data-mapping",
      placeholder.dataset.giscusMapping || "pathname"
    );
    script.setAttribute(
      "data-strict",
      placeholder.dataset.giscusStrict || "0"
    );
    script.setAttribute(
      "data-reactions-enabled",
      placeholder.dataset.giscusReactionsEnabled || "1"
    );
    script.setAttribute(
      "data-emit-metadata",
      placeholder.dataset.giscusEmitMetadata || "0"
    );
    script.setAttribute(
      "data-input-position",
      placeholder.dataset.giscusInputPosition || "bottom"
    );
    script.setAttribute("data-theme", getGiscusTheme());
    script.setAttribute("crossorigin", "anonymous");
    script.async = true;

    // Remove loading indicator
    const loadingEl = placeholder.querySelector(".giscus-loading");
    if (loadingEl) {
      loadingEl.remove();
    }

    placeholder.appendChild(script);
    placeholder.classList.remove("giscus-placeholder");
    placeholder.classList.add("giscus-loaded");
  }

  // Use IntersectionObserver for lazy loading
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            loadGiscus();
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: LAZY_LOAD_MARGIN,
        threshold: INTERSECTION_THRESHOLD,
      }
    );

    observer.observe(placeholder);
  } else {
    // Fallback for browsers without IntersectionObserver
    loadGiscus();
  }
})();
