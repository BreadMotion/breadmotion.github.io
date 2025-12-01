/**
 * portfolio.js
 * --------------------------------------------------
 * ポートフォリオ一覧ページ用スクリプト。
 * 作品のフィルタリング、検索、モーダル表示を管理。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("portfolioList");
  const emptyEl = document.getElementById(
    "portfolioEmptyMessage",
  );
  const searchInput = document.getElementById(
    "portfolioSearch",
  );
  const categorySelect = document.getElementById(
    "portfolioCategoryFilter",
  );

  if (!listEl) return;

  /** @type {Array<any>} */
  let allWorks = [];

  // ============================================================
  // モーダル初期化
  // ============================================================
  function initModal() {
    // 既に存在すれば何もしない
    if (document.querySelector(".modal-overlay")) return;

    modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";

    modalContainer = document.createElement("div");
    modalContainer.className = "modal-container";

    // 閉じるボタン
    modalCloseBtn = document.createElement("button");
    modalCloseBtn.className = "modal-close";
    modalCloseBtn.innerHTML = "&times;";
    modalCloseBtn.ariaLabel = "Close";

    // コンテンツ領域
    modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    modalContainer.appendChild(modalCloseBtn);
    modalContainer.appendChild(modalContent);
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // イベント
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

  // ============================================================
  // モーダル表示処理
  // ============================================================
  async function openModal(contentPath) {
    if (!contentPath) return;

    // ローディング表示
    modalContent.innerHTML =
      '<div style="padding:4rem;text-align:center;color:var(--color-text-muted);">Loading...</div>';

    // 表示
    modalOverlay.classList.add("is-open");
    document.body.classList.add("no-scroll");

    try {
      // HTML取得
      const res = await fetch(contentPath);
      if (!res.ok)
        throw new Error(
          `HTTP ${res.status} ${res.statusText}`,
        );
      const text = await res.text();

      // パース
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const detail = doc.querySelector(".work-detail");

      if (detail) {
        // reveal-on-scroll クラスが残っていると透明のままになるので削除
        detail.classList.remove("reveal-on-scroll");

        // パス修正: 生成されたHTMLは "../assets/..." となっているため、
        // トップ階層で表示する際は "assets/..." に直す必要がある
        fixPaths(detail);

        // リンクの挙動修正: タグリンクなどがクリックされた場合、
        // ページ遷移ではなくフィルタリングを実行して閉じるようにする
        hookLinks(detail);

        modalContent.innerHTML = "";
        modalContent.appendChild(detail);
      } else {
        throw new Error("Content not found");
      }
    } catch (err) {
      console.error("Modal load error:", err);
      modalContent.innerHTML =
        '<div style="padding:4rem;text-align:center;color:var(--color-text-muted);">コンテンツの読み込みに失敗しました。</div>';
    }
  }

  function closeModal() {
    modalOverlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    // アニメーション後にクリア
    setTimeout(() => {
      if (!modalOverlay.classList.contains("is-open")) {
        modalContent.innerHTML = "";
      }
    }, 300);
  }

  /**
   * 生成されたHTML内の相対パスを補正する
   * "../assets/" -> "assets/"
   * "../portfolio.html" -> "portfolio.html"
   */
  function fixPaths(element) {
    const attrs = ["src", "href"];
    attrs.forEach((attr) => {
      const nodes = element.querySelectorAll(`[${attr}]`);
      nodes.forEach((node) => {
        const val = node.getAttribute(attr);
        if (val && val.startsWith("../")) {
          node.setAttribute(attr, val.substring(3));
        }
      });
    });
  }

  /**
   * モーダル内のリンククリック時の挙動をフック
   */
  function hookLinks(element) {
    const links = element.querySelectorAll("a");
    links.forEach((a) => {
      const href = a.getAttribute("href");
      // タグリンクの場合 (portfolio.html?tag=xxx)
      if (
        href &&
        (href.startsWith("portfolio.html") ||
          href.startsWith("?"))
      ) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          // クエリパラメータ解析
          // href が "portfolio.html?tag=xxx" の場合など
          const qStart = href.indexOf("?");
          if (qStart !== -1) {
            const search = href.substring(qStart);
            const params = new URLSearchParams(search);
            const tag = params.get("tag");

            if (tag && searchInput) {
              searchInput.value = tag;
              if (categorySelect) categorySelect.value = "";
              render();
              updateUrlParams(tag, "");
              closeModal();
            }
          }
        });
      }
    });
  }

  // ============================================================
  // 一覧表示ロジック (既存)
  // ============================================================

  function readInitialParams() {
    const params = new URLSearchParams(location.search);
    const tag = params.get("tag") || "";
    const q = params.get("q") || "";
    const category = params.get("category") || "";

    const initial = tag || q;
    if (searchInput && initial) searchInput.value = initial;
    if (categorySelect && category)
      categorySelect.value = category;
  }

  function updateUrlParams(keyword, category) {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (category) params.set("category", category);
    const newUrl =
      location.pathname +
      (params.toString() ? "?" + params.toString() : "");
    history.replaceState(null, "", newUrl);
  }

  async function loadWorks() {
    try {
      const lang = document.documentElement.lang;
      const isEn = lang === "en";
      const relativePrefix = isEn ? "../" : "";

      const res = await fetch(
        `${relativePrefix}assets/data/portfolioList.json`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawWorks = await res.json();

      allWorks = rawWorks.map((work) => {
        if (isEn) {
          return {
            ...work,
            thumbnail:
              work.thumbnail &&
              !work.thumbnail.startsWith("http")
                ? `${relativePrefix}${work.thumbnail}`
                : work.thumbnail,
            contentPath: work.contentPath
              ? `${relativePrefix}${work.contentPath}`
              : work.contentPath,
          };
        }
        return work;
      });

      readInitialParams();
      render();
    } catch (err) {
      console.error("Failed to load portfolio list:", err);
      if (emptyEl) {
        emptyEl.textContent =
          "作品一覧の読み込みに失敗しました。";
        emptyEl.style.display = "block";
      }
    }
  }

  function render() {
    const keyword = (searchInput?.value || "")
      .trim()
      .toLowerCase();
    const categoryFilter = (
      categorySelect?.value || ""
    ).trim();

    const filtered = allWorks.filter((work) => {
      if (
        categoryFilter &&
        work.category !== categoryFilter
      )
        return false;

      if (keyword) {
        const tags = Array.isArray(work.tags)
          ? work.tags
          : String(work.tags || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);

        const haystack = [
          work.title || "",
          work.description || "",
          work.category || "",
          work.role || "",
          work.tech || "",
          ...tags,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(keyword)) return false;
      }

      return true;
    });

    updateUrlParams(keyword, categoryFilter);

    listEl.innerHTML = "";

    if (!filtered.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    filtered.forEach((work) => {
      const card = document.createElement("article");
      card.className =
        "card card--clickable portfolio-card";

      // サムネイル
      if (work.thumbnail) {
        const thumb = document.createElement("div");
        thumb.className = "card__thumb";
        const img = document.createElement("img");
        img.src = work.thumbnail;
        img.alt = work.title || "";
        thumb.appendChild(img);
        card.appendChild(thumb);
      }

      const body = document.createElement("div");
      body.className = "card__body";

      // メタ情報 (日付 / カテゴリ)
      const meta = document.createElement("p");
      meta.className = "card__meta";
      const dateText = work.date || "";
      const categoryText = work.category || "";
      meta.textContent = [dateText, categoryText]
        .filter(Boolean)
        .join(" / ");
      body.appendChild(meta);

      // タイトル
      const titleRow = document.createElement("div");
      titleRow.className = "card__title-row";
      const title = document.createElement("h3");
      title.className = "card__title";
      title.textContent = work.title || "";
      titleRow.appendChild(title);
      body.appendChild(titleRow);

      // Role
      if (work.role) {
        const role = document.createElement("p");
        role.className = "card__meta card__meta--role";
        role.textContent = `Role: ${work.role}`;
        body.appendChild(role);
      }

      // 説明
      if (work.description) {
        const desc = document.createElement("p");
        desc.className = "card__description";
        desc.textContent = work.description;
        body.appendChild(desc);
      }

      // タグ
      const tagsArr = Array.isArray(work.tags)
        ? work.tags
        : String(work.tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

      if (tagsArr.length) {
        const tagRow = document.createElement("div");
        tagRow.className = "card__tags";
        tagsArr.forEach((t) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = t;

          // タグクリック時はイベント伝播を止めてフィルタリング
          tag.addEventListener("click", (e) => {
            e.stopPropagation();
            if (searchInput) searchInput.value = t;
            if (categorySelect) categorySelect.value = "";
            render();
          });

          tag.tabIndex = 0;
          tag.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              ev.stopPropagation();
              tag.click();
            }
          });

          tagRow.appendChild(tag);
        });
        body.appendChild(tagRow);
      }

      // 外部リンク (カードクリックと分けるため stopPropagation)
      if (work.links && work.links.length) {
        const actions = document.createElement("div");
        actions.className = "card__actions";
        work.links.forEach((link) => {
          const a = document.createElement("a");
          a.href = link.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = link.label || "Link";
          a.addEventListener("click", (e) => {
            e.stopPropagation();
          });
          actions.appendChild(a);
        });
        body.appendChild(actions);
      }

      card.appendChild(body);

      // カード全体クリックでモーダル表示
      card.addEventListener("click", () => {
        if (work.contentPath && window.openPortfolioModal) {
          const lang = document.documentElement.lang;
          const isEn = lang === "en";

          // モーダル内のタグクリック時のハンドラ
          const linkHandler = (tag) => {
            if (tag && searchInput) {
              searchInput.value = tag;
              if (categorySelect) categorySelect.value = "";
              render();
              updateUrlParams(tag, "");
            }
          };

          window.openPortfolioModal(
            work.contentPath,
            isEn,
            linkHandler,
          );
        }
      });

      listEl.appendChild(card);
    });
  }

  // 初期化実行

  if (searchInput) {
    searchInput.addEventListener("input", render);
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", render);
  }

  loadWorks();
});
