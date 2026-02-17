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
    if (typeof firstPhotoSet === "string" && firstPhotoSet.trim()) {
      const firstCandidate = firstPhotoSet.split(",")[0]?.trim();
      const firstUrl = firstCandidate?.split(/\s+/)[0]?.trim();
      if (firstUrl && (firstUrl.startsWith("http://") || firstUrl.startsWith("https://"))) {
        return firstUrl;
      }
    }

    const firstPhoto = offer?.photos?.[0];
    const photoLink = typeof firstPhoto?.link === "string" ? firstPhoto.link.trim() : "";
    if (!photoLink || (!photoLink.startsWith("http://") && !photoLink.startsWith("https://"))) {
      return null;
    }

    return photoLink
      .replaceAll("{width}", "516")
      .replaceAll("{height}", "361");
  };

  const getOfferPriceDisplay = (offer) => {
    const price = offer?.price;
    const displayValue = price?.displayValue;
    if (typeof displayValue === "string" && displayValue.trim()) {
      return displayValue.trim();
    }

    const regular = price?.regularPrice;
    if (typeof regular?.value === "number") {
      const currencySymbol = typeof regular.currencySymbol === "string" ? regular.currencySymbol : "";
      return `${regular.value}${currencySymbol ? ` ${currencySymbol}` : ""}`;
    }

    if (price?.free === true) {
      return "Za darmo";
    }
    if (price?.exchange === true) {
      return "Zamiana";
    }
    if (price?.budget === true) {
      return "Do uzgodnienia";
    }

    const priceParam = Array.isArray(offer?.params)
      ? offer.params.find((param) => param?.key === "price")
      : null;
    const paramValue = priceParam?.value;
    if (typeof paramValue?.label === "string" && paramValue.label.trim()) {
      return paramValue.label.trim();
    }
    if (typeof paramValue?.value === "number") {
      const currency = typeof paramValue?.currency === "string" ? paramValue.currency : "";
      return `${paramValue.value}${currency ? ` ${currency}` : ""}`;
    }
    if (paramValue?.arranged === true || paramValue?.type === "arranged") {
      return "Do uzgodnienia";
    }
    if (paramValue?.budget === true) {
      return "Budzet";
    }

    return "Brak ceny";
  };

  const getOfferLocationDisplay = (offer) => {
    const location = offer?.location;
    if (!location || typeof location !== "object") {
      return "Brak lokalizacji";
    }

    if (typeof location.pathName === "string" && location.pathName.trim()) {
      return location.pathName.trim();
    }

    const cityName =
      (typeof location?.cityName === "string" && location.cityName.trim()) ||
      (typeof location?.city?.name === "string" && location.city.name.trim()) ||
      "";
    const districtName =
      (typeof location?.districtName === "string" && location.districtName.trim()) ||
      (typeof location?.district?.name === "string" && location.district.name.trim()) ||
      "";
    const regionName =
      (typeof location?.regionName === "string" && location.regionName.trim()) ||
      (typeof location?.region?.name === "string" && location.region.name.trim()) ||
      "";

    const parts = [regionName, cityName, districtName].filter(Boolean);
    if (parts.length) {
      return parts.join(", ");
    }

    return "Brak lokalizacji";
  };

  const sanitizeHtml = (rawHtml) => {
    if (typeof rawHtml !== "string" || !rawHtml.trim()) {
      return "";
    }

    const container = document.createElement("div");
    container.innerHTML = rawHtml;

    const blocked = container.querySelectorAll("script, style, iframe, object, embed, link, meta");
    for (const node of blocked) {
      node.remove();
    }

    const all = container.querySelectorAll("*");
    for (const el of all) {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value || "";
        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
          continue;
        }
        if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      }
    }

    return container.innerHTML;
  };

  const truncateHtmlPreserveTags = (rawHtml, maxChars) => {
    const safeHtml = sanitizeHtml(rawHtml);
    if (!safeHtml) {
      return "";
    }

    const root = document.createElement("div");
    root.innerHTML = safeHtml;

    const state = {
      remaining: maxChars,
      done: false
    };

    const trimNode = (node) => {
      if (state.done) {
        node.remove();
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        if (!text) {
          return;
        }
        if (text.length <= state.remaining) {
          state.remaining -= text.length;
          return;
        }
        const trimmed = text.slice(0, Math.max(0, state.remaining)).trimEnd();
        node.textContent = `${trimmed}...`;
        state.remaining = 0;
        state.done = true;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const children = Array.from(node.childNodes);
      for (const child of children) {
        trimNode(child);
      }
    };

    const top = Array.from(root.childNodes);
    for (const node of top) {
      trimNode(node);
    }

    return root.innerHTML;
  };

  const getSafeOfferUrl = (offer) => {
    const url = offer?.url;
    if (typeof url !== "string" || !url.trim()) {
      return null;
    }
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return null;
    }
    return trimmed;
  };

  const buildOfferPopupHtml = (item) => {
    const offer = item?.offer ?? {};
    const title = typeof offer.title === "string" && offer.title.trim() ? offer.title.trim() : `Oferta ${item.id}`;
    const descriptionHtml = truncateHtmlPreserveTags(offer?.description, 80);
    const priceDisplay = getOfferPriceDisplay(offer);
    const locationDisplay = getOfferLocationDisplay(offer);
    const photoUrl = getFirstPhotoUrl(offer);
    const offerUrl = getSafeOfferUrl(offer);

    const photoPart = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" style="display:block;width:100%;height:180px;object-fit:cover;border-radius:8px;" />`
      : `<div style="width:100%;height:180px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;font:13px/1.3 sans-serif;">Brak zdjecia</div>`;

    const titlePart = offerUrl
      ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
<a href="${escapeHtml(offerUrl)}" target="_blank" rel="noopener noreferrer" style="font:600 14px/1.35 sans-serif;color:#111827;text-decoration:none;">${escapeHtml(title)}</a>
<span aria-hidden="true" title="Otworz oferte" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:#2563eb;">
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 5h5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
<path d="M10 14L19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
<path d="M19 14v5h-14v-14h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
</span>
</div>`
      : `<div style="margin-top:6px;font:600 14px/1.35 sans-serif;color:#111827;">${escapeHtml(title)}</div>`;

    const descriptionPart = descriptionHtml
      ? `<div style="margin-top:6px;font:13px/1.45 sans-serif;color:#374151;max-height:140px;overflow:auto;">${descriptionHtml}</div>`
      : `<div style="margin-top:6px;font:13px/1.45 sans-serif;color:#6b7280;">Brak opisu</div>`;

    return `<div style="width:280px;">
${photoPart}
<div style="margin-top:8px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
<div style="font:700 15px/1.3 sans-serif;color:#111827;">${escapeHtml(priceDisplay)}</div>
<div style="font:600 12px/1.35 sans-serif;color:#4b5563;text-align:right;">${escapeHtml(locationDisplay)}</div>
</div>
${titlePart}
${descriptionPart}
</div>`;
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
        const priceDisplay = getOfferPriceDisplay(item.offer);
        const locationDisplay = getOfferLocationDisplay(item.offer);
        const title =
          typeof item?.offer?.title === "string" && item.offer.title.trim()
            ? item.offer.title.trim()
            : `Oferta ${item.id}`;
        return `<details style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px;">
<summary style="cursor:pointer;list-style:none;">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font:700 14px/1.3 sans-serif;">
<span style="color:#111827;">${escapeHtml(priceDisplay)}</span>
<span style="color:#374151;text-align:right;">${escapeHtml(locationDisplay)}</span>
</div>
<div style="margin-top:6px;font:600 14px/1.35 sans-serif;color:#111827;">${escapeHtml(title)}</div>
<div style="margin-top:4px;font:12px/1.3 sans-serif;color:#6b7280;">offer.id: ${escapeHtml(item.id)} (source: ${escapeHtml(item.source)})</div>
</summary>
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
        const priceDisplay = getOfferPriceDisplay(item.offer);
        let marker = null;
        if (photoUrl) {
          const imageIcon = L.divIcon({
            className: "olx-map-image-marker",
            html:
              `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">` +
              `<div style="width:46px;height:46px;border:2px solid #fff;border-radius:8px;` +
              `box-shadow:0 4px 10px rgba(0,0,0,0.28);overflow:hidden;background:#fff;">` +
              `<img src="${escapeHtml(photoUrl)}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;" />` +
              `</div>` +
              `<div style="max-width:90px;padding:1px 6px;border-radius:999px;background:#111827;color:#fff;` +
              `font:700 11px/1.5 sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(priceDisplay)}</div>` +
              `</div>`,
            iconSize: [90, 66],
            iconAnchor: [45, 56],
            popupAnchor: [0, -42]
          });
          marker = L.marker(latLng, { icon: imageIcon }).addTo(leafletMap);
        } else {
          marker = L.marker(latLng).addTo(leafletMap);
        }

        marker.bindPopup(buildOfferPopupHtml(item));

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
    modal.style.width = "min(1200px, 96vw)";
    modal.style.maxHeight = "90vh";
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
