/**
 * products.js
 * --------------------------------------------------
 * プロダクト一覧ページ用スクリプト。
 * プロダクトのフィルタリングと検索を管理。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("productList");
  const emptyEl = document.getElementById(
    "productEmptyMessage",
  );
  const searchInput =
    document.getElementById("productSearch");
  const typeSelect = document.getElementById(
    "productTypeFilter",
  );

  if (!listEl) return;
  let allProducts = [];

  // -----------------------------
  // JSON 読み込み
  // -----------------------------
  async function loadProducts() {
    try {
      const lang = document.documentElement.lang;
      const isEn = lang === "en";
      const relativePrefix = isEn ? "../" : "";

      const res = await fetch(
        `${relativePrefix}assets/data/products.json`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawProducts = await res.json();

      allProducts = rawProducts.map((p) => {
        if (
          isEn &&
          p.thumbnail &&
          !p.thumbnail.startsWith("http")
        ) {
          return {
            ...p,
            thumbnail: `${relativePrefix}${p.thumbnail}`,
          };
        }
        return p;
      });

      render();
    } catch (err) {
      console.error("Failed to load products:", err);
      if (emptyEl) {
        emptyEl.textContent =
          "プロダクト一覧の読み込みに失敗しました。";
        emptyEl.style.display = "block";
      }
    }
  }

  // -----------------------------
  // フィルタ適用＋描画
  // -----------------------------
  function render() {
    const keyword = (searchInput?.value || "")
      .trim()
      .toLowerCase();
    const typeFilter = typeSelect?.value || "";

    const filtered = allProducts.filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;

      if (keyword) {
        const haystack = [
          p.title || "",
          p.description || "",
          p.type || "",
          ...(p.platform || []),
          ...(p.tags || []),
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(keyword)) return false;
      }

      return true;
    });

    listEl.innerHTML = "";

    if (!filtered.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    filtered.forEach((p) => {
      const card = document.createElement("article");
      card.className = "card card--clickable product-card";

      if (p.thumbnail) {
        const thumb = document.createElement("div");
        thumb.className = "card__thumb";
        const img = document.createElement("img");
        img.src = p.thumbnail;
        img.alt = p.title || "";
        thumb.appendChild(img);
        card.appendChild(thumb);
      }

      const body = document.createElement("div");
      body.className = "card__body";

      const titleRow = document.createElement("div");
      titleRow.className = "card__title-row";

      if (p.type) {
        const pill = document.createElement("span");
        pill.className = "pill pill--accent";
        pill.textContent = p.type;
        titleRow.appendChild(pill);
      }

      const title = document.createElement("h3");
      title.className = "card__title";
      title.textContent = p.title || "";
      titleRow.appendChild(title);

      body.appendChild(titleRow);

      if (p.platform && p.platform.length) {
        const plat = document.createElement("p");
        plat.className = "card__meta";
        plat.textContent = `Platform: ${p.platform.join(", ")}`;
        body.appendChild(plat);
      }

      if (p.description) {
        const desc = document.createElement("p");
        desc.className = "card__description";
        desc.textContent = p.description;
        body.appendChild(desc);
      }

      if (p.tags && p.tags.length) {
        const tagRow = document.createElement("div");
        tagRow.className = "card__tags";
        p.tags.forEach((t) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = t;
          tagRow.appendChild(tag);
        });
        body.appendChild(tagRow);
      }

      const actions = document.createElement("div");
      actions.className = "card__actions";

      if (p.storeLinks && p.storeLinks.length) {
        p.storeLinks.forEach((link) => {
          const a = document.createElement("a");
          a.href = link.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.className = "btn btn--sm btn--outline";
          a.textContent = link.label || "Store";
          actions.appendChild(a);
        });
      }

      if (p.downloadLinks && p.downloadLinks.length) {
        p.downloadLinks.forEach((link) => {
          const a = document.createElement("a");
          a.href = link.url;
          a.className = "btn btn--sm btn--primary";
          a.textContent = link.label || "Download";
          actions.appendChild(a);
        });
      }

      if (actions.children.length) {
        body.appendChild(actions);
      }

      card.appendChild(body);
      listEl.appendChild(card);
    });
  }

  // -----------------------------
  // フィルタ操作イベント
  // -----------------------------
  if (searchInput) {
    searchInput.addEventListener("input", render);
  }

  if (typeSelect) {
    typeSelect.addEventListener("change", render);
  }

  loadProducts();
});
