(() => {
  const TARGET_URL = "https://www.olx.pl/apigateway/graphql";
  const MAP_BUTTON_ID = "olx-map-open-button";
  const MAP_MODAL_ID = "olx-map-modal";
  const MAP_LIST_ID = "olx-map-list";
  const OFFER_STORE = new Map();

  const tryParseJson = (value) => {
    if (value == null) {
      return null;
    }
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (typeof value === "object") {
      return value;
    }
    return null;
  };

  const upsertOffers = (offers, sourceLabel) => {
    if (!Array.isArray(offers)) {
      return;
    }

    for (const offer of offers) {
      if (!offer || typeof offer !== "object") {
        continue;
      }
      const id = offer.id;
      if (id == null) {
        continue;
      }

      OFFER_STORE.set(String(id), {
        id,
        map: offer.map ?? null,
        source: sourceLabel
      });

      console.log(`OLX ${sourceLabel} offer:`, offer.id, offer.map);
    }

    const modal = document.getElementById(MAP_MODAL_ID);
    if (modal && modal.style.display !== "none") {
      renderModalRows();
    }
  };

  const logOffers = (payload) => {
    const rootData = payload?.data;
    const observedAds =
      rootData?.clientCompatibleObservedAds?.data ??
      rootData?.clientComptaibleObservedAds?.data;

    upsertOffers(observedAds, "observed");
  };

  const logPrerenderedOffers = (rawState) => {
    const parsedState = tryParseJson(rawState);
    const ads = parsedState?.listing?.listing?.ads;
    upsertOffers(ads, "prerendered");
  };

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const renderModalRows = () => {
    const list = document.getElementById(MAP_LIST_ID);
    if (!list) {
      return;
    }

    const items = Array.from(OFFER_STORE.values());
    if (!items.length) {
      list.innerHTML = "<div style='padding:12px;color:#57606a;'>Brak danych ofert.</div>";
      return;
    }

    const rows = items
      .map((item) => {
        const mapValue = item.map == null ? "null" : JSON.stringify(item.map, null, 2);
        return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px;">
<div style="font:600 14px/1.3 sans-serif;margin-bottom:6px;">offer.id: ${escapeHtml(item.id)}</div>
<pre style="margin:0;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;">offer.map: ${escapeHtml(mapValue)}</pre>
</div>`;
      })
      .join("");

    list.innerHTML = rows;
  };

  const ensureModal = () => {
    if (document.getElementById(MAP_MODAL_ID)) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = MAP_MODAL_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.45)";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "2147483647";

    const modal = document.createElement("div");
    modal.style.width = "min(900px, 92vw)";
    modal.style.maxHeight = "80vh";
    modal.style.overflow = "hidden";
    modal.style.background = "#fff";
    modal.style.borderRadius = "12px";
    modal.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.2)";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "14px 16px";
    header.style.borderBottom = "1px solid #e5e7eb";

    const title = document.createElement("strong");
    title.textContent = "Mapa";
    title.style.font = "600 16px/1.3 sans-serif";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Zamknij";
    closeButton.style.border = "1px solid #d1d5db";
    closeButton.style.background = "#fff";
    closeButton.style.borderRadius = "8px";
    closeButton.style.padding = "6px 10px";
    closeButton.style.cursor = "pointer";

    const body = document.createElement("div");
    body.id = MAP_LIST_ID;
    body.style.padding = "14px 16px";
    body.style.overflow = "auto";

    closeButton.addEventListener("click", () => {
      overlay.style.display = "none";
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.style.display = "none";
      }
    });

    header.appendChild(title);
    header.appendChild(closeButton);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);
  };

  const openModal = () => {
    const overlay = document.getElementById(MAP_MODAL_ID);
    if (!overlay) {
      return;
    }
    renderModalRows();
    overlay.style.display = "flex";
  };

  const createMapButton = (targetButton) => {
    const button = document.createElement("button");
    button.id = MAP_BUTTON_ID;
    button.type = "button";
    button.className = targetButton.className || "css-1tyue09";
    button.setAttribute("data-nx-name", "Button");
    button.setAttribute("data-nx-legacy", "true");
    button.setAttribute("data-button-size", "small");
    button.setAttribute("data-button-variant", "secondary");
    button.innerHTML =
      '<div class="n-button-svg-wrapper n-button-svg-wrapper-pre" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" class="css-6tfxml">' +
      '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.664 7 13 7 13s7-7.336 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5"></path>' +
      "</svg></div>" +
      '<span class="n-button-text-wrapper">Mapa</span>';
    button.addEventListener("click", openModal);
    return button;
  };

  const findObserveSearchButton = () => {
    const byTestId = document.querySelector("button[data-testid='fav-search-btn']");
    if (byTestId) {
      return byTestId;
    }

    const spans = document.querySelectorAll("span.n-button-text-wrapper, button span");
    for (const span of spans) {
      const text = (span.textContent || "").trim().toLowerCase();
      if (text.includes("obserwuj wyszukiwanie")) {
        return span.closest("button");
      }
    }
    return null;
  };

  const ensureMapButton = () => {
    const targetButton = findObserveSearchButton();
    if (!targetButton) {
      return;
    }

    const parent = targetButton.parentElement;
    if (!parent) {
      return;
    }

    let mapButton = document.getElementById(MAP_BUTTON_ID);
    if (!mapButton) {
      mapButton = createMapButton(targetButton);
    } else {
      mapButton.className = targetButton.className || mapButton.className;
    }

    if (mapButton.parentElement !== parent || mapButton.nextSibling !== targetButton) {
      parent.insertBefore(mapButton, targetButton);
    }
  };

  const observeUi = () => {
    ensureModal();
    ensureMapButton();

    let debounceTimer = null;
    let isUpdating = false;

    const debouncedEnsure = () => {
      if (isUpdating) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        isUpdating = true;
        try {
          ensureMapButton();
        } finally {
          isUpdating = false;
        }
      }, 200);
    };

    const observer = new MutationObserver(debouncedEnsure);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const observePrerenderedState = () => {
    let currentState = window.__PRERENDERED_STATE__;
    logPrerenderedOffers(currentState);

    try {
      Object.defineProperty(window, "__PRERENDERED_STATE__", {
        configurable: true,
        enumerable: true,
        get() {
          return currentState;
        },
        set(value) {
          currentState = value;
          logPrerenderedOffers(value);
        }
      });
    } catch {
      // Fallback when property is non-configurable: retry reads shortly after load.
      setTimeout(() => logPrerenderedOffers(window.__PRERENDERED_STATE__), 300);
      setTimeout(() => logPrerenderedOffers(window.__PRERENDERED_STATE__), 1000);
      setTimeout(() => logPrerenderedOffers(window.__PRERENDERED_STATE__), 2500);
    }
  };

  observePrerenderedState();
  observeUi();

  const isTargetGraphql = (url) =>
    typeof url === "string" &&
    (url === TARGET_URL || url.startsWith(`${TARGET_URL}?`));

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
    const requestMethod =
      (args[1]?.method || args[0]?.method || "GET").toUpperCase();

    if (requestMethod === "POST" && isTargetGraphql(requestUrl)) {
      response
        .clone()
        .json()
        .then(logOffers)
        .catch(() => {});
    }

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    this.__olxUrl = typeof url === "string" ? url : "";
    this.__olxMethod = typeof method === "string" ? method.toUpperCase() : "";
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function send(body) {
    this.addEventListener("load", () => {
      if (this.__olxMethod !== "POST" || !isTargetGraphql(this.__olxUrl)) {
        return;
      }

      const parsed =
        this.responseType === "json"
          ? tryParseJson(this.response)
          : tryParseJson(this.responseText);

      if (parsed) {
        logOffers(parsed);
      }
    });

    return originalSend.call(this, body);
  };
})();
