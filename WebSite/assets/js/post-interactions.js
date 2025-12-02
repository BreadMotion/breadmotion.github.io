(function () {
  "use strict";

  // Lightweight debug flag: set to true to get verbose logs
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.debug("[PI]", ...args);
  }
  function err(...args) {
    console.error("[PI]", ...args);
  }

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
      if (raw === null) return defaultValue;
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
      /* ignore */
    }
  }

  const CONFIG = window.__POST_INTERACTIONS_CONFIG || {};
  const API_BASE = (CONFIG.apiUrl || "").replace(
    /\/+$/,
    "",
  ); // no trailing slash
  const PAGE_POST_ID =
    CONFIG.postId ||
    document.body.getAttribute("data-post-id") ||
    "";

  function likeCountKey(postId) {
    return `post_like_count_${postId}`;
  }
  function likeUserKey(postId) {
    return `post_liked_by_user_${postId}`;
  }
  const bookmarkKey = "post_bookmarks_v1";

  function setLikeButtonState(btn, liked, count) {
    if (!btn) return;
    btn.setAttribute(
      "aria-pressed",
      liked ? "true" : "false",
    );
    const countEl = btn.querySelector(".like-count");
    if (countEl)
      countEl.textContent = String(
        Number.isFinite(count) ? count : 0,
      );
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

  // JSONP helper: inject script tag and call callback
  function jsonpCall(url, timeout = 8000) {
    return new Promise((resolve, reject) => {
      try {
        const callbackName = `__pi_jsonp_cb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        let timer = null;
        function cleanup() {
          if (timer) clearTimeout(timer);
          const s = document.getElementById(callbackName);
          if (s && s.parentNode)
            s.parentNode.removeChild(s);
          try {
            delete window[callbackName];
          } catch (e) {
            window[callbackName] = undefined;
          }
        }
        window[callbackName] = function (data) {
          cleanup();
          resolve(data);
        };
        timer = setTimeout(() => {
          cleanup();
          reject(new Error("JSONP timeout"));
        }, timeout);

        const src =
          (url.indexOf("?") === -1
            ? url + "?"
            : url + "&") +
          "callback=" +
          encodeURIComponent(callbackName);
        const script = document.createElement("script");
        script.src = src;
        script.id = callbackName;
        script.async = true;
        script.onerror = function () {
          cleanup();
          reject(new Error("JSONP script error"));
        };
        document.head.appendChild(script);
        log("JSONP injected", src);
      } catch (e) {
        reject(e);
      }
    });
  }

  // Fetch like count (JSONP)
  async function fetchLikeCountFromApi(postId) {
    if (!API_BASE) {
      log("No API_BASE defined");
      return null;
    }
    const url = `${API_BASE}?action=get&postId=${encodeURIComponent(postId)}`;
    try {
      const json = await jsonpCall(url);
      log("fetchLikeCountFromApi response", json);
      if (!json) return null;
      // Accept both { likes: N } or { ok:true, likes:N }
      const likesRaw =
        typeof json.likes !== "undefined"
          ? json.likes
          : json && json.result && json.result.likes
            ? json.result.likes
            : undefined;
      const likesNum = Number(likesRaw);
      if (
        !Number.isFinite(likesNum) ||
        Number.isNaN(likesNum)
      ) {
        log(
          "likes not numeric or missing in response",
          likesRaw,
        );
        return null;
      }
      return likesNum;
    } catch (e) {
      err("fetchLikeCountFromApi failed", e);
      return null;
    }
  }

  // Send like/unlike and prefer returned count; fallback to GET if response missing
  async function sendLikeToggleToApi(postId, action) {
    if (!API_BASE) {
      log("No API_BASE defined for send");
      return null;
    }
    const url = `${API_BASE}?action=${encodeURIComponent(action)}&postId=${encodeURIComponent(postId)}`;
    try {
      const json = await jsonpCall(url);
      log("sendLikeToggleToApi response", action, json);
      if (!json) throw new Error("empty response");
      const likesRaw =
        typeof json.likes !== "undefined"
          ? json.likes
          : json && json.result && json.result.likes
            ? json.result.likes
            : undefined;
      const likesNum = Number(likesRaw);
      if (Number.isFinite(likesNum)) {
        return likesNum;
      }
      // fallback: do a GET to reconcile
      const reconciled =
        await fetchLikeCountFromApi(postId);
      return reconciled;
    } catch (e) {
      err("sendLikeToggleToApi failed", e);
      // fallback: try GET
      try {
        const reconciled =
          await fetchLikeCountFromApi(postId);
        return reconciled;
      } catch (e2) {
        err("fallback GET also failed", e2);
        return null;
      }
    }
  }

  // Initialize UI and behavior for a single post container
  function initForPost(postId, container) {
    const likeBtn = container.querySelector(".btn-like");
    const bookmarkBtn =
      container.querySelector(".btn-bookmark");

    // 1) seed from localStorage if exists (may be null)
    let count = readLocal(likeCountKey(postId), null);
    const userLiked = !!readLocal(
      likeUserKey(postId),
      false,
    );
    const bookmarks = readLocal(bookmarkKey, []);
    const bookmarked = bookmarks.indexOf(postId) !== -1;

    // show initial (local) state quickly
    setLikeButtonState(
      likeBtn,
      userLiked,
      typeof count === "number" ? count : 0,
    );
    setBookmarkButtonState(bookmarkBtn, bookmarked);

    // 2) attempt to fetch authoritative count and update UI/localStorage
    if (API_BASE) {
      fetchLikeCountFromApi(postId)
        .then((apiCount) => {
          if (typeof apiCount === "number") {
            log("Applying apiCount", apiCount);
            count = apiCount;
            writeLocal(likeCountKey(postId), count);
            setLikeButtonState(likeBtn, userLiked, count);
          } else {
            log("apiCount null or invalid", apiCount);
          }
        })
        .catch((e) => {
          err("Error fetching count on init", e);
        });
    }

    // 3) like button behavior
    if (likeBtn) {
      likeBtn.addEventListener("click", async function () {
        const currentlyLiked = !!readLocal(
          likeUserKey(postId),
          false,
        );
        const newLiked = !currentlyLiked;
        let countVal = readLocal(likeCountKey(postId), 0);
        if (typeof countVal !== "number")
          countVal = Number(countVal) || 0;

        // optimistic update
        if (newLiked) countVal = countVal + 1;
        else countVal = Math.max(0, countVal - 1);
        setLikeButtonState(likeBtn, newLiked, countVal);
        writeLocal(likeUserKey(postId), newLiked);
        writeLocal(likeCountKey(postId), countVal);

        // send to server; prefer server returned count, otherwise reconcile via GET
        const apiResult = await sendLikeToggleToApi(
          postId,
          newLiked ? "like" : "unlike",
        );
        if (typeof apiResult === "number") {
          writeLocal(likeCountKey(postId), apiResult);
          setLikeButtonState(likeBtn, newLiked, apiResult);
          log("server count applied", apiResult);
        } else {
          log(
            "server did not return count; retaining optimistic count",
            countVal,
          );
        }
      });
    }

    // 4) bookmark button behavior (local only)
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
        log("bookmark toggled", postId, newBookmarked);
      });
    }
  }

  function initAll() {
    const containers = qsa(".post-actions");
    if (!containers.length)
      log("No .post-actions containers found on page");
    containers.forEach((c) => {
      const btnLike = c.querySelector(".btn-like");
      const postId =
        (btnLike && btnLike.getAttribute("data-post-id")) ||
        PAGE_POST_ID;
      if (!postId) {
        err("Missing postId for container", c);
        return;
      }
      initForPost(postId, c);
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initAll);
  else initAll();
})();
