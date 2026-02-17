import { MAP_CANVAS_ID, MAP_STATUS_ID } from "./constants.js";
import { state } from "./state.js";
import { escapeHtml, sleep } from "./utils.js";
import {
  getFirstPhotoUrl,
  getOfferPriceDisplay,
  getOfferPriceNumeric,
  getPriceBadgeColor,
  getLocatedItems,
  buildOfferPopupHtml
} from "./offers.js";

export const setMapStatus = (text) => {
  const statusNode = document.getElementById(MAP_STATUS_ID);
  if (statusNode) {
    statusNode.textContent = text;
  }
};

const addOfferToExistingMap = (item, priceRange) => {
  if (!state.leafletMap || !state.leafletApi || !state.leafletMarkerLayer || !item) {
    return false;
  }
  const idKey = String(item.id);
  if (state.renderedOfferIds.has(idKey)) {
    return false;
  }

  const L = state.leafletApi;
  const lat = Number(item?.map?.lat);
  const lon = Number(item?.map?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }
  const latLng = [lat, lon];
  const photoUrl = getFirstPhotoUrl(item.offer);
  const priceDisplay = getOfferPriceDisplay(item.offer);
  const priceValue = getOfferPriceNumeric(item.offer);
  const badgeBg = getPriceBadgeColor(
    priceValue,
    priceRange?.minPrice,
    priceRange?.maxPrice,
    state.mapPriceColoringEnabled
  );

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
        `<div style="max-width:90px;padding:1px 6px;border-radius:999px;background:${badgeBg};color:#fff;` +
        `font:700 11px/1.5 sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(priceDisplay)}</div>` +
        `</div>`,
      iconSize: [90, 66],
      iconAnchor: [45, 56],
      popupAnchor: [0, -42]
    });
    marker = L.marker(latLng, { icon: imageIcon });
  } else {
    marker = L.marker(latLng);
  }

  marker.bindPopup(buildOfferPopupHtml(item));
  state.leafletMarkerLayer.addLayer(marker);

  state.renderedOfferIds.add(idKey);
  return true;
};

export const addOffersSequentiallyToMap = async (addedItems, delayMs = 5) => {
  if (!Array.isArray(addedItems) || !addedItems.length || !state.leafletMap) {
    return;
  }
  const locatedItems = getLocatedItems(addedItems);
  if (!locatedItems.length) {
    return;
  }

  const allLocatedItems = getLocatedItems();
  const numericPrices = allLocatedItems
    .map((item) => getOfferPriceNumeric(item.offer))
    .filter((value) => Number.isFinite(value));
  const priceRange = {
    minPrice: numericPrices.length ? Math.min(...numericPrices) : NaN,
    maxPrice: numericPrices.length ? Math.max(...numericPrices) : NaN
  };

  for (const item of locatedItems) {
    addOfferToExistingMap(item, priceRange);
    await sleep(delayMs);
  }
  setMapStatus(`Punkty na mapie: ${getLocatedItems().length}`);
};

const loadLeaflet = () => {
  if (window.L) {
    // continue to cluster plugin load below
  } else if (state.leafletLoadPromise) {
    return state.leafletLoadPromise;
  }
  if (!state.leafletLoadPromise) {
    state.leafletLoadPromise = new Promise((resolve, reject) => {
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

      if (window.L) {
        resolve(window.L);
        return;
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
  }

  if (!state.markerClusterLoadPromise) {
    state.markerClusterLoadPromise = state.leafletLoadPromise.then((L) => {
      if (!L) {
        return L;
      }
      if (typeof L.markerClusterGroup === "function") {
        return L;
      }

      const clusterStyleHref = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
      const clusterDefaultStyleHref =
        "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
      const clusterScriptSrc = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";

      if (!document.querySelector(`link[href="${clusterStyleHref}"]`)) {
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = clusterStyleHref;
        document.head.appendChild(style);
      }
      if (!document.querySelector(`link[href="${clusterDefaultStyleHref}"]`)) {
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = clusterDefaultStyleHref;
        document.head.appendChild(style);
      }

      return new Promise((resolve) => {
        const existingScript = document.querySelector(`script[src="${clusterScriptSrc}"]`);
        if (existingScript) {
          existingScript.addEventListener("load", () => resolve(window.L));
          existingScript.addEventListener("error", () => resolve(window.L));
          return;
        }

        const script = document.createElement("script");
        script.src = clusterScriptSrc;
        script.onload = () => resolve(window.L);
        script.onerror = () => resolve(window.L);
        document.head.appendChild(script);
      });
    });
  }

  return state.markerClusterLoadPromise;
};

export const renderLeafletMap = async (locatedItems, useGrouping = false) => {
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

    if (state.leafletMap) {
      state.leafletMap.remove();
      state.leafletMap = null;
    }
    state.leafletApi = L;
    state.renderedOfferIds = new Set();

    state.leafletMap = L.map(mapNode, { preferCanvas: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.leafletMap);
    state.leafletMarkerLayer =
      useGrouping && typeof L.markerClusterGroup === "function"
        ? L.markerClusterGroup({
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          maxClusterRadius: 40
        })
        : L.layerGroup();
    state.leafletMarkerLayer.addTo(state.leafletMap);
    const latLngs = [];
    const numericPrices = locatedItems
      .map((item) => getOfferPriceNumeric(item.offer))
      .filter((value) => Number.isFinite(value));
    const minPrice = numericPrices.length ? Math.min(...numericPrices) : NaN;
    const maxPrice = numericPrices.length ? Math.max(...numericPrices) : NaN;

    for (const item of locatedItems) {
      const lat = Number(item.map.lat);
      const lon = Number(item.map.lon);
      const latLng = [lat, lon];
      latLngs.push(latLng);
      addOfferToExistingMap(item, { minPrice, maxPrice });
    }

    if (latLngs.length === 1) {
      const zoom = Number(locatedItems[0]?.map?.zoom);
      state.leafletMap.setView(latLngs[0], Number.isFinite(zoom) ? zoom : 13);
    } else {
      state.leafletMap.fitBounds(latLngs, { padding: [24, 24], maxZoom: 15 });
    }
  } catch {
    setMapStatus("Mapa nie mogła zostać załadowana (Leaflet/OpenStreetMap).");
  }
};
