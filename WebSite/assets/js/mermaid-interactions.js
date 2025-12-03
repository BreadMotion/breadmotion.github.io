/*!
 * mermaid-interactions.js
 * Improved pan / pinch / zoom interactions for mermaid diagrams
 *
 * Key fixes requested:
 *  - Use committedScale * transientScale when computing transforms and displayed scale
 *  - Set transformOrigin relative to the content (so zoom animates toward pointer)
 *  - Ensure toolbar receives pointer events and wrapper handlers ignore toolbar-originated events
 *
 * Behavior:
 *  - Mouse drag pans the wrapper (scroll)
 *  - Ctrl/Cmd + wheel zooms toward mouse pointer (animated)
 *  - Two-finger pinch zooms toward the pinch center
 *  - Toolbar (right-top) provides + / % badge / - / reset controls
 *  - When threshold crossed, the SVG size is committed (width/height set) then transient transform reset,
 *    which results in a crisper rendering at new scale.
 *
 * Notes:
 *  - This file is intentionally defensive and avoids relying on external libraries.
 *  - It attempts to avoid layout thrash by batching DOM updates in requestAnimationFrame.
 */

(function () {
  "use strict";

  // Config
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 4;
  const COMMIT_UPPER = 1.2; // commit when total scale >= this
  const COMMIT_LOWER = 0.8; // commit when total scale <= this
  const TRANSITION =
    "transform 220ms cubic-bezier(0.2,0.8,0.2,1)";

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Initialize interactions for one wrapper element
  function initWrapper(wrapper) {
    // wrapper must have .mermaid element inside (the element mermaid used as container)
    const content = wrapper.querySelector(".mermaid");
    if (!content) return null;

    // Ensure wrapper positioning so toolbar absolute positioning works
    const wrapperStyle = window.getComputedStyle(wrapper);
    if (wrapperStyle.position === "static") {
      wrapper.style.position = "relative";
    }

    // State
    // committedScale: scale that has already been baked into SVG width/height (via commit)
    // transientScale: temporary transform applied while interacting (animated)
    let committedScale = 1;
    let transientScale = 1;

    // RAF handle for transform updates
    let rafId = null;
    function applyTransform() {
      // totalScale is what user sees
      const total = committedScale * transientScale;
      // apply total scale via CSS transform
      content.style.transform = `scale(${total})`;
      // update badge if present
      updateScaleBadge(total);
      rafId = null;
    }
    function scheduleApplyTransform() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(applyTransform);
    }

    // Toolbar: + badge - reset
    const toolbar = document.createElement("div");
    toolbar.className = "mermaid-toolbar";
    // Inline minimal accessible structure; CSS will style
    const btnIn = document.createElement("button");
    btnIn.type = "button";
    btnIn.className = "mermaid-btn mermaid-zoom-in";
    btnIn.setAttribute("aria-label", "拡大");
    btnIn.textContent = "+";

    const badge = document.createElement("div");
    badge.className = "mermaid-scale-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "100%";

    const btnOut = document.createElement("button");
    btnOut.type = "button";
    btnOut.className = "mermaid-btn mermaid-zoom-out";
    btnOut.setAttribute("aria-label", "縮小");
    btnOut.textContent = "−";

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "mermaid-btn mermaid-reset";
    btnReset.setAttribute("aria-label", "リセット");
    btnReset.textContent = "⟲";

    // Insert toolbar as last child so it overlays content; keep pointer events enabled
    toolbar.appendChild(btnIn);
    toolbar.appendChild(badge);
    toolbar.appendChild(btnOut);
    toolbar.appendChild(btnReset);
    toolbar.style.position = "absolute";
    toolbar.style.top = "8px";
    toolbar.style.right = "8px";
    toolbar.style.pointerEvents = "auto";
    toolbar.style.zIndex = "9999";
    // minimal inline styles to avoid CSS race; final styles controlled by CSS file
    wrapper.appendChild(toolbar);

    function updateScaleBadge(total) {
      if (!badge) return;
      const pct = Math.round(
        (typeof total === "number"
          ? total
          : committedScale * transientScale) * 100,
      );
      badge.textContent = pct + "%";
    }

    // Commit resolution: bake total scale into SVG pixel width/height for crisper result
    function commitIfNeeded(focusClient) {
      try {
        const svg = content.querySelector("svg");
        if (!svg) return;

        const totalScale = committedScale * transientScale;
        // Only commit if total crosses thresholds (relative to 1.0)
        if (
          !(
            totalScale >= COMMIT_UPPER ||
            totalScale <= COMMIT_LOWER
          )
        )
          return;

        // Get logical bbox (try getBBox, then viewBox, fallback to boundingClientRect)
        let bbox;
        try {
          bbox = svg.getBBox();
        } catch (e) {
          if (
            svg.viewBox &&
            svg.viewBox.baseVal &&
            svg.viewBox.baseVal.width
          ) {
            bbox = {
              width: svg.viewBox.baseVal.width,
              height: svg.viewBox.baseVal.height,
            };
          } else {
            const r = svg.getBoundingClientRect();
            bbox = {
              width: r.width || 1,
              height: r.height || 1,
            };
          }
        }

        // Compute new pixel size for SVG to match visual size
        const newW = Math.max(1, bbox.width * totalScale);
        const newH = Math.max(1, bbox.height * totalScale);

        // Decide focal point to keep stable (prefer provided focusClient, otherwise center)
        const wrapperRect = wrapper.getBoundingClientRect();
        const focal = focusClient || {
          clientX: wrapperRect.left + wrapperRect.width / 2,
          clientY: wrapperRect.top + wrapperRect.height / 2,
        };
        // compute content coordinates (in SVG user units) before commit
        const contentRect = content.getBoundingClientRect();
        const localX =
          focal.clientX -
          contentRect.left +
          wrapper.scrollLeft;
        const localY =
          focal.clientY -
          contentRect.top +
          wrapper.scrollTop;
        // convert to SVG user coordinates (divide by totalScale)
        const svgUserX = localX / totalScale;
        const svgUserY = localY / totalScale;

        // Temporarily disable CSS transition to set explicit pixel size
        const prevTrans = content.style.transition;
        content.style.transition = "none";

        // Apply explicit pixel sizes to SVG (forces browser to raster/render at that size)
        svg.style.width = `${Math.round(newW)}px`;
        svg.style.height = `${Math.round(newH)}px`;

        // Update committedScale and reset transientScale
        committedScale = totalScale;
        transientScale = 1;
        // Apply transform (committedScale * 1)
        content.style.transform = `scale(${committedScale})`;

        // Recalculate scroll to keep the same svgUserX/svgUserY under the focal point:
        // new scrollLeft = svgUserX * committedScale - (focal.clientX - wrapperRect.left)
        const newScrollLeft = Math.max(
          0,
          svgUserX * committedScale -
            (focal.clientX - wrapperRect.left),
        );
        const newScrollTop = Math.max(
          0,
          svgUserY * committedScale -
            (focal.clientY - wrapperRect.top),
        );

        // Apply scroll adjustments in next RAF for smoother layout
        requestAnimationFrame(() => {
          try {
            wrapper.scrollLeft = Math.max(
              0,
              Math.min(
                newScrollLeft,
                wrapper.scrollWidth - wrapper.clientWidth,
              ),
            );
            wrapper.scrollTop = Math.max(
              0,
              Math.min(
                newScrollTop,
                wrapper.scrollHeight - wrapper.clientHeight,
              ),
            );
          } finally {
            // restore CSS transition
            content.style.transition =
              prevTrans || TRANSITION;
            updateScaleBadge(committedScale);
          }
        });
      } catch (e) {
        // don't let commit failures break interaction
        console.warn("mermaid commit failed:", e);
      }
    }

    // --- Input handlers: wheel, pointer/pinch, mouse drag ---
    // Utility: ignore events originating from toolbar (so toolbar clickable)
    function eventFromToolbar(ev) {
      return (
        ev.target &&
        ev.target.closest &&
        ev.target.closest(".mermaid-toolbar")
      );
    }

    // Wheel zoom with ctrl/cmd
    function onWheel(ev) {
      if (eventFromToolbar(ev)) return; // ignore wheel if on toolbar
      if (!(ev.ctrlKey || ev.metaKey)) return; // normal scroll otherwise
      ev.preventDefault();

      // compute zoom factor
      const delta = ev.deltaY;
      const zoomFactor = Math.exp(-delta * 0.0015);
      const newTransient = clamp(
        transientScale * zoomFactor,
        MIN_SCALE / committedScale,
        MAX_SCALE / committedScale,
      );
      if (Math.abs(newTransient - transientScale) < 1e-6)
        return;

      // set transform origin relative to content so zoom animates toward pointer
      const contentRect = content.getBoundingClientRect();
      const originX = ev.clientX - contentRect.left;
      const originY = ev.clientY - contentRect.top;
      content.style.transformOrigin = `${originX}px ${originY}px`;

      // compute svg user coords for scroll preservation
      const wrapperRect = wrapper.getBoundingClientRect();
      const cx = ev.clientX - wrapperRect.left;
      const cy = ev.clientY - wrapperRect.top;
      const contentClientX = cx + wrapper.scrollLeft;
      const contentClientY = cy + wrapper.scrollTop;

      // update transientScale and apply transform
      transientScale = newTransient;
      scheduleApplyTransform();

      // compute new scroll to keep focal point stable (operation in RAF)
      requestAnimationFrame(() => {
        const total = committedScale * transientScale;
        const newScrollLeft =
          (contentClientX / committedScale) * total - cx;
        const newScrollTop =
          (contentClientY / committedScale) * total - cy;
        wrapper.scrollLeft = newScrollLeft;
        wrapper.scrollTop = newScrollTop;
      });
    }

    // Pointer events: support pinch (two pointers) and pan (one pointer)
    let pointerDown = false;
    let lastPointer = { x: 0, y: 0 };

    function onPointerDown(ev) {
      if (eventFromToolbar(ev)) return; // toolbar interactions should not start pan/pinch
      if (ev.pointerType === "mouse" && ev.button !== 0)
        return;
      wrapper.setPointerCapture &&
        wrapper.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, {
        x: ev.clientX,
        y: ev.clientY,
      });

      if (pointers.size === 2) {
        // init pinch
        const coords = Array.from(pointers.values());
        const dx = coords[0].x - coords[1].x;
        const dy = coords[0].y - coords[1].y;
        const d = Math.hypot(dx, dy);
        const centerX = (coords[0].x + coords[1].x) / 2;
        const centerY = (coords[0].y + coords[1].y) / 2;
        initialPinch = {
          distance: d,
          centerX,
          centerY,
          startTransient: transientScale,
        };
      } else {
        pointerDown = true;
        lastPointer = { x: ev.clientX, y: ev.clientY };
      }
    }

    function onPointerMove(ev) {
      if (!pointers.has(ev.pointerId)) {
        // if pointer hasn't been registered (rare), still track for pan fallback
        if (!pointerDown) return;
      }
      if (eventFromToolbar(ev)) return;

      pointers.set(ev.pointerId, {
        x: ev.clientX,
        y: ev.clientY,
      });

      if (pointers.size === 2 && initialPinch) {
        const coords = Array.from(pointers.values());
        const dx = coords[0].x - coords[1].x;
        const dy = coords[0].y - coords[1].y;
        const d = Math.hypot(dx, dy);
        const factor = d / initialPinch.distance;
        const newTransient = clamp(
          initialPinch.startTransient * factor,
          MIN_SCALE / committedScale,
          MAX_SCALE / committedScale,
        );
        if (Math.abs(newTransient - transientScale) < 1e-6)
          return;

        // set transform origin to pinch center relative to content
        const centerX = (coords[0].x + coords[1].x) / 2;
        const centerY = (coords[0].y + coords[1].y) / 2;
        const crect = content.getBoundingClientRect();
        const orgX = centerX - crect.left;
        const orgY = centerY - crect.top;
        content.style.transformOrigin = `${orgX}px ${orgY}px`;

        transientScale = newTransient;
        scheduleApplyTransform();

        // adjust scroll to keep center stable
        const wrapperRect = wrapper.getBoundingClientRect();
        const localCx = centerX - wrapperRect.left;
        const localCy = centerY - wrapperRect.top;
        requestAnimationFrame(() => {
          const total = committedScale * transientScale;
          const newScrollLeft =
            ((orgX + wrapper.scrollLeft) / committedScale) *
              total -
            localCx;
          const newScrollTop =
            ((orgY + wrapper.scrollTop) / committedScale) *
              total -
            localCy;
          wrapper.scrollLeft = newScrollLeft;
          wrapper.scrollTop = newScrollTop;
        });
      } else if (pointerDown && pointers.size <= 1) {
        const dx = ev.clientX - lastPointer.x;
        const dy = ev.clientY - lastPointer.y;
        wrapper.scrollLeft -= dx;
        wrapper.scrollTop -= dy;
        lastPointer = { x: ev.clientX, y: ev.clientY };
      }
    }

    function onPointerUp(ev) {
      wrapper.releasePointerCapture &&
        wrapper.releasePointerCapture(ev.pointerId);
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) initialPinch = null;
      if (pointers.size === 0) pointerDown = false;

      // After pointers lifted, schedule commit check (delay slightly to allow transition)
      setTimeout(() => {
        commitIfNeeded({
          clientX: ev.clientX,
          clientY: ev.clientY,
        });
      }, 80);
    }

    // Mouse fallback for dragging
    let mouseDragging = false;
    function onMouseDown(ev) {
      if (eventFromToolbar(ev)) return;
      if (ev.button !== 0) return;
      mouseDragging = true;
      lastPointer = { x: ev.clientX, y: ev.clientY };
      ev.preventDefault();
    }
    function onMouseMove(ev) {
      if (!mouseDragging) return;
      const dx = ev.clientX - lastPointer.x;
      const dy = ev.clientY - lastPointer.y;
      wrapper.scrollLeft -= dx;
      wrapper.scrollTop -= dy;
      lastPointer = { x: ev.clientX, y: ev.clientY };
    }
    function onMouseUp(ev) {
      mouseDragging = false;
      setTimeout(
        () =>
          commitIfNeeded({
            clientX: ev.clientX,
            clientY: ev.clientY,
          }),
        80,
      );
    }

    // Double click resets to natural size
    function onDoubleClick(ev) {
      if (eventFromToolbar(ev)) return;
      committedScale = 1;
      transientScale = 1;
      scheduleApplyTransform();
      const svg = content.querySelector("svg");
      if (svg) {
        svg.style.width = "";
        svg.style.height = "";
      }
      updateScaleBadge();
    }

    // Attach handlers
    wrapper.addEventListener("wheel", onWheel, {
      passive: false,
    });
    if (window.PointerEvent) {
      wrapper.addEventListener(
        "pointerdown",
        onPointerDown,
        { passive: false },
      );
      window.addEventListener(
        "pointermove",
        onPointerMove,
        { passive: false },
      );
      window.addEventListener("pointerup", onPointerUp, {
        passive: false,
      });
      window.addEventListener(
        "pointercancel",
        onPointerUp,
        { passive: false },
      );
    } else {
      wrapper.addEventListener("mousedown", onMouseDown, {
        passive: false,
      });
      window.addEventListener("mousemove", onMouseMove, {
        passive: false,
      });
      window.addEventListener("mouseup", onMouseUp, {
        passive: false,
      });
      // basic touch support
      wrapper.addEventListener(
        "touchstart",
        function (ev) {
          if (ev.touches.length === 1) {
            mouseDragging = true;
            lastPointer = {
              x: ev.touches[0].clientX,
              y: ev.touches[0].clientY,
            };
          }
        },
        { passive: false },
      );
      wrapper.addEventListener(
        "touchmove",
        function (ev) {
          if (mouseDragging && ev.touches.length === 1) {
            const t = ev.touches[0];
            const dx = t.clientX - lastPointer.x;
            const dy = t.clientY - lastPointer.y;
            wrapper.scrollLeft -= dx;
            wrapper.scrollTop -= dy;
            lastPointer = { x: t.clientX, y: t.clientY };
            ev.preventDefault();
          }
        },
        { passive: false },
      );
      wrapper.addEventListener(
        "touchend",
        function (ev) {
          mouseDragging = false;
          commitIfNeeded({
            clientX:
              ev.changedTouches && ev.changedTouches[0]
                ? ev.changedTouches[0].clientX
                : wrapper.getBoundingClientRect().left +
                  wrapper.clientWidth / 2,
            clientY:
              ev.changedTouches && ev.changedTouches[0]
                ? ev.changedTouches[0].clientY
                : wrapper.getBoundingClientRect().top +
                  wrapper.clientHeight / 2,
          });
        },
        { passive: false },
      );
    }

    wrapper.addEventListener("dblclick", onDoubleClick);

    // Transitionend: commit if thresholds crossed (ensure using total committed*transient)
    content.addEventListener(
      "transitionend",
      function (ev) {
        if (
          ev.propertyName &&
          ev.propertyName.indexOf("transform") !== -1
        ) {
          // small delay then commit
          setTimeout(() => commitIfNeeded(), 40);
        }
      },
    );

    // Toolbar button handlers (use pointerdown + click to be robust)
    function zoomInHandler(ev) {
      ev.stopPropagation();
      ev.preventDefault();
      // zoom toward event point if available, otherwise center
      const focus =
        ev && ev.clientX
          ? { clientX: ev.clientX, clientY: ev.clientY }
          : null;
      transientScale = clamp(
        transientScale * 1.2,
        MIN_SCALE / committedScale,
        MAX_SCALE / committedScale,
      );
      // set origin relative to content center or pointer
      if (focus) {
        const crect = content.getBoundingClientRect();
        content.style.transformOrigin = `${focus.clientX - crect.left}px ${focus.clientY - crect.top}px`;
      }
      scheduleApplyTransform();
      // adjust scroll after transform
      requestAnimationFrame(() => commitIfNeeded(focus));
    }
    function zoomOutHandler(ev) {
      ev.stopPropagation();
      ev.preventDefault();
      const focus =
        ev && ev.clientX
          ? { clientX: ev.clientX, clientY: ev.clientY }
          : null;
      transientScale = clamp(
        transientScale / 1.2,
        MIN_SCALE / committedScale,
        MAX_SCALE / committedScale,
      );
      if (focus) {
        const crect = content.getBoundingClientRect();
        content.style.transformOrigin = `${focus.clientX - crect.left}px ${focus.clientY - crect.top}px`;
      }
      scheduleApplyTransform();
      requestAnimationFrame(() => commitIfNeeded(focus));
    }
    function resetHandler(ev) {
      ev.stopPropagation();
      ev.preventDefault();
      committedScale = 1;
      transientScale = 1;
      scheduleApplyTransform();
      const svg = content.querySelector("svg");
      if (svg) {
        svg.style.width = "";
        svg.style.height = "";
      }
      updateScaleBadge();
    }

    // support pointerdown (for touch), and click (fallback)
    btnIn.addEventListener("pointerdown", zoomInHandler);
    btnOut.addEventListener("pointerdown", zoomOutHandler);
    btnReset.addEventListener("pointerdown", resetHandler);
    btnIn.addEventListener("click", zoomInHandler);
    btnOut.addEventListener("click", zoomOutHandler);
    btnReset.addEventListener("click", resetHandler);

    // Initial style and render
    content.style.transition =
      content.style.transition || TRANSITION;
    content.style.transformOrigin =
      content.style.transformOrigin || "0 0";
    scheduleApplyTransform();

    // return cleanup
    return function cleanup() {
      try {
        wrapper.removeEventListener("wheel", onWheel);
        wrapper.removeEventListener(
          "pointerdown",
          onPointerDown,
        );
        window.removeEventListener(
          "pointermove",
          onPointerMove,
        );
        window.removeEventListener(
          "pointerup",
          onPointerUp,
        );
        wrapper.removeEventListener(
          "mousedown",
          onMouseDown,
        );
        window.removeEventListener(
          "mousemove",
          onMouseMove,
        );
        window.removeEventListener("mouseup", onMouseUp);
        wrapper.removeEventListener("touchstart", () => {});
        wrapper.removeEventListener("touchmove", () => {});
        wrapper.removeEventListener("touchend", () => {});
        wrapper.removeEventListener(
          "dblclick",
          onDoubleClick,
        );
        content.removeEventListener(
          "transitionend",
          commitIfNeeded,
        );
        try {
          wrapper.removeChild(toolbar);
        } catch (e) {}
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }

  // Initialize all wrappers on DOMContentLoaded
  function initAll() {
    const wrappers = Array.from(
      document.querySelectorAll(".mermaid-wrapper"),
    );
    wrappers.forEach((w) => initWrapper(w));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
