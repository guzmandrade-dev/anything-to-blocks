/**
 * Element picker script — injected into the WebContentsView via executeJavaScript().
 * Communicates selected element data back to the main process via console.log
 * with a special prefix that main.ts listens for.
 *
 * Usage: window.__a2bPicker.enable() / window.__a2bPicker.disable()
 */
(function () {
  if (window.__a2bPicker) {
    window.__a2bPicker.disable();
  }

  let hoverOverlay = null;
  let tooltipEl = null;
  let currentElement = null;
  let enabled = false;

  const RELEVANT_STYLES = [
    "display", "position", "flex-direction", "flex-wrap", "justify-content",
    "align-items", "gap", "grid-template-columns", "grid-template-rows",
    "width", "height", "min-width", "max-width", "min-height", "max-height",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-radius", "background-color", "color", "font-family", "font-size",
    "font-weight", "font-style", "line-height", "text-align", "text-decoration",
    "letter-spacing", "box-shadow", "opacity", "overflow", "z-index",
    "flex-grow", "flex-shrink", "flex-basis", "grid-column", "grid-row",
    "object-fit", "aspect-ratio", "backdrop-filter", "filter", "transform"
  ];

  function createOverlay() {
    hoverOverlay = document.createElement("div");
    hoverOverlay.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      "z-index:2147483647",
      "border:2px solid #2f6ad1",
      "background:rgba(47,106,209,0.1)",
      "transition:all 0.05s ease",
      "box-sizing:border-box",
      "display:none"
    ].join(";");
    document.body.appendChild(hoverOverlay);

    tooltipEl = document.createElement("div");
    tooltipEl.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      "z-index:2147483647",
      "background:#1f2328",
      "color:#fff",
      "font-size:12px",
      "font-family:monospace",
      "padding:4px 8px",
      "border-radius:4px",
      "max-width:400px",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "white-space:nowrap",
      "display:none"
    ].join(";");
    document.body.appendChild(tooltipEl);
  }

  function highlightElement(el) {
    if (!hoverOverlay || !tooltipEl) return;
    currentElement = el;
    const rect = el.getBoundingClientRect();

    // Clamp the overlay so its border stays within the viewport. With
    // box-sizing:border-box, the 2px border is drawn inside the width, but
    // we still clamp to avoid any sub-pixel overflow at the edges.
    const borderWidth = 2;
    const left = Math.min(rect.left, window.innerWidth - borderWidth);
    const top = Math.min(rect.top, window.innerHeight - borderWidth);
    const width = Math.min(rect.width, window.innerWidth - left);
    const height = Math.min(rect.height, window.innerHeight - top);

    hoverOverlay.style.display = "block";
    hoverOverlay.style.left = left + "px";
    hoverOverlay.style.top = top + "px";
    hoverOverlay.style.width = width + "px";
    hoverOverlay.style.height = height + "px";

    const tag = el.tagName.toLowerCase();
    const idPart = el.id ? "#" + el.id : "";
    const classPart = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
      : "";
    const label = tag + idPart + classPart;
    const size = Math.round(rect.width) + "x" + Math.round(rect.height);

    tooltipEl.style.display = "block";
    tooltipEl.style.left = rect.left + "px";
    tooltipEl.style.top = Math.max(0, rect.top - 26) + "px";
    tooltipEl.textContent = label + " (" + size + ")";
  }

  function hideHighlight() {
    if (hoverOverlay) hoverOverlay.style.display = "none";
    if (tooltipEl) tooltipEl.style.display = "none";
    currentElement = null;
  }

  function extractElementData(el) {
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);

    const styles = {};
    for (const prop of RELEVANT_STYLES) {
      styles[prop] = computed.getPropertyValue(prop);
    }

    const attrs = {};
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value;
    }

    const outerHTML = el.outerHTML.length > 5000
      ? el.outerHTML.slice(0, 5000)
      : el.outerHTML;

    const innerText = (el.innerText || "").slice(0, 2000);

    const classes = typeof el.className === "string"
      ? el.className.trim().split(/\s+/).filter(Boolean)
      : [];

    return {
      url: window.location.href,
      tagName: el.tagName.toLowerCase(),
      classes: classes,
      idAttribute: el.id || null,
      attributes: attrs,
      computedStyles: styles,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      },
      outerHTML: outerHTML,
      innerText: innerText
    };
  }

  function onMouseMove(e) {
    if (!enabled) return;
    // Don't highlight our own overlay elements
    if (e.target === hoverOverlay || e.target === tooltipEl) return;
    if (e.target && e.target.nodeType === Node.ELEMENT_NODE) {
      highlightElement(e.target);
    }
  }

  function onClick(e) {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();

    if (currentElement) {
      const data = extractElementData(currentElement);
      // Communicate back to main process via console message
      console.log("__A2B_PICKER__:" + JSON.stringify(data));
    }

    hideHighlight();
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (e.key === "Escape") {
      hideHighlight();
    } else if (e.key === "ArrowUp" && currentElement) {
      e.preventDefault();
      const parent = currentElement.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        highlightElement(parent);
      }
    } else if (e.key === "ArrowDown" && currentElement) {
      e.preventDefault();
      const child = currentElement.firstElementChild;
      if (child) {
        highlightElement(child);
      }
    }
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    if (!hoverOverlay) createOverlay();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.cursor = "crosshair";
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    hideHighlight();
    if (hoverOverlay) hoverOverlay.remove();
    if (tooltipEl) tooltipEl.remove();
    hoverOverlay = null;
    tooltipEl = null;
    document.body.style.cursor = "";
  }

  window.__a2bPicker = { enable, disable };

  enable();
})();