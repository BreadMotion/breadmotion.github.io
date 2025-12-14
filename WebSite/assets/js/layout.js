/**
 * layout.js (refactored)
 * --------------------------------------------------
 * 共通レイアウト要素（ヘッダー/フッター）を動的に読み込むスクリプト。
 *
 * 変更点:
 * - モバイル（幅 <= 768px）の場合、`bread-pet` は完全に初期化対象外にする。
 *   - DOM に要素が含まれていても、表示を消し、移動/マウス検知などのロジックは一切セットしない。
 * - デスクトップ時のみ従来の bread-pet の挙動を初期化する。
 * --------------------------------------------------
 */

document.addEventListener("DOMContentLoaded", () => {
  const shell =
    document.querySelector(".page-shell") || document.body;

  const currentPath = (() => {
    const name = location.pathname.split("/").pop();
    return name && name.length > 0 ? name : "index.html";
  })();

  // ブレークポイント判定: モバイルなら true を返す
  function isMobileViewport() {
    // CSS 側のメディアクエリと整合する (layout.css の @media (max-width: 768px) に合わせる)
    return window.matchMedia("(max-width: 768px)").matches;
  }

  // ヘルパー: layout.js の読み込みパスから partials の相対パスを返す
  function getPartialsPath() {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute("src");
      if (src && src.endsWith("layout.js")) {
        const prefix = src.replace(
          "assets/js/layout.js",
          "",
        );
        return prefix + "partials/";
      }
    }
    return "partials/";
  }

  // ヘルパー: 指定された partial ファイル群を fetch して HTML を返す（Promise）
  function fetchPartials(partialsPath, headerFile) {
    return Promise.all([
      fetch(`${partialsPath}${headerFile}`).then((r) =>
        r.text(),
      ),
      fetch(`${partialsPath}footer.html`).then((r) =>
        r.text(),
      ),
    ]);
  }

  // ヘルパー: 現在のビューポート中央（スクロールを含めたページ座標）を返す
  function getViewportCenter(width = 0, height = 0) {
    return {
      x: window.scrollX + window.innerWidth / 2 - width / 2,
      y:
        window.scrollY +
        window.innerHeight / 2 -
        height / 2,
    };
  }

  // ヘルパー: 要素の bounding rect から bread 用ターゲット座標を算出
  function computeBreadTargetFromRect(
    rect,
    breadW,
    breadH,
  ) {
    return {
      x: rect.left + window.scrollX - breadW / 2,
      y: rect.bottom + window.scrollY - breadH,
    };
  }

  // ヘルパー: 要素が .lang-switch の内側にあるか（言語切替 UI に属するか）
  function isElementInLangSwitch(el) {
    return !!(
      el &&
      el.closest &&
      el.closest(".lang-switch")
    );
  }

  // 初期化: 言語切り替えリンクを設定
  function setupLanguageSwitch(currentPath) {
    const langSwitch =
      document.querySelector(".lang-switch");
    if (!langSwitch) return;
    const isEn = document.documentElement.lang === "en";
    const search = window.location.search || "";
    const targetUrl = isEn
      ? `../${currentPath}${search}`
      : `en/${currentPath}${search}`;
    langSwitch.setAttribute("href", targetUrl);
  }

  // 初期化: ナビゲーションのアクティブリンク判定
  function setupActiveNav(currentPath) {
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
  }

  // 初期化: モバイルメニューのトグルハンドラ
  function setupNavToggle() {
    const navToggle = document.querySelector(".nav-toggle");
    const siteNav = document.querySelector(".site-nav");
    if (!navToggle || !siteNav) return;

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

  /**
   * Bread Pet 初期化
   *
   * 重要:
   * - モバイル判定 (isMobileViewport) の場合は何も初期化せず、要素を完全に非表示にして終了する。
   * - これにより移動ロジック、マウスオーバー監視、アニメーションループ等は一切登録されない。
   */
  function initBreadPet() {
    const bread = document.getElementById("bread-pet");
    if (!bread) return;

    // モバイルでは完全に非表示かつ初期化対象外とする
    if (isMobileViewport()) {
      // DOM 上にある場合でも、表示・相互作用を遮断する（CSS より優先されるように inline style を設定）
      try {
        bread.style.display = "none";
        bread.style.visibility = "hidden";
        bread.style.pointerEvents = "none";
        bread.setAttribute("aria-hidden", "true");
        bread.setAttribute("data-bread-disabled", "true");
      } catch (e) {
        // 何か失敗しても初期化は行わない。
      }
      return;
    }

    // 以下はデスクトップ向けの既存ロジック（必要に応じて簡潔化はしていない）
    // 状態
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    const speed = 1.5;
    let isMoving = false;
    let isVisible = false;
    let activeElement = null;

    // spawn grace 用
    let spawnGraceUntil = 0;
    const SPAWN_GRACE_MS = 300; // 初期 spawn 後 300ms は mouseover を無視

    // bread のサイズ（既存の値を維持）
    const breadWidth = 40;
    const breadHeight = 34;

    // 初期スポーン: ビューポート中央に生成し、その場に留まる
    const center = getViewportCenter(
      breadWidth,
      breadHeight,
    );
    currentX = center.x;
    currentY = center.y;
    // 初期ターゲットは現在位置（その場に留まる）
    targetX = currentX;
    targetY = currentY;
    activeElement = null;
    isVisible = true;

    bread.classList.add("is-visible", "is-spawning");
    bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

    // spawn のグレース期間開始タイムスタンプ
    spawnGraceUntil = Date.now() + SPAWN_GRACE_MS;

    // スポーンアニメーション終了クラス除去（既存は 600ms）
    setTimeout(() => {
      bread.classList.remove("is-spawning");
    }, 600);

    // マウスオーバー監視: 特定要素は無視（.lang-switch 内のもの）
    document.addEventListener(
      "mouseover",
      (e) => {
        // グレース期間中は無視（ヘッダー挿入時に発生する誤トリガを防ぐ）
        if (Date.now() < spawnGraceUntil) return;

        const target = e.target.closest(
          "a, button, .lang-option, input, select, textarea, [role='button']",
        );

        // .lang-switch 内は無視（言語切替UIに移動しないように）
        if (target && isElementInLangSwitch(target)) {
          return;
        }

        if (target) {
          // ユーザーのホバーを追従の契機にする
          activeElement = target;
          const rect = target.getBoundingClientRect();

          // ターゲットは要素の底部左寄せ（既存の算出式を保持）
          const t = computeBreadTargetFromRect(
            rect,
            breadWidth,
            breadHeight,
          );
          targetX = t.x;
          targetY = t.y;

          // 画面外にいる（非表示）場合はテレポートして表示
          const isOffScreen =
            currentX + breadWidth < window.scrollX ||
            currentX > window.scrollX + window.innerWidth ||
            currentY + breadHeight < window.scrollY ||
            currentY > window.scrollY + window.innerHeight;

          if (!isVisible || isOffScreen) {
            currentX = targetX;
            currentY = targetY;
            isVisible = true;
            bread.classList.add("is-visible");

            // ポップ（spawn）アニメーションをトリガー
            bread.classList.remove("is-spawning");
            void bread.offsetWidth; // reflow
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

    // アニメーションループ
    function animate() {
      if (!isVisible) {
        requestAnimationFrame(animate);
        return;
      }

      // アクティブ要素がある場合はスクロールに追従してターゲット更新
      if (activeElement && activeElement.isConnected) {
        const rect = activeElement.getBoundingClientRect();
        const t = computeBreadTargetFromRect(
          rect,
          breadWidth,
          breadHeight,
        );
        targetX = t.x;
        targetY = t.y;
      }

      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > speed) {
        const angle = Math.atan2(dy, dx);
        currentX += Math.cos(angle) * speed;
        currentY += Math.sin(angle) * speed;
        isMoving = true;

        // 4方向（斜め含む）向き判定（既存のロジックを保持）
        let facing = "front-right";
        if (dy >= 0) {
          facing = dx >= 0 ? "front-right" : "front-left";
        } else {
          facing = dx >= 0 ? "back-right" : "back-left";
        }

        bread.setAttribute("data-facing", facing);
        bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        bread.classList.add("is-walking");

        // 口パタパタ（既存と同等のタイミング）
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

          // 到達位置にスナップ
          currentX = targetX;
          currentY = targetY;

          bread.setAttribute("data-facing", "front");
          bread.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
      }

      requestAnimationFrame(animate);
    }

    animate();
  } // end initBreadPet

  // 実行順序: partials 読み込み -> DOM に挿入 -> 各初期化
  const pathToPartials = getPartialsPath();
  const lang = document.documentElement.lang;
  const headerFile =
    lang === "en" ? "header_en.html" : "header.html";

  fetchPartials(pathToPartials, headerFile)
    .then(([headerHtml, footerHtml]) => {
      shell.insertAdjacentHTML("afterbegin", headerHtml);
      shell.insertAdjacentHTML("afterend", footerHtml);

      // 初期化
      setupLanguageSwitch(currentPath);
      setupActiveNav(currentPath);
      setupNavToggle();

      // bread-pet はモバイル時は初期化しない（表示/ロジックともに除外）
      // 加えて、念のため header がすでに bread 要素を含む場合は非表示化する
      if (isMobileViewport()) {
        const breadEl =
          document.getElementById("bread-pet");
        if (breadEl) {
          try {
            breadEl.style.display = "none";
            breadEl.style.visibility = "hidden";
            breadEl.style.pointerEvents = "none";
            breadEl.setAttribute("aria-hidden", "true");
            breadEl.setAttribute(
              "data-bread-disabled",
              "true",
            );
          } catch (e) {
            // 無視
          }
        }
        // モバイルなので初期化はスキップ
      } else {
        // デスクトップ等の大きいビューでは従来通り初期化
        initBreadPet();
      }
    })
    .catch((err) => {
      console.error(
        "共通ヘッダー/フッター読み込みエラー:",
        err,
      );
    });
});
