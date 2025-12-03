/*!
 * mermaid-interactions.js
 * 軽量なパン（ドラッグでスクロール）およびズーム（ピンチ / Ctrl/Cmd + ホイール）ハンドラ
 *
 * 特徴:
 * - .mermaid-wrapper 内でのマウス/タッチによるドラッグでスクロール（パン）
 * - Ctrl (Windows) / Meta (Mac) + ホイールで図の拡縮（SVG を transform: scale で拡縮）
 * - タッチのピンチ操作（2本指）で図を拡縮（pointer events ベース）
 * - mermaid.js が描画した SVG が挿入された後でも動作するように MutationObserver を使用
 *
 * 注意:
 * - 軽量実装を優先しています。複雑な慣性スクロールや複雑な二本指パン等は実装していません。
 * - ブラウザやデバイスのデフォルト挙動（例: ブラウザのピンチでページ全体をズームする等）が想定通り動かない場合、
 *   CSS 側で touch-action の調整が必要です（既に blog.css で touch-action: pan-x pan-y pinch-zoom を付与しています）。
 *
 * 目的: Mermaid 図をより直観的に操作できるようにする（記事内の図に対する限定的なインタラクション）。
 */

(function () {
  "use strict";

  // 設定
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 4;
  const SCALE_STEP = 0.1; // wheel 一回転あたりの倍率係数（調整用）

  // ヘルパー
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function getPointRelativeToElement(pageX, pageY, el) {
    const rect = el.getBoundingClientRect();
    return { x: pageX - rect.left - window.pageXOffset, y: pageY - rect.top - window.pageYOffset };
  }

  // 要素ごとの状態を保持
  function createInteractionFor(wrapper) {
    const content = wrapper.querySelector(".mermaid");
    if (!content) return null;

    let scale = 1;
    let rafId = null;

    // pointer-based pan state
    let isPointerDown = false;
    let lastPointerPos = { x: 0, y: 0 };
    // active pointers for pinch handling (map pointerId -> {x,y})
    const pointers = new Map();
    let initialPinch = null; // {distance, scale, centerClientX, centerClientY}

    // apply transform to content (transform-origin: 0 0 is set in CSS)
    function applyTransform() {
      // Use translate to compensate scroll? We only scale the content. Scrolling is handled by wrapper.
      content.style.transform = `scale(${scale})`;
      rafId = null;
    }

    function scheduleApplyTransform() {
      if (rafId == null) {
        rafId = requestAnimationFrame(applyTransform);
      }
    }

    // Wheel zoom (Ctrl/Cmd + wheel)
    function onWheel(e) {
      // Zoom only when ctrlKey (Windows) or metaKey (Mac) is pressed
      if (!(e.ctrlKey || e.metaKey)) {
        return; // allow normal scroll
      }
      e.preventDefault();

      // compute zoom delta
      const delta = e.deltaY;
      // Chrome/Firefox deltaMode differences are minor; use a normalized factor
      const zoomFactor = Math.exp(-delta * 0.0015); // smooth exponential
      const newScale = clamp(scale * zoomFactor, MIN_SCALE, MAX_SCALE);
      if (newScale === scale) return;

      // Keep the focal point stable: adjust scroll to keep point under cursor at same visual position
      const wrapperRect = wrapper.getBoundingClientRect();
      const cx = e.clientX - wrapperRect.left;
      const cy = e.clientY - wrapperRect.top;

      // Coordinates in content's coordinate system BEFORE scaling
      const contentClientX = (cx + wrapper.scrollLeft) / scale;
      const contentClientY = (cy + wrapper.scrollTop) / scale;

      scale = newScale;
      scheduleApplyTransform();

      // After scaling, compute new scroll so that the same content point is under (cx, cy)
      const newScrollLeft = contentClientX * scale - cx;
      const newScrollTop = contentClientY * scale - cy;
      wrapper.scrollLeft = newScrollLeft;
      wrapper.scrollTop = newScrollTop;
    }

    // Pointer events: support single-finger drag to scroll and two-finger pinch to zoom
    function onPointerDown(e) {
      // Only react to primary button for mouse (button === 0) or any touch
      if (e.pointerType === "mouse" && e.button !== 0) return;

      wrapper.setPointerCapture && wrapper.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // if we now have two pointers, initialize pinch
      if (pointers.size === 2) {
        const coords = Array.from(pointers.values());
        const dx = coords[0].x - coords[1].x;
        const dy = coords[0].y - coords[1].y;
        const distance = Math.hypot(dx, dy);
        const centerX = (coords[0].x + coords[1].x) / 2;
        const centerY = (coords[0].y + coords[1].y) / 2;
        initialPinch = {
          distance,
          scale,
          centerX,
          centerY,
          // store content coords under center
          contentClientX: (centerX - wrapper.getBoundingClientRect().left + wrapper.scrollLeft) / scale,
          contentClientY: (centerY - wrapper.getBoundingClientRect().top + wrapper.scrollTop) / scale,
        };
      } else {
        // single pointer -> start panning
        isPointerDown = true;
        lastPointerPos = { x: e.clientX, y: e.clientY };
      }
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);

      if (pointers.size === 2 && initialPinch) {
        // pinch zoom
        const coords = Array.from(pointers.values());
        const dx = coords[0].x - coords[1].x;
        const dy = coords[0].y - coords[1].y;
        const distance = Math.hypot(dx, dy);
        const scaleFactor = distance / initialPinch.distance;
        let newScale = clamp(initialPinch.scale * scaleFactor, MIN_SCALE, MAX_SCALE);
        if (newScale === scale) return;

        // Compute center point (use average of two pointers)
        const centerX = (coords[0].x + coords[1].x) / 2;
        const centerY = (coords[0].y + coords[1].y) / 2;

        // Maintain focal point: contentClient coords from initialPinch
        scale = newScale;
        scheduleApplyTransform();

        // Adjust scroll so that the content point remains under the center
        const cx = centerX - wrapper.getBoundingClientRect().left;
        const cy = centerY - wrapper.getBoundingClientRect().top;
        const newScrollLeft = initialPinch.contentClientX * scale - cx;
        const newScrollTop = initialPinch.contentClientY * scale - cy;
        wrapper.scrollLeft = newScrollLeft;
        wrapper.scrollTop = newScrollTop;
      } else if (isPointerDown && pointers.size === 1) {
        // drag to scroll (pan)
        const dx = cur.x - lastPointerPos.x;
        const dy = cur.y - lastPointerPos.y;
        // Invert movement: dragging right should scroll left, so subtract dx
        wrapper.scrollLeft -= dx;
        wrapper.scrollTop -= dy;
        lastPointerPos = cur;
      }
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      wrapper.releasePointerCapture && wrapper.releasePointerCapture(e.pointerId);

      if (pointers.size < 2) {
        initialPinch = null;
      }
      if (pointers.size === 0) {
        isPointerDown = false;
      }
    }

    // Mouse fallback: allow click-drag to scroll (also handled by pointer events in supporting browsers)
    // But keep mouse-specific handlers as progressive enhancement (in case pointer events absent)
    let mouseDown = false;
    let lastMousePos = { x: 0, y: 0 };
    function onMouseDown(e) {
      if (e.button !== 0) return;
      mouseDown = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      wrapper.classList.add("is-dragging");
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!mouseDown) return;
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      wrapper.scrollLeft -= dx;
      wrapper.scrollTop -= dy;
      lastMousePos = { x: e.clientX, y: e.clientY };
    }
    function onMouseUp() {
      mouseDown = false;
      wrapper.classList.remove("is-dragging");
    }

    // Double-click or double-tap to reset scale (optional UX)
    function onDoubleClick(e) {
      // reset to 1 and center on clicked point
      const rect = wrapper.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const contentClientX = (cx + wrapper.scrollLeft) / scale;
      const contentClientY = (cy + wrapper.scrollTop) / scale;

      scale = 1;
      scheduleApplyTransform();
      wrapper.scrollLeft = contentClientX * scale - cx;
      wrapper.scrollTop = contentClientY * scale - cy;
    }

    // Setup events (pointer events preferred)
    if (window.PointerEvent) {
      wrapper.addEventListener("pointerdown", onPointerDown, { passive: false });
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp, { passive: false });
      window.addEventListener("pointercancel", onPointerUp, { passive: false });
    } else {
      // fallback for old browsers: mouse/touch
      wrapper.addEventListener("mousedown", onMouseDown, { passive: false });
      window.addEventListener("mousemove", onMouseMove, { passive: false });
      window.addEventListener("mouseup", onMouseUp, { passive: false });
      // touch -> map to mouse-like dragging
      wrapper.addEventListener("touchstart", function (ev) {
        if (ev.touches.length === 1) {
          const t = ev.touches[0];
          mouseDown = true;
          lastMousePos = { x: t.clientX, y: t.clientY };
        }
      }, { passive: false });
      wrapper.addEventListener("touchmove", function (ev) {
        if (mouseDown && ev.touches.length === 1) {
          const t = ev.touches[0];
          const dx = t.clientX - lastMousePos.x;
          const dy = t.clientY - lastMousePos.y;
          wrapper.scrollLeft -= dx;
          wrapper.scrollTop -= dy;
          lastMousePos = { x: t.clientX, y: t.clientY };
          ev.preventDefault();
        }
      }, { passive: false });
      wrapper.addEventListener("touchend", function () {
        mouseDown = false;
      }, { passive: false });
    }

    // Wheel zoom handler
    wrapper.addEventListener("wheel", onWheel, { passive: false });

    // Double-click to reset
    wrapper.addEventListener("dblclick", onDoubleClick);

    // Observe content replacement (mermaid may re-render). If content element changes, reset refs.
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          // If the mermaid content was replaced, update reference and reset transform style
          const newContent = wrapper.querySelector(".mermaid");
          if (newContent && newContent !== content) {
            // apply current scale to new content and continue (note: we don't reconstruct all handlers)
            // This implementation assumes wrapper remains the same and event handlers are on wrapper/window.
            // Replace content variable's style by copying transform to new element.
            try {
              // copy computed transform origin etc.
              newContent.style.transform = `scale(${scale})`;
              newContent.style.transformOrigin = "0 0";
            } catch (e) {
              // ignore
            }
          }
        }
      }
    });
    mo.observe(wrapper, { childList: true, subtree: false });

    // initial apply
    applyTransform();

    // return cleanup if needed
    return function cleanup() {
      try {
        if (window.PointerEvent) {
          wrapper.removeEventListener("pointerdown", onPointerDown);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerUp);
        } else {
          wrapper.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        }
        wrapper.removeEventListener("wheel", onWheel);
        wrapper.removeEventListener("dblclick", onDoubleClick);
        mo.disconnect();
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }

  // 初期化: DOMContentLoaded 後に .mermaid-wrapper を検出して適用
  function initAll() {
    const wrappers = Array.from(document.querySelectorAll(".mermaid-wrapper"));
    if (!wrappers.length) return;

    // store cleanup fns in case needed
    const cleanups = [];
    wrappers.forEach((w) => {
      const c = createInteractionFor(w);
      if (typeof c === "function") cleanups.push(c);
    });

    // 戻り値は使わないが、将来的に外部から破棄できるように window に保持してもよい
    window.__mermaidInteractionsCleanup = function () {
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
