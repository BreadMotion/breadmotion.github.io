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
        const speed = 1.5;
        let isMoving = false;
        let isVisible = false;
        let activeElement = null;
        // Timestamp until which mouseover events should be ignored after spawn (grace period)
        let spawnGraceUntil = 0;

        const breadWidth = 40;
        const breadHeight = 34;

        // Initial spawn: appear at screen center and stay there.
        // 初期生成時はアクティブな言語要素をターゲットにせず、
        // spawn位置に留まるよう target を current と同値にする。
        const centerX =
          window.scrollX +
          window.innerWidth / 2 -
          breadWidth / 2;
        const centerY =
          window.scrollY +
          window.innerHeight / 2 -
          breadHeight / 2;

        currentX = centerX;
        currentY = centerY;

        // 初期ターゲットを現在位置に合わせる（これによりスポーン後は移動しない）
        targetX = currentX;
        targetY = currentY;

        // activeElement は設定しない（null のまま） -> animate では移動しない
        activeElement = null;

        isVisible = true;
        bread.classList.add("is-visible", "is-spawning");
        bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

        // remove spawning class after animation duration
        setTimeout(() => {
          bread.classList.remove("is-spawning");
        }, 600);

        // Track hovers on any interactive element in the document
        document.addEventListener(
          "mouseover",
          (e) => {
            const target = e.target.closest(
              "a, button, .lang-option, input, select, textarea, [role='button']",
            );

            // Ignore mouseover events during the spawn grace period so bread stays at spawn
            if (
              typeof spawnGraceUntil === "number" &&
              Date.now() < spawnGraceUntil
            ) {
              return;
            }

            // Ignore interactions on the language switch control itself so the bread
            // doesn't move to the language switch button (e.g. elements with .lang-switch)
            if (
              target &&
              target.closest &&
              target.closest(".lang-switch")
            ) {
              return;
            }

            if (target) {
              // ユーザーが意図的に要素にホバーした場合のみ追従させる挙動を残す。
              // ただし初期スポーン直後に自動で移動してしまうのを防ぐため、
              // ここでは通常のホバー時に activeElement を設定して追従を開始する。
              activeElement = target;
              const rect = target.getBoundingClientRect();

              // Calculate target position: Bottom-Left of the UI
              targetX =
                rect.left + window.scrollX - breadWidth / 2;
              targetY =
                rect.bottom + window.scrollY - breadHeight;

              // Check if current position is off-screen
              const isOffScreen =
                currentX + breadWidth < window.scrollX ||
                currentX >
                  window.scrollX + window.innerWidth ||
                currentY + breadHeight < window.scrollY ||
                currentY >
                  window.scrollY + window.innerHeight;

              // If first appearance or off-screen, teleport and spawn
              if (!isVisible || isOffScreen) {
                currentX = targetX;
                currentY = targetY;
                isVisible = true;
                bread.classList.add("is-visible");

                // Trigger pop animation
                bread.classList.remove("is-spawning");
                void bread.offsetWidth; // Trigger reflow
                bread.classList.add("is-spawning");
                setTimeout(() => {
                  bread.classList.remove("is-spawning");
                }, 600);

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
            targetX =
              rect.left + window.scrollX - breadWidth / 2;
            targetY =
              rect.bottom + window.scrollY - breadHeight;
          }

          const dx = targetX - currentX;
          const dy = targetY - currentY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > speed) {
            const angle = Math.atan2(dy, dx);
            currentX += Math.cos(angle) * speed;
            currentY += Math.sin(angle) * speed;
            isMoving = true;

            // Determine 4-way diagonal direction (Isometric)
            let facing = "front-right";

            if (dy >= 0) {
              // Moving Down (Front)
              facing =
                dx >= 0 ? "front-right" : "front-left";
            } else {
              // Moving Up (Back)
              facing = dx >= 0 ? "back-right" : "back-left";
            }

            bread.setAttribute("data-facing", facing);
            bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            bread.classList.add("is-walking");

            // Mouth animation
            if (Math.floor(Date.now() / 150) % 2 === 0) {
              bread.classList.add("mouth-open");
            } else {
              bread.classList.remove("mouth-open");
            }
          } else {
            if (isMoving) {
              isMoving = false;
              bread.classList.remove("is-walking");
              bread.classList.remove("mouth-open");
              // Snap to target
              currentX = targetX;
              currentY = targetY;

              // Idle state is Front
              bread.setAttribute("data-facing", "front");
              bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
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
