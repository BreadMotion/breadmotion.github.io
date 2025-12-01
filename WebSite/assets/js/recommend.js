/**
 * recommend.js
 * --------------------------------------------------
 * おすすめ記事/関連記事表示用スクリプト。
 * 人気記事、タグベースの関連記事を動的に表示。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. 要素の取得と存在チェック
  const recommendListEl =
    document.getElementById("recommendList");
  const relatedListEl =
    document.getElementById("relatedList");
  if (!recommendListEl && !relatedListEl) return;

  // 2. 言語とパスの設定
  const lang = document.documentElement.lang;
  const isEn = lang === "en";
  const isBlogDir =
    window.location.pathname.includes("/blog/") &&
    !window.location.pathname.endsWith("blog.html");

  let basePath = "";
  if (isBlogDir) {
    // 詳細ページ: /blog/xxx.html -> ../  or /blog/en/xxx.html -> ../../
    basePath = isEn ? "../../" : "../";
  } else {
    // 一覧など: /blog.html -> ./ or /en/blog.html -> ../
    basePath = isEn ? "../" : "";
  }

  const blogListPath = isEn
    ? `${basePath}assets/data/blogList_en.json`
    : `${basePath}assets/data/blogList.json`;
  const popularDataPath = `${basePath}assets/data/popular.json`;

  try {
    // 3. データ取得
    const [blogListRes, popularRes] =
      await Promise.allSettled([
        fetch(blogListPath),
        fetch(popularDataPath),
      ]);

    if (
      blogListRes.status !== "fulfilled" ||
      !blogListRes.value.ok
    ) {
      throw new Error("Failed to load blog list");
    }
    const posts = await blogListRes.value.json();

    // 4. 現在の記事IDを特定
    //    - First, try to get from data-post-id attribute (most reliable)
    //    - Fallback: parse from pathname using a more flexible regex
    let currentId = null;

    // Method 1: Use data-post-id from body (preferred)
    if (document.body.dataset.postId) {
      currentId = document.body.dataset.postId;
      console.debug("[recommend.js] currentId from data-post-id:", currentId);
    } else {
      // Method 2: Fallback to pathname parsing
      const pathMatch = window.location.pathname.match(
        /\/([^/]+)\.html$/,
      );
      if (pathMatch) {
        const filename = pathMatch[1];
        // Ignore index.html and blog.html (list pages)
        if (filename !== "index" && filename !== "blog") {
          currentId = filename;
          console.debug("[recommend.js] currentId from pathname:", currentId);
        }
      }
    }

    if (!currentId && isBlogDir) {
      console.debug("[recommend.js] No currentId detected on blog dir page");
    }

    // ==========================================
    // 5. ページ種別による分岐
    // ==========================================

    if (currentId) {
      // ------------------------------------------
      // 記事詳細ページ
      // ------------------------------------------
      const currentPost = posts.find(
        (p) => p.id === currentId,
      );
      const displayedIds = new Set(
        currentId ? [currentId] : [],
      );

      // 5-1. 関連記事の処理
      if (relatedListEl && currentPost) {
        const scoredPosts = posts
          .filter((p) => p.id !== currentId)
          .map((p) => {
            let score = 0;
            if (currentPost.tags && p.tags) {
              const currentTags = new Set(currentPost.tags);
              const targetTags = new Set(p.tags);
              score += [...targetTags].filter((tag) =>
                currentTags.has(tag),
              ).length;
            }
            if (
              currentPost.category &&
              p.category &&
              currentPost.category === p.category
            ) {
              score += 0.5;
            }
            return { post: p, score };
          })
          .filter((item) => item.score > 0); // スコアが0より大きい記事のみを対象

        scoredPosts.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (
            new Date(b.post.date) - new Date(a.post.date)
          );
        });

        const relatedPosts = scoredPosts
          .slice(0, 6)
          .map((item) => item.post);

        if (relatedPosts.length > 0) {
          const title = isEn ? "Related Posts" : "関連記事";
          renderPosts(
            relatedListEl,
            relatedPosts,
            basePath,
            title,
          );
          relatedPosts.forEach((p) =>
            displayedIds.add(p.id),
          );
        } else {
          console.debug("[recommend.js] Removing relatedList: no related posts found for currentId:", currentId);
          relatedListEl.closest(".section")?.remove();
        }
      } else if (relatedListEl) {
        console.debug("[recommend.js] Removing relatedList: currentPost not found for currentId:", currentId);
        relatedListEl.closest(".section")?.remove();
      }

      // 5-2. おすすめ記事の処理
      if (recommendListEl) {
        const recommendedPosts = posts
          .filter(
            (p) => p.recommended && !displayedIds.has(p.id),
          )
          .sort(
            (a, b) => new Date(b.date) - new Date(a.date),
          )
          .slice(0, 6);

        if (recommendedPosts.length > 0) {
          const title = isEn
            ? "Recommended"
            : "おすすめ記事";
          renderPosts(
            recommendListEl,
            recommendedPosts,
            basePath,
            title,
          );
        } else {
          recommendListEl.closest(".section")?.remove();
        }
      }
    } else {
      // ------------------------------------------
      // トップページ・一覧ページ
      // ------------------------------------------
      if (relatedListEl) {
        relatedListEl.closest(".section")?.remove();
      }

      if (recommendListEl) {
        let targetPosts = [];
        let sectionTitle = isEn
          ? "Recommended"
          : "おすすめ記事";
        let popularIds = [];

        if (
          popularRes.status === "fulfilled" &&
          popularRes.value.ok
        ) {
          try {
            popularIds = await popularRes.value.json();
          } catch (e) {
            console.warn("Invalid popular.json", e);
          }
        }

        if (popularIds.length > 0) {
          sectionTitle = isEn
            ? "Popular Posts"
            : "人気記事";
          targetPosts = popularIds
            .map((id) => posts.find((p) => p.id === id))
            .filter(Boolean)
            .slice(0, 6);
        }

        const displayedIds = new Set(
          targetPosts.map((p) => p.id),
        );

        if (targetPosts.length < 6) {
          const recommended = posts
            .filter(
              (p) =>
                p.recommended && !displayedIds.has(p.id),
            )
            .sort(
              (a, b) => new Date(b.date) - new Date(a.date),
            );

          const needed = 6 - targetPosts.length;
          const postsToAdd = recommended.slice(0, needed);
          targetPosts.push(...postsToAdd);
          postsToAdd.forEach((p) => displayedIds.add(p.id));
        }

        if (targetPosts.length < 6) {
          const latest = posts
            .filter((p) => !displayedIds.has(p.id))
            .sort(
              (a, b) => new Date(b.date) - new Date(a.date),
            );

          const needed = 6 - targetPosts.length;
          targetPosts.push(...latest.slice(0, needed));
        }

        if (targetPosts.length > 0) {
          renderPosts(
            recommendListEl,
            targetPosts,
            basePath,
            sectionTitle,
          );
        } else {
          recommendListEl.closest(".section")?.remove();
        }
      }
    }
  } catch (err) {
    console.error("Failed to load posts data:", err);
    recommendListEl?.closest(".section")?.remove();
    relatedListEl?.closest(".section")?.remove();
  }
});

/**
 * 指定されたコンテナに投稿のリストを描画します。
 * @param {HTMLElement} container - 投稿カードを描画する親要素。
 * @param {Array} posts - 描画する投稿オブジェクトの配列。
 * @param {string} basePath - 相対パスの基準となるパス。
 * @param {string} title - セクションのタイトル。
 */
