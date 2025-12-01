/**
 * blog.js
 * --------------------------------------------------
 * ブログ一覧ページ用スクリプト。
 * 記事のフィルタリング、検索、ページネーションを管理。
 * --------------------------------------------------
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const da = ("0" + d.getDate()).slice(-2);
  return `${y}/${m}/${da}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const POSTS_PER_PAGE = 10;

  // --- DOM Elements ---
  const listEl = document.getElementById("blogList");
  const emptyEl = document.getElementById(
    "blogEmptyMessage",
  );
  const searchInput = document.getElementById("blogSearch");
  const categorySelect = document.getElementById(
    "blogCategoryFilter",
  );
  const paginationContainer = document.getElementById(
    "paginationContainer",
  );

  if (!listEl) return;

  // --- State ---
  let allPosts = [];
  let currentPage = 1;

  // --- URL Parameter Handling ---
  function updateUrlParams(keyword, category, page) {
    const params = new URLSearchParams(
      window.location.search,
    );
    // Remove one-off "tag" param if it exists
    params.delete("tag");

    if (keyword) params.set("q", keyword);
    else params.delete("q");

    if (category) params.set("category", category);
    else params.delete("category");

    if (page > 1) params.set("page", page);
    else params.delete("page");

    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    history.replaceState(null, "", newUrl);
  }

  function readInitialParams() {
    const params = new URLSearchParams(location.search);
    const tag = params.get("tag") || "";
    const q = params.get("q") || "";
    const category = params.get("category") || "";

    currentPage = parseInt(params.get("page"), 10) || 1;

    if (searchInput) {
      searchInput.value = tag || q;
    }
    if (categorySelect && category) {
      // This runs after categories are populated
      categorySelect.value = category;
    }
  }

  // --- Data Loading & Initialization ---
  async function loadPosts() {
    try {
      const lang = document.documentElement.lang;
      const isEn = lang === "en";
      const relativePrefix = isEn ? "../" : "";

      const jsonPath = isEn
        ? `${relativePrefix}assets/data/blogList_en.json`
        : `${relativePrefix}assets/data/blogList.json`;

      const res = await fetch(jsonPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawPosts = await res.json();

      allPosts = rawPosts.map((p) => {
        if (isEn) {
          return {
            ...p,
            thumbnail: p.thumbnail
              ? `${relativePrefix}${p.thumbnail}`
              : p.thumbnail,
            contentPath: p.contentPath
              ? `${relativePrefix}${p.contentPath}`
              : p.contentPath,
          };
        }
        return p;
      });

      updateCategoryFilter();
      readInitialParams();
      render();
    } catch (err) {
      console.error("Failed to load blog list:", err);
      if (emptyEl) {
        emptyEl.textContent =
          "記事一覧の読み込みに失敗しました。";
        emptyEl.style.display = "block";
      }
    }
  }

  // --- UI Component Rendering ---
  function updateCategoryFilter() {
    if (!categorySelect) return;
    const categories = [
      ...new Set(
        allPosts.map((p) => p.category).filter(Boolean),
      ),
    ].sort();

    while (categorySelect.options.length > 1) {
      categorySelect.remove(1);
    }

    categories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    });
  }

  function renderPagination(
    totalPosts,
    postsPerPage,
    currentPage,
  ) {
    if (!paginationContainer) return;
    paginationContainer.innerHTML = "";
    const totalPages = Math.ceil(totalPosts / postsPerPage);

    if (totalPages <= 1) return;

    const createButton = (
      text,
      page,
      isDisabled = false,
      isActive = false,
      className = "",
    ) => {
      const button = document.createElement("button");
      button.className = `pagination__item ${className}`;
      button.textContent = text;
      button.disabled = isDisabled;
      button.dataset.page = page;
      if (isActive) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "page");
      }
      return button;
    };

    paginationContainer.appendChild(
      createButton(
        "‹",
        currentPage - 1,
        currentPage === 1,
        false,
        "pagination__item--prev",
      ),
    );

    for (let i = 1; i <= totalPages; i++) {
      paginationContainer.appendChild(
        createButton(i, i, false, i === currentPage),
      );
    }

    paginationContainer.appendChild(
      createButton(
        "›",
        currentPage + 1,
        currentPage === totalPages,
        false,
        "pagination__item--next",
      ),
    );
  }

  // --- Main Render Function ---
  function render() {
    const keyword = (searchInput?.value || "")
      .trim()
      .toLowerCase();
    const categoryFilter = (
      categorySelect?.value || ""
    ).trim();

    const filteredPosts = allPosts.filter((post) => {
      if (
        categoryFilter &&
        post.category !== categoryFilter
      )
        return false;
      if (keyword) {
        const tags = Array.isArray(post.tags)
          ? post.tags
          : String(post.tags || "")
              .split(",")
              .map((t) => t.trim());
        const haystack = [
          post.title,
          post.description,
          post.category,
          ...tags,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    listEl.innerHTML = "";
    if (paginationContainer)
      paginationContainer.innerHTML = "";

    if (!filteredPosts.length) {
      if (emptyEl) emptyEl.style.display = "block";
      updateUrlParams(keyword, categoryFilter, 1);
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    const totalPosts = filteredPosts.length;
    const totalPages = Math.ceil(
      totalPosts / POSTS_PER_PAGE,
    );
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    const endIndex = startIndex + POSTS_PER_PAGE;
    const postsToShow = filteredPosts.slice(
      startIndex,
      endIndex,
    );

    postsToShow.forEach(createAndAppendCard);

    renderPagination(
      totalPosts,
      POSTS_PER_PAGE,
      currentPage,
    );
    updateUrlParams(keyword, categoryFilter, currentPage);
  }

  function createAndAppendCard(post) {
    // If a contentPath exists, use an anchor so preview.js can detect links.
    // Otherwise, fall back to an article element for non-clickable cards.
    const isLink = !!post.contentPath;
    const card = isLink
      ? document.createElement("a")
      : document.createElement("article");

    // Preserve existing class names
    card.className = "card card--clickable blog-card";

    if (isLink) {
      card.setAttribute("href", post.contentPath);
      // Optionally allow opening in same tab; preview.js intercepts long-press.
      card.setAttribute("role", "link");
    }

    if (post.thumbnail) {
      const thumb = document.createElement("div");
      thumb.className = "card__thumb";
      const img = document.createElement("img");
      img.src = post.thumbnail;
      img.alt = post.title || "";
      thumb.appendChild(img);
      card.appendChild(thumb);
    }

    const body = document.createElement("div");
    body.className = "card__body";

    const meta = document.createElement("p");
    meta.className = "card__meta";
    meta.textContent = [
      formatDate(post.date),
      post.category || "",
    ]
      .filter(Boolean)
      .join(" / ");
    body.appendChild(meta);

    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = post.title || "";
    body.appendChild(title);

    if (post.description) {
      const desc = document.createElement("p");
      desc.className = "card__description";
      desc.textContent = post.description;
      body.appendChild(desc);
    }

    const tagsArr = Array.isArray(post.tags)
      ? post.tags
      : String(post.tags || "")
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

        // Prevent navigation when pressing a tag (pointer/touch) so the card anchor doesn't activate.
        // Keep the click handler for filtering behavior.
        try {
          const onTagPrevent = (ev) => {
            try {
              ev.preventDefault && ev.preventDefault();
              ev.stopPropagation && ev.stopPropagation();
            } catch (_) {}
          };
          tag.addEventListener(
            "pointerdown",
            onTagPrevent,
            { passive: false },
          );
          tag.addEventListener("touchstart", onTagPrevent, {
            passive: false,
          });
        } catch (_) {}
        tag.addEventListener("click", (e) => {
          try {
            e.stopPropagation && e.stopPropagation();
            e.preventDefault && e.preventDefault();
          } catch (_) {}
          if (searchInput) searchInput.value = t;
          if (categorySelect) categorySelect.value = "";
          currentPage = 1;
          render();
        });
        tagRow.appendChild(tag);
      });
      body.appendChild(tagRow);
    }

    card.appendChild(body);
    // If not using an anchor, fall back to click handler for navigation.
    if (!isLink) {
      card.addEventListener("click", () => {
        if (post.contentPath) {
          window.location.href = post.contentPath;
        }
      });
    } else {
      // For anchors, optionally prevent middle-click/ctrl-click handling here if needed.
      // Keep default behavior for normal clicks (navigation) but preview.js handles long-press.
    }
    listEl.appendChild(card);
  }

  // --- Event Listeners ---
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      currentPage = 1;
      render();
    });
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      currentPage = 1;
      render();
    });
  }
  if (paginationContainer) {
    paginationContainer.addEventListener("click", (e) => {
      const target = e.target.closest("button");
      if (
        target &&
        target.dataset.page &&
        !target.disabled
      ) {
        const page = parseInt(target.dataset.page, 10);
        if (page !== currentPage) {
          currentPage = page;
          render();
          listEl.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  }

  // --- Initial Load ---
  loadPosts();
});
