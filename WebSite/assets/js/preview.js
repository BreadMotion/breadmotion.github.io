/**
 * preview.js
 * --------------------------------------------------
 * aタグを長押しで遷移先ページをプレビュー表示するスクリプト。
 * 見た目をポートフォリオのカード構造に合わせ、サイト全体で一貫した UI にする。
 * --------------------------------------------------
 */
(() => {
  const LONG_PRESS_MS = 500; // 長押し判定時間
  let longPressTimer = null;
  let activeAnchor = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;
  let previewEl = null;

  function isSameOriginUrl(href) {
    try {
      const url = new URL(href, location.href);
      return url.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  /**
   * プレビューの DOM をポートフォリオカードと同等の構造で生成する
   * card__thumb, card__body, card__meta, card__title, card__description, card__tags, card__actions を使用
   */
  function createPreviewElement() {
    const el = document.createElement("article");
    // portfolio のカードと視覚的一貫性を持たせるために同じクラスを使う
    el.className =
      "card card--clickable portfolio-card link-preview";
    el.style.display = "none";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");

    el.innerHTML = `
      <div class="card__thumb"><img class="media" alt="" /></div>
      <div class="card__body">
        <p class="card__meta preview-meta"></p>
        <div class="card__title-row"><h3 class="card__title preview-title"></h3></div>
        <p class="card__meta card__meta--role preview-role" style="display:none"></p>
        <p class="card__description excerpt preview-excerpt"></p>
        <div class="card__tags preview-tags" style="display:none"></div>
        <div class="card__actions preview-actions">
          <button class="open-btn">開く</button>
          <button class="close-btn" aria-label="閉じる">✕</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    const closeBtn = el.querySelector(".close-btn");
    const openBtn = el.querySelector(".open-btn");

    closeBtn.addEventListener("click", () => hidePreview());
    openBtn.addEventListener("click", () => {
      if (activeAnchor) {
        // 通常の遷移
        window.location.href = activeAnchor.href;
      }
    });

    // プレビュー内部のリンクは外部に飛ばないよう suppress する（ただし基本は open ボタンで遷移）
    el.addEventListener("click", (ev) => {
      const a = ev.target.closest && ev.target.closest("a");
      if (a) {
        ev.preventDefault();
        ev.stopPropagation();
        // クリックされたリンクが内部ページであればプレビューを閉じて遷移する
        if (isSameOriginUrl(a.href)) {
          window.location.href = a.href;
        } else {
          // 外部は新しいタブで開く
          window.open(a.href, "_blank", "noopener");
        }
      }
    });

    return el;
  }

  function showPreviewAt(x, y, data) {
    if (!previewEl) previewEl = createPreviewElement();

    const img = previewEl.querySelector(".media");
    const title = previewEl.querySelector(".preview-title");
    const excerpt = previewEl.querySelector(
      ".preview-excerpt",
    );
    const meta = previewEl.querySelector(".preview-meta");
    const role = previewEl.querySelector(".preview-role");
    const tagsEl = previewEl.querySelector(".preview-tags");

    // サムネイル
    if (data.image) {
      img.src = data.image;
      img.style.display = "";
    } else {
      img.style.display = "none";
      img.removeAttribute("src");
    }

    title.textContent = data.title || "";
    excerpt.textContent = data.excerpt || "";

    // meta: 日付 / カテゴリ 相当（存在すれば）
    if (
      data.meta &&
      (data.meta.date || data.meta.category)
    ) {
      meta.textContent = [
        data.meta.date,
        data.meta.category,
      ]
        .filter(Boolean)
        .join(" / ");
      meta.style.display = "";
    } else {
      meta.textContent = "";
      meta.style.display = "none";
    }

    // role があれば表示
    if (data.role) {
      role.textContent = `Role: ${data.role}`;
      role.style.display = "";
    } else {
      role.textContent = "";
      role.style.display = "none";
    }

    // tags を表示（配列またはカンマ区切り）
    if (data.tags && data.tags.length) {
      tagsEl.innerHTML = "";
      data.tags.slice(0, 5).forEach((t) => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tagsEl.appendChild(span);
      });
      tagsEl.style.display = "";
    } else {
      tagsEl.style.display = "none";
      tagsEl.innerHTML = "";
    }

    // 位置調整（右端・下端にはみ出さないように）
    previewEl.style.display = "";
    previewEl.style.opacity = "0";
    previewEl.style.transform = "scale(0.98)";
    requestAnimationFrame(() => {
      const rect = previewEl.getBoundingClientRect();
      let left = x;
      let top = y;
      // 右にはみ出す場合は左寄せ
      if (left + rect.width > window.innerWidth - 8) {
        left = Math.max(
          8,
          window.innerWidth - rect.width - 8,
        );
      }
      // 下にはみ出す場合は上に表示
      if (top + rect.height > window.innerHeight - 8) {
        top = Math.max(8, y - rect.height - 8);
      }
      previewEl.style.left = `${left}px`;
      previewEl.style.top = `${top}px`;
      previewEl.style.position = "fixed";
      previewEl.style.transition =
        "opacity 160ms ease, transform 160ms ease";
      previewEl.style.opacity = "1";
      previewEl.style.transform = "scale(1)";
    });
  }

  function hidePreview() {
    if (!previewEl) return;
    previewEl.style.opacity = "0";
    previewEl.style.transform = "scale(0.98)";
    setTimeout(() => {
      if (previewEl) previewEl.style.display = "none";
    }, 180);
    activeAnchor = null;
  }

  /**
   * fetch してプレビューに必要な情報を抜き出す
   * - title
   * - image (og:image / twitter:image)
   * - excerpt (main p / article p / first p)
   * - meta (date / category) ... ページ内の要素から自動抽出を試みる（クラス名ベース）
   * - tags (meta name=keywords or .tags 要素)
   */
  async function fetchPreviewData(href) {
    const resp = await fetch(href, {
      credentials: "include",
    });
    const text = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");

    const title = (
      doc.querySelector('meta[property="og:title"]')
        ?.content ||
      doc.querySelector('meta[name="twitter:title"]')
        ?.content ||
      doc.querySelector("title")?.textContent ||
      ""
    ).trim();

    const image =
      doc.querySelector('meta[property="og:image"]')
        ?.content ||
      doc.querySelector('meta[name="twitter:image"]')
        ?.content ||
      null;

    let excerpt = "";
    const candidates = [
      doc.querySelector("main p"),
      doc.querySelector("article p"),
      doc.querySelector(".lead"),
      doc.querySelector("p"),
    ];
    for (const c of candidates) {
      if (c && c.textContent.trim()) {
        excerpt = c.textContent.trim();
        break;
      }
    }
    if (excerpt.length > 220)
      excerpt = excerpt.slice(0, 217) + "…";

    // meta 情報の試行抽出（記事ページで使われるクラス名などに対応）
    const meta = { date: "", category: "" };
    const dateEl =
      doc.querySelector("time") ||
      doc.querySelector(".post-date") ||
      doc.querySelector(".date");
    if (dateEl)
      meta.date = (
        dateEl.getAttribute("datetime") ||
        dateEl.textContent ||
        ""
      ).trim();

    const categoryEl =
      doc.querySelector(".category") ||
      doc.querySelector(".post-category");
    if (categoryEl)
      meta.category = categoryEl.textContent.trim();

    // role があれば抽出
    const roleEl =
      doc.querySelector(".role") ||
      doc.querySelector(".post-role");
    const role = roleEl ? roleEl.textContent.trim() : "";

    // tags
    let tags = [];
    const keywordsMeta = doc.querySelector(
      'meta[name="keywords"]',
    )?.content;
    if (keywordsMeta) {
      tags = keywordsMeta
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else {
      const tagEls = doc.querySelectorAll(
        ".tags .tag, .post-tags a, .tags a",
      );
      if (tagEls && tagEls.length) {
        tags = Array.from(tagEls)
          .map((n) => n.textContent.trim())
          .filter(Boolean);
      }
    }

    return { title, image, excerpt, meta, role, tags };
  }

  function onPointerDown(e) {
    // 左ボタンのみ（マウス）
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const a = e.target.closest && e.target.closest("a");
    if (!a || !a.href) return;
    // 内部リンクのみ（自分のページ限定）
    if (!isSameOriginUrl(a.href)) return;

    activeAnchor = a;
    suppressClick = false;
    startX = e.clientX;
    startY = e.clientY;

    // 長押しタイマー
    longPressTimer = setTimeout(async () => {
      // 長押し確定。プレビュー表示
      suppressClick = true;
      try {
        const data = await fetchPreviewData(a.href);
        // 表示位置は押下点の少しオフセットにする
        showPreviewAt(startX + 8, startY + 8, data);
      } catch (err) {
        // エラーは console に出すが UI は壊さない
        console.error("preview fetch failed", err);
      }
    }, LONG_PRESS_MS);

    // pointer capture で move を監視する（多くのブラウザで）
    try {
      e.target.setPointerCapture &&
        e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerUpOrCancel(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    // プレビューはユーザー操作で閉じる方針（open/close ボタン、外部クリック、Esc）
  }

  // クリックイベントで長押しした場合は遷移を抑止する
  function onClick(e) {
    const a = e.target.closest && e.target.closest("a");
    if (!a) {
      // プレビュー外のクリックは既存処理へ
      return;
    }
    if (suppressClick && activeAnchor === a) {
      e.preventDefault();
      e.stopPropagation();
      // 次回のクリックで通常遷移させるため suppressClick をリセット
      suppressClick = false;
    } else {
      // 通常クリックではプレビューを閉じる
      hidePreview();
    }
  }

  // プレビュー外のクリックで閉じる
  function onDocumentClick(e) {
    if (!previewEl) return;
    if (previewEl.contains(e.target)) return;
    hidePreview();
  }

  // Esc で閉じる
  function onKeyDown(e) {
    if (e.key === "Escape") hidePreview();
  }

  document.addEventListener("pointerdown", onPointerDown, {
    passive: true,
  });
  document.addEventListener(
    "pointerup",
    onPointerUpOrCancel,
  );
  document.addEventListener(
    "pointercancel",
    onPointerUpOrCancel,
  );
  document.addEventListener("click", onClick, true); // キャプチャで先に防げるように
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeyDown);

  // タッチデバイスでの小さな pointermove（スワイプ）の場合は長押しをキャンセルする
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!longPressTimer) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    },
    { passive: true },
  );
})();