function renderPosts(container, posts, basePath, title) {
  if (!container) return;

  const sectionEl = container.closest(".section");
  if (sectionEl) {
    const titleEl = sectionEl.querySelector(
      ".section__title",
    );
    if (titleEl && title) {
      titleEl.textContent = title;
    }
  }

  container.innerHTML = "";

  const fixImgPath = (path) => {
    if (
      !path ||
      path.startsWith("http") ||
      path.startsWith("data:")
    )
      return path;
    return basePath + path;
  };

  posts.forEach((post) => {
    const card = document.createElement("a");
    card.className = "card card--recommend";
    card.href = `${basePath}${post.contentPath}`;

    const img = document.createElement("img");
    img.className = "card--recommend__thumb";
    img.src =
      fixImgPath(post.thumbnail) ||
      fixImgPath("assets/img/ogp.png");
    img.alt = post.title || "";
    img.loading = "lazy";

    const content = document.createElement("div");
    content.className = "card--recommend__content";

    const titleEl = document.createElement("h3");
    titleEl.className = "card--recommend__title";
    titleEl.textContent = post.title;

    const desc = document.createElement("p");
    desc.className = "card--recommend__desc";
    desc.textContent = post.description || "";

    const meta = document.createElement("div");
    meta.className = "card--recommend__meta";

    const dateSpan = document.createElement("span");
    if (post.date) {
      const d = new Date(post.date);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = ("0" + (d.getMonth() + 1)).slice(-2);
        const da = ("0" + d.getDate()).slice(-2);
        dateSpan.textContent = `${y}/${m}/${da}`;
      }
    }
    meta.appendChild(dateSpan);

    if (post.category) {
      const categorySpan = document.createElement("span");
      categorySpan.className = "card--recommend__tag";
      categorySpan.textContent = post.category;
      meta.appendChild(categorySpan);
    }

    content.appendChild(titleEl);
    content.appendChild(desc);
    content.appendChild(meta);

    card.appendChild(img);
    card.appendChild(content);

    container.appendChild(card);
  });
}
