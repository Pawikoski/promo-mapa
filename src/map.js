import { MAP_CANVAS_ID, MAP_STATUS_ID } from "./constants.js";
import { state } from "./state.js";
import { escapeHtml, sleep } from "./utils.js";
import L from "leaflet";
import "leaflet.markercluster";
import leafletCss from "leaflet/dist/leaflet.css";
import markerClusterCss from "leaflet.markercluster/dist/MarkerCluster.css";
import markerClusterDefaultCss from "leaflet.markercluster/dist/MarkerCluster.Default.css";
import {
  getFirstPhotoUrl,
  getOfferPriceDisplay,
  getOfferPriceNumeric,
  getPriceBadgeColor,
  getLocatedItems,
  buildOfferPopupHtml
} from "./offers.js";

const LEAFLET_STYLE_ID = "olx-map-leaflet-style";
const MARKER_CLUSTER_STYLE_ID = "olx-map-markercluster-style";
const MARKER_CLUSTER_DEFAULT_STYLE_ID = "olx-map-markercluster-default-style";

const ensureStyle = (styleId, cssText) => {
  if (document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = cssText;
  (document.head || document.documentElement).appendChild(style);
};

const ensureMapStyles = () => {
  ensureStyle(LEAFLET_STYLE_ID, leafletCss);
  ensureStyle(MARKER_CLUSTER_STYLE_ID, markerClusterCss);
  ensureStyle(MARKER_CLUSTER_DEFAULT_STYLE_ID, markerClusterDefaultCss);
};

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
    const fallbackIcon = L.divIcon({
      className: "olx-map-fallback-marker",
      html:
        `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">` +
        `<div style="width:14px;height:14px;border:2px solid #fff;border-radius:50%;background:#0f766e;` +
        `box-shadow:0 2px 8px rgba(0,0,0,0.28);"></div>` +
        `<div style="max-width:90px;padding:1px 6px;border-radius:999px;background:${badgeBg};color:#fff;` +
        `font:700 11px/1.5 sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(priceDisplay)}</div>` +
        `</div>`,
      iconSize: [90, 34],
      iconAnchor: [45, 30],
      popupAnchor: [0, -22]
    });
    marker = L.marker(latLng, { icon: fallbackIcon });
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
  ensureMapStyles();
  return Promise.resolve(L);
};

let _renderGeneration = 0;

export const renderLeafletMap = async (locatedItems, useGrouping = false) => {
  const mapNode = document.getElementById(MAP_CANVAS_ID);
  if (!mapNode) {
    return;
  }

  const myGeneration = ++_renderGeneration;

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

    if (_renderGeneration !== myGeneration || !mapNode.isConnected) {
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
