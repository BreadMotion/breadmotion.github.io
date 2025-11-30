document.addEventListener("DOMContentLoaded", () => {
  // 目次内のリンクをすべて取得
  const tocLinks = document.querySelectorAll(".toc a");
  if (tocLinks.length === 0) {
    return;
  }

  // 目次リンクから対応する見出し要素を取得
  const headings = Array.from(tocLinks)
    .map((link) => {
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) return null;
      return document.getElementById(href.substring(1));
    })
    .filter(Boolean);

  if (headings.length === 0) {
    return;
  }

  // IntersectionObserverを初期化して、見出しが画面内に入ったかを監視
  const observer = new IntersectionObserver(
    (entries) => {
      let activeHeading = null;

      // 画面内に表示されている見出しの中から、最も上にあるものを探す
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (
            !activeHeading ||
            !activeHeading.boundingClientRect ||
            entry.boundingClientRect.top <
              activeHeading.boundingClientRect.top
          ) {
            activeHeading = entry.target;
          }
        }
      }

      // 画面内に見出しがない場合、最後に通過した見出しをアクティブにする
      if (!activeHeading) {
        for (let i = headings.length - 1; i >= 0; i--) {
          if (headings[i].getBoundingClientRect().top < 0) {
            activeHeading = headings[i];
            break;
          }
        }
      }

      // すべての目次リンクのアクティブ状態を更新
      tocLinks.forEach((link) => {
        const isActive =
          activeHeading &&
          link.getAttribute("href") ===
            `#${activeHeading.id}`;
        link.classList.toggle("is-active", isActive);
      });
    },
    {
      // ビューポートの上部20%から下部80%の範囲で見出しを監視
      rootMargin: "-60px 0px 0px 0px",
      threshold: 0,
    },
  );

  // すべての見出しを監視対象に追加
  headings.forEach((heading) => observer.observe(heading));

  // --- TOC Drawer Menu Logic ---
  const tocToggle = document.querySelector(".toc-toggle");
  const postSidebar =
    document.querySelector(".post-sidebar");
  const tocOverlay = document.querySelector(".toc-overlay");
  const body = document.body;

  if (tocToggle && postSidebar && tocOverlay) {
    const openToc = () => {
      postSidebar.classList.add("is-open");
      tocOverlay.classList.add("is-open");
      body.classList.add("no-scroll");
    };

    const closeToc = () => {
      postSidebar.classList.remove("is-open");
      tocOverlay.classList.remove("is-open");
      body.classList.remove("no-scroll");
    };

    tocToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      postSidebar.classList.contains("is-open")
        ? closeToc()
        : openToc();
    });

    tocOverlay.addEventListener("click", closeToc);

    // Close TOC when a link is clicked inside
    postSidebar
      .querySelectorAll(".toc a")
      .forEach((link) => {
        link.addEventListener("click", closeToc);
      });
  }
});
