(() => {
  const TARGET_URL = "https://www.olx.pl/apigateway/graphql";
  const MAP_BUTTON_ID = "olx-map-open-button";
  const MAP_MODAL_ID = "olx-map-modal";
  const MAP_LIST_ID = "olx-map-list";
  const MAP_CANVAS_ID = "olx-map-canvas";
  const MAP_STATUS_ID = "olx-map-status";
  const OFFER_STORE = new Map();
  let leafletLoadPromise = null;
  let leafletMap = null;

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
        offer,
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

  const safeJson = (value) => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[nie mozna zserializowac obiektu]";
    }
  };

  const getFirstPhotoUrl = (offer) => {
    const firstPhotoSet = offer?.photosSet?.[0];
    if (typeof firstPhotoSet !== "string" || !firstPhotoSet.trim()) {
      return null;
    }

    const firstCandidate = firstPhotoSet.split(",")[0]?.trim();
    const firstUrl = firstCandidate?.split(/\s+/)[0]?.trim();
    if (!firstUrl || (!firstUrl.startsWith("http://") && !firstUrl.startsWith("https://"))) {
      return null;
    }
    return firstUrl;
  };

  const renderModalRows = () => {
    const list = document.getElementById(MAP_LIST_ID);
    if (!list) {
      return;
    }

    const items = Array.from(OFFER_STORE.values());
    const locatedItems = items.filter((item) => {
      const lat = Number(item?.map?.lat);
      const lon = Number(item?.map?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon);
    });

    if (!items.length) {
      list.innerHTML = "<div style='padding:12px;color:#57606a;'>Brak danych ofert.</div>";
      return;
    }

    const rows = items
      .map((item) => {
        const offerValue = safeJson(item.offer);
        return `<details style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px;">
<summary style="cursor:pointer;font:600 14px/1.3 sans-serif;">offer.id: ${escapeHtml(item.id)} (source: ${escapeHtml(item.source)})</summary>
<pre style="margin:10px 0 0;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;">${escapeHtml(offerValue)}</pre>
</details>`;
      })
      .join("");

    list.innerHTML = `<div id="${MAP_STATUS_ID}" style="padding:0 0 10px;color:#57606a;font:13px/1.4 sans-serif;"></div>
<div id="${MAP_CANVAS_ID}" style="height:420px;border-radius:10px;border:1px solid #d1d5db;overflow:hidden;background:#f3f4f6;"></div>
<div style="margin-top:14px">${rows}</div>`;
    renderLeafletMap(locatedItems);
  };

  const setMapStatus = (text) => {
    const statusNode = document.getElementById(MAP_STATUS_ID);
    if (statusNode) {
      statusNode.textContent = text;
    }
  };

  const loadLeaflet = () => {
    if (window.L) {
      return Promise.resolve(window.L);
    }
    if (leafletLoadPromise) {
      return leafletLoadPromise;
    }

    leafletLoadPromise = new Promise((resolve, reject) => {
      const scriptSrc = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      const styleHref = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

      if (!document.querySelector(`link[href="${styleHref}"]`)) {
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = styleHref;
        style.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        style.crossOrigin = "";
        document.head.appendChild(style);
      }

      const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.L));
        existingScript.addEventListener("error", () => reject(new Error("Leaflet script error")));
        return;
      }

      const script = document.createElement("script");
      script.src = scriptSrc;
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "";
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("Leaflet script error"));
      document.head.appendChild(script);
    });

    return leafletLoadPromise;
  };

  const renderLeafletMap = async (locatedItems) => {
    const mapNode = document.getElementById(MAP_CANVAS_ID);
    if (!mapNode) {
      return;
    }

    if (!locatedItems.length) {
      setMapStatus("Brak współrzędnych w offer.map (lat/lon).");
      mapNode.innerHTML = "";
      return;
    }

    setMapStatus(`Punkty na mapie: ${locatedItems.length}`);

    try {
      const L = await loadLeaflet();
      if (!L) {
        setMapStatus("Nie udało się załadować biblioteki mapy.");
        return;
      }

      if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
      }

      leafletMap = L.map(mapNode, { preferCanvas: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(leafletMap);

      const latLngs = [];
      for (const item of locatedItems) {
        const lat = Number(item.map.lat);
        const lon = Number(item.map.lon);
        const latLng = [lat, lon];
        latLngs.push(latLng);

        const photoUrl = getFirstPhotoUrl(item.offer);
        let marker = null;
        if (photoUrl) {
          const imageIcon = L.divIcon({
            className: "olx-map-image-marker",
            html:
              `<div style="width:46px;height:46px;border:2px solid #fff;border-radius:8px;` +
              `box-shadow:0 4px 10px rgba(0,0,0,0.28);overflow:hidden;background:#fff;">` +
              `<img src="${escapeHtml(photoUrl)}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;" />` +
              `</div>`,
            iconSize: [46, 46],
            iconAnchor: [23, 23],
            popupAnchor: [0, -20]
          });
          marker = L.marker(latLng, { icon: imageIcon }).addTo(leafletMap);
        } else {
          marker = L.marker(latLng).addTo(leafletMap);
        }

        marker.bindPopup(
          `<strong>Oferta ${escapeHtml(item.id)}</strong><br/>lat: ${lat.toFixed(5)}, lon: ${lon.toFixed(5)}`
        );

        const radiusKm = Number(item?.map?.radius);
        if (Number.isFinite(radiusKm) && radiusKm > 0) {
          L.circle(latLng, {
            radius: radiusKm * 1000,
            color: "#2563eb",
            weight: 1,
            fillColor: "#60a5fa",
            fillOpacity: 0.08
          }).addTo(leafletMap);
        }
      }

      if (latLngs.length === 1) {
        const zoom = Number(locatedItems[0]?.map?.zoom);
        leafletMap.setView(latLngs[0], Number.isFinite(zoom) ? zoom : 13);
      } else {
        leafletMap.fitBounds(latLngs, { padding: [24, 24], maxZoom: 15 });
      }
    } catch {
      setMapStatus("Mapa nie mogła zostać załadowana (Leaflet/OpenStreetMap).");
    }
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
