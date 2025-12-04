/*!
 * mermaid-interactions.js
 * Improved pan / pinch / zoom interactions for mermaid diagrams
 *
 * Implements a Google Maps-style pan/zoom interaction using CSS Transforms.
 * - Pan: Drag with mouse or touch
 * - Zoom: Mouse wheel or pinch gesture
 * - Toolbar: Zoom In/Out/Reset
 */

(function () {
  "use strict";

  // Config
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 4.0;
  const ZOOM_SENSITIVITY = 0.001;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function initWrapper(wrapper) {
    const content = wrapper.querySelector(".mermaid");
    if (!content) return null;

    // Ensure SVG scales with the container
    const svg = content.querySelector("svg");
    if (svg) {
      svg.style.width = "100%";
      svg.style.height = "auto";
      svg.style.maxWidth = "none";
    }

    // State
    let state = {
      x: 0,
      y: 0,
      scale: 1,
    };

    // Setup initial styles
    content.style.transformOrigin = "0 0";

    // IMPORTANT: Explicitly disable will-change to prevent browser from rasterizing the SVG.
    // Even if we remove the property setting in JS, the CSS rule in blog.css might still apply it.
    // Setting it to 'auto' overrides the CSS and forces vector re-rendering on zoom.
    content.style.willChange = "auto";
    content.style.transition = "transform 0.1s ease-out"; // Smooth transition for small updates

    // Disable native scroll to keep toolbar fixed and enable wheel panning
    wrapper.style.overflow = "hidden";

    // RAF loop
    let rafId = null;
    function updateTransform() {
      content.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      updateScaleBadge(state.scale);
      rafId = null;
    }

    function scheduleUpdate() {
      if (!rafId) {
        rafId = requestAnimationFrame(updateTransform);
      }
    }

    // --- Toolbar ---
    const toolbar = document.createElement("div");
    toolbar.className = "mermaid-toolbar";

    const btnIn = document.createElement("button");
    btnIn.type = "button";
    btnIn.className = "btn mermaid-zoom-in";
    btnIn.textContent = "+";
    btnIn.setAttribute("aria-label", "拡大");

    const badge = document.createElement("div");
    badge.className = "scale-badge";
    badge.textContent = "100%";

    const btnOut = document.createElement("button");
    btnOut.type = "button";
    btnOut.className = "btn mermaid-zoom-out";
    btnOut.textContent = "−";
    btnOut.setAttribute("aria-label", "縮小");

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "btn mermaid-reset";
    btnReset.textContent = "⟲";
    btnReset.setAttribute("aria-label", "リセット");

    toolbar.appendChild(btnIn);
    toolbar.appendChild(badge);
    toolbar.appendChild(btnOut);
    toolbar.appendChild(btnReset);
    wrapper.appendChild(toolbar);

    function updateScaleBadge(s) {
      badge.textContent = Math.round(s * 100) + "%";
    }

    // --- Interaction Logic ---
    // Helper: Get point relative to wrapper
    function getPoint(clientX, clientY) {
      const rect = wrapper.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }

    // Zoom Logic
    function zoomTo(newScale, centerPoint) {
      const targetScale = clamp(
        newScale,
        MIN_SCALE,
        MAX_SCALE,
      );
      const ratio = targetScale / state.scale;
      const localX =
        (centerPoint.x - state.x) / state.scale;
      const localY =
        (centerPoint.y - state.y) / state.scale;

      state.x = centerPoint.x - localX * targetScale;
      state.y = centerPoint.y - localY * targetScale;
      state.scale = targetScale;

      scheduleUpdate();
    }

    // Wheel Zoom & Pan
    wrapper.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
          // Zoom
          const delta = -e.deltaY;
          const factor = Math.exp(delta * ZOOM_SENSITIVITY);
          const center = getPoint(e.clientX, e.clientY);
          zoomTo(state.scale * factor, center);
        } else {
          // Pan
          state.x -= e.deltaX;
          state.y -= e.deltaY;
          scheduleUpdate();
        }
      },
      { passive: false },
    );

    // Pointer Events (Pan & Pinch)
    let pointers = new Map();
    let initialPinchDist = null;
    let initialScale = null;
    let lastCenter = null;

    function getDistance(p1, p2) {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }

    function getCenter(p1, p2) {
      return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
    }

    // Prevent native drag behavior
    wrapper.addEventListener("dragstart", (e) => {
      e.preventDefault();
    });

    wrapper.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".mermaid-toolbar")) return;
      e.preventDefault();
      wrapper.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });

      content.style.transition = "none"; // Disable transition during drag

      if (pointers.size === 2) {
        // Start Pinch
        const pts = Array.from(pointers.values());
        initialPinchDist = getDistance(pts[0], pts[1]);
        initialScale = state.scale;
        lastCenter = getCenter(pts[0], pts[1]); // Screen coords
      } else if (pointers.size === 1) {
        // Start Pan
        lastCenter = { x: e.clientX, y: e.clientY };
      }
    });

    wrapper.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });

      if (pointers.size === 2) {
        // Pinch Zoom
        const pts = Array.from(pointers.values());
        const currentDist = getDistance(pts[0], pts[1]);
        const currentCenter = getCenter(pts[0], pts[1]); // Screen coords

        // 1. Pan by center movement
        const dx = currentCenter.x - lastCenter.x;
        const dy = currentCenter.y - lastCenter.y;
        state.x += dx;
        state.y += dy;

        // 2. Zoom
        const scaleFactor = currentDist / initialPinchDist;
        const newScale = initialScale * scaleFactor;

        // Apply zoom centered at currentCenter (relative to wrapper)
        // We need to convert screen center to wrapper-relative
        const rect = wrapper.getBoundingClientRect();
        const wrapperCenter = {
          x: currentCenter.x - rect.left,
          y: currentCenter.y - rect.top,
        };

        // Use the zoomTo logic but manually update state to avoid double scheduling
        // zoomTo logic: newTranslate = center - (center - oldTranslate) * (newScale / oldScale)
        // Here we already panned, so 'oldTranslate' is the current state.x/y

        const targetScale = clamp(
          newScale,
          MIN_SCALE,
          MAX_SCALE,
        );
        // Only apply if scale changed significantly
        if (Math.abs(targetScale - state.scale) > 0.001) {
          const localX =
            (wrapperCenter.x - state.x) / state.scale;
          const localY =
            (wrapperCenter.y - state.y) / state.scale;

          state.x = wrapperCenter.x - localX * targetScale;
          state.y = wrapperCenter.y - localY * targetScale;
          state.scale = targetScale;
        }

        lastCenter = currentCenter;
        scheduleUpdate();
      } else if (pointers.size === 1) {
        // Pan
        const dx = e.clientX - lastCenter.x;
        const dy = e.clientY - lastCenter.y;
        state.x += dx;
        state.y += dy;
        lastCenter = { x: e.clientX, y: e.clientY };
        scheduleUpdate();
      }
    });

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      wrapper.releasePointerCapture(e.pointerId);

      if (pointers.size < 2) {
        initialPinchDist = null;
      }
      if (pointers.size === 1) {
        // Reset last center for the remaining pointer to avoid jump
        const p = pointers.values().next().value;
        lastCenter = { x: p.x, y: p.y };
      }
      if (pointers.size === 0) {
        content.style.transition =
          "transform 0.1s ease-out"; // Re-enable transition
      }
    }

    wrapper.addEventListener("pointerup", onPointerUp);
    wrapper.addEventListener("pointercancel", onPointerUp);
    wrapper.addEventListener("pointerleave", onPointerUp);

    // --- Toolbar Handlers ---
    btnIn.addEventListener("click", () => {
      const rect = wrapper.getBoundingClientRect();
      const center = {
        x: rect.width / 2,
        y: rect.height / 2,
      };
      zoomTo(state.scale * 1.2, center);
    });

    btnOut.addEventListener("click", () => {
      const rect = wrapper.getBoundingClientRect();
      const center = {
        x: rect.width / 2,
        y: rect.height / 2,
      };
      zoomTo(state.scale / 1.2, center);
    });

    btnReset.addEventListener("click", () => {
      state = { x: 0, y: 0, scale: 1 };
      scheduleUpdate();
    });
  }

  function initAll() {
    document
      .querySelectorAll(".mermaid-wrapper")
      .forEach(initWrapper);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
