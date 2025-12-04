/**
 * layout.js
 * --------------------------------------------------
 * 共通レイアウト要素（ヘッダー/フッター）を動的に読み込むスクリプト。
 * 言語切り替え、ナビゲーションのアクティブ状態、
 * モバイルメニュートグルを管理。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  const shell =
    document.querySelector(".page-shell") || document.body;

  const currentPath = (() => {
    const name = location.pathname.split("/").pop();
    return name && name.length > 0 ? name : "index.html";
  })();

  // layout.js の読み込みパスから相対パスを特定する
  const getPartialsPath = () => {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute("src");
      if (src && src.endsWith("layout.js")) {
        // "assets/js/layout.js" の前の部分を取得
        const prefix = src.replace(
          "assets/js/layout.js",
          "",
        );
        return prefix + "partials/";
      }
    }
    return "partials/";
  };

  const pathToPartials = getPartialsPath();
  const lang = document.documentElement.lang;
  const headerFile =
    lang === "en" ? "header_en.html" : "header.html";

  Promise.all([
    fetch(`${pathToPartials}${headerFile}`).then((r) =>
      r.text(),
    ),
    fetch(`${pathToPartials}footer.html`).then((r) =>
      r.text(),
    ),
  ])
    .then(([headerHtml, footerHtml]) => {
      shell.insertAdjacentHTML("afterbegin", headerHtml);
      shell.insertAdjacentHTML("afterend", footerHtml);

      // 言語切り替え
      const langSwitch =
        document.querySelector(".lang-switch");
      if (langSwitch) {
        const isEn = document.documentElement.lang === "en";
        const search = window.location.search || "";
        const targetUrl = isEn
          ? `../${currentPath}${search}`
          : `en/${currentPath}${search}`;
        langSwitch.setAttribute("href", targetUrl);
      }

      const navLinks =
        document.querySelectorAll(".site-nav a");
      navLinks.forEach((link) => {
        const target =
          link.getAttribute("data-nav") ||
          link.getAttribute("href") ||
          "";

        const cleanTarget = target.split(/[?#]/)[0];

        if (cleanTarget === currentPath) {
          link.classList.add("active");
        }
      });

      const navToggle =
        document.querySelector(".nav-toggle");
      const siteNav = document.querySelector(".site-nav");

      if (navToggle && siteNav) {
        navToggle.addEventListener("click", () => {
          navToggle.classList.toggle("is-active");
          siteNav.classList.toggle("is-open");
          document.documentElement.classList.toggle(
            "no-scroll",
            siteNav.classList.contains("is-open"),
          );
          document.body.classList.toggle(
            "no-scroll",
            siteNav.classList.contains("is-open"),
          );
        });

        siteNav.querySelectorAll("a").forEach((link) => {
          link.addEventListener("click", () => {
            navToggle.classList.remove("is-active");
            siteNav.classList.remove("is-open");
            document.documentElement.classList.remove(
              "no-scroll",
            );
            document.body.classList.remove("no-scroll");
          });
        });
      }

      // Bread Pet Logic
      const bread = document.getElementById("bread-pet");
      if (bread) {
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        const speed = 0.5;
        let isMoving = false;
        let isVisible = false;
        let activeElement = null;

        const breadWidth = 40;
        const breadHeight = 34;

        // Initial spawn from active language option
        const activeLang = document.querySelector(
          ".lang-option.active",
        );
        if (activeLang) {
          activeElement = activeLang;
          const rect = activeLang.getBoundingClientRect();
          targetX = rect.left;
          targetY = rect.bottom - breadHeight;
          currentX = targetX;
          currentY = targetY;
          isVisible = true;
          bread.classList.add("is-visible", "is-spawning");
          bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

          setTimeout(() => {
            bread.classList.remove("is-spawning");
          }, 600);
        }

        // Track hovers on any interactive element in the document
        document.addEventListener(
          "mouseover",
          (e) => {
            const target = e.target.closest(
              "a, button, .lang-option, input, select, textarea, [role='button']",
            );

            if (target) {
              activeElement = target;
              const rect = target.getBoundingClientRect();

              // Calculate target position: Bottom-Left of the UI
              targetX = rect.left;
              targetY = rect.bottom - breadHeight;

              // If first appearance (fallback), teleport to start position
              if (!isVisible) {
                currentX = targetX;
                currentY = targetY;
                isVisible = true;
                bread.classList.add("is-visible");
                bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
              }
            }
          },
          { passive: true },
        );

        // Animation Loop
        function animate() {
          if (!isVisible) {
            requestAnimationFrame(animate);
            return;
          }

          // Update target position if we have an active element (handles scrolling)
          if (activeElement && activeElement.isConnected) {
            const rect =
              activeElement.getBoundingClientRect();
            targetX = rect.left;
            targetY = rect.bottom - breadHeight;
          }

          const dx = targetX - currentX;
          const dy = targetY - currentY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > speed) {
            const angle = Math.atan2(dy, dx);
            currentX += Math.cos(angle) * speed;
            currentY += Math.sin(angle) * speed;
            isMoving = true;

            // Determine direction
            const direction = dx >= 0 ? 1 : -1;
            // Only flip if significant X movement
            const scaleX =
              Math.abs(dx) > 0.1
                ? direction
                : bread.dataset.dir || 1;
            bread.dataset.dir = scaleX;

            bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scaleX(${scaleX})`;
            bread.classList.add("is-walking");
          } else {
            if (isMoving) {
              isMoving = false;
              bread.classList.remove("is-walking");
              // Snap to target
              currentX = targetX;
              currentY = targetY;
              const scaleX = bread.dataset.dir || 1;
              bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scaleX(${scaleX})`;
            }
          }
          requestAnimationFrame(animate);
        }
        animate();
      }
    })
    .catch((err) => {
      console.error(
        "共通ヘッダー/フッター読み込みエラー:",
        err,
      );
    });
});
