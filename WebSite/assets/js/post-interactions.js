/**
 * post-interactions.js
 * - いいね（Like）とブックマークのクライアント実装
 * - localStorage を利用したフォールバック（サーバーが無くても動作）
 * - window.__POST_INTERACTIONS_CONFIG に GAS Web App URL が埋め込まれていれば
 *   GET クエリ（action=get|like|unlike&postId=...）を使って API と同期
 *
 * 実装方針（軽量）:
 * - Bookmark: localStorage に保存（ユーザー毎のブックマーク）
 * - Like: ユーザー単体の「自分がいいねしたか」は localStorage。総数は API から取得（グローバル永続化）
 *
 * 依存なし（Vanilla JS）
 */

(function () {
  "use strict";

  // シンプルな DOM ユーティリティ
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.from(
      (root || document).querySelectorAll(sel),
    );
  }

  function supportsLocalStorage() {
    try {
      const key = "__storage_test__";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readLocal(key, defaultValue) {
    if (!supportsLocalStorage()) return defaultValue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      return defaultValue;
    }
  }

  function writeLocal(key, value) {
    if (!supportsLocalStorage()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore
    }
  }

  // 設定（ビルド時に埋め込まれる）
  const CONFIG = window.__POST_INTERACTIONS_CONFIG || {};
  const API_BASE = CONFIG.apiUrl || "";
  const PAGE_POST_ID =
    CONFIG.postId ||
    document.body.getAttribute("data-post-id") ||
    "";

  // key の命名規則
  function likeCountKey(postId) {
    return `post_like_count_${postId}`;
  }
  function likeUserKey(postId) {
    return `post_liked_by_user_${postId}`;
  }
  const bookmarkKey = "post_bookmarks_v1"; // value: array of postId

  // ボタン UI 操作
  function setLikeButtonState(btn, liked, count) {
    if (!btn) return;
    btn.setAttribute(
      "aria-pressed",
      liked ? "true" : "false",
    );
    const countEl = btn.querySelector(".like-count");
    if (countEl) countEl.textContent = String(count || 0);
    if (liked) btn.classList.add("is-liked");
    else btn.classList.remove("is-liked");
  }

  function setBookmarkButtonState(btn, bookmarked) {
    if (!btn) return;
    btn.setAttribute(
      "aria-pressed",
      bookmarked ? "true" : "false",
    );
    if (bookmarked) btn.classList.add("is-bookmarked");
    else btn.classList.remove("is-bookmarked");
  }

  // GAS Web App API 呼び出し
  // GET: action=get|like|unlike&postId=...
  // レスポンス: { likes: number, ... }
  async function fetchLikeCountFromApi(postId) {
    if (!API_BASE) return null;
    try {
      const url = new URL(API_BASE);
      url.searchParams.set("action", "get");
      url.searchParams.set("postId", postId);
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const json = await res.json();
      return typeof json.likes === "number"
        ? json.likes
        : null;
    } catch (e) {
      return null;
    }
  }

  async function sendLikeToggleToApi(postId, action) {
    if (!API_BASE) return null;
    try {
      const url = new URL(API_BASE);
      url.searchParams.set("action", action); // 'like' or 'unlike'
      url.searchParams.set("postId", postId);
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const json = await res.json();
      return typeof json.likes === "number"
        ? json.likes
        : null;
    } catch (e) {
      return null;
    }
  }

  // 初期化: ボタンを hook して状態を復元
  function initForPost(postId, container) {
    const likeBtn = container.querySelector(".btn-like");
    const bookmarkBtn =
      container.querySelector(".btn-bookmark");

    // 初期データ読み込み: localStorage をまず参照
    let count = readLocal(likeCountKey(postId), null);
    const userLiked = !!readLocal(
      likeUserKey(postId),
      false,
    );
    // bookmarks
    const bookmarks = readLocal(bookmarkKey, []);
    const bookmarked = bookmarks.indexOf(postId) !== -1;

    // UI 初期反映（0 を未設定と区別しない）
    setLikeButtonState(likeBtn, userLiked, count || 0);
    setBookmarkButtonState(bookmarkBtn, bookmarked);

    // 可能なら API から最新のカウントを取得して上書き
    if (API_BASE) {
      fetchLikeCountFromApi(postId)
        .then((apiCount) => {
          if (typeof apiCount === "number") {
            count = apiCount;
            writeLocal(likeCountKey(postId), count);
            setLikeButtonState(likeBtn, userLiked, count);
          }
        })
        .catch(() => {});
    }

    // イベント: いいね
    if (likeBtn) {
      likeBtn.addEventListener("click", async function () {
        const currentlyLiked = !!readLocal(
          likeUserKey(postId),
          false,
        );
        let newLiked = !currentlyLiked;
        let countVal = readLocal(likeCountKey(postId), 0);
        if (typeof countVal !== "number") countVal = 0;

        // UI 即時反映（楽しい UX のため）
        if (newLiked) {
          countVal = countVal + 1;
        } else {
          countVal = Math.max(0, countVal - 1);
        }
        setLikeButtonState(likeBtn, newLiked, countVal);
        // local 更新
        writeLocal(likeUserKey(postId), newLiked);
        writeLocal(likeCountKey(postId), countVal);

        // API があるなら送信して最新値を取得し上書き
        if (API_BASE) {
          const apiResult = await sendLikeToggleToApi(
            postId,
            newLiked ? "like" : "unlike",
          );
          if (typeof apiResult === "number") {
            writeLocal(likeCountKey(postId), apiResult);
            setLikeButtonState(
              likeBtn,
              newLiked,
              apiResult,
            );
          }
        }
      });
    }

    // イベント: ブックマーク
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener("click", function () {
        const curBookmarks = readLocal(bookmarkKey, []);
        const idx = curBookmarks.indexOf(postId);
        let newBookmarked;
        if (idx === -1) {
          curBookmarks.push(postId);
          newBookmarked = true;
        } else {
          curBookmarks.splice(idx, 1);
          newBookmarked = false;
        }
        writeLocal(bookmarkKey, curBookmarks);
        setBookmarkButtonState(bookmarkBtn, newBookmarked);

        // 参考: ブックマーク一覧ページなどを用意する場合は curBookmarks を参照すると良い
      });
    }
  }

  // ページ内にあるすべての .post-actions を初期化
  function initAll() {
    const containers = qsa(".post-actions");
    if (!containers.length && PAGE_POST_ID) {
      // fallback: header 直下にある UI を探す（generate 時に埋め込まれているはず）
    }
    containers.forEach((c) => {
      // post-id はボタン個別に持っているが、便利のため container の中のボタンから取得
      const btnLike = c.querySelector(".btn-like");
      const postId =
        (btnLike && btnLike.getAttribute("data-post-id")) ||
        PAGE_POST_ID;
      if (!postId) return;
      initForPost(postId, c);
    });
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
