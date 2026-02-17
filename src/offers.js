import { MAP_MODAL_ID } from "./constants.js";
import { OFFER_STORE } from "./state.js";
import { tryParseJson, escapeHtml, truncateHtmlPreserveTags } from "./utils.js";

let renderModalRowsFn = null;

export const setRenderModalRowsFn = (fn) => {
  renderModalRowsFn = fn;
};

export const upsertOffers = (offers, sourceLabel, options = {}) => {
  if (!Array.isArray(offers)) {
    return [];
  }
  const addedItems = [];

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") {
      continue;
    }
    const id = offer.id;
    if (id == null) {
      continue;
    }

    const key = String(id);
    const existed = OFFER_STORE.has(key);
    const item = {
      id,
      offer,
      map: offer.map ?? null,
      source: sourceLabel
    };
    OFFER_STORE.set(key, item);
    if (!existed) {
      addedItems.push(item);
    }

    console.log(`OLX ${sourceLabel} offer:`, offer.id, offer.map);
  }

  const modal = document.getElementById(MAP_MODAL_ID);
  if (!options.skipRender && modal && modal.style.display !== "none") {
    if (renderModalRowsFn) {
      renderModalRowsFn();
    }
  }
  return addedItems;
};

export const logOffers = (payload) => {
  const rootData = payload?.data;
  const observedAds =
    rootData?.clientCompatibleObservedAds?.data ??
    rootData?.clientComptaibleObservedAds?.data;

  upsertOffers(observedAds, "observed");
};

export const logPrerenderedOffers = (rawState) => {
  const parsedState = tryParseJson(rawState);
  const ads = parsedState?.listing?.listing?.ads;
  upsertOffers(ads, "prerendered");
};

export const getFirstPhotoUrl = (offer) => {
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

export const getOfferPriceDisplay = (offer) => {
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

export const getOfferPriceNumeric = (offer) => {
  const regularValue = offer?.price?.regularPrice?.value;
  if (typeof regularValue === "number" && Number.isFinite(regularValue)) {
    return regularValue;
  }

  const priceParam = Array.isArray(offer?.params)
    ? offer.params.find((param) => param?.key === "price")
    : null;
  const priceParamValue = priceParam?.value?.value;
  if (typeof priceParamValue === "number" && Number.isFinite(priceParamValue)) {
    return priceParamValue;
  }

  return null;
};

export const getPriceBadgeColor = (priceValue, minPrice, maxPrice, useColorScale) => {
  if (!useColorScale || !Number.isFinite(priceValue) || !Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return "#111827";
  }

  if (maxPrice <= minPrice) {
    return "#166534";
  }

  const ratio = Math.min(1, Math.max(0, (priceValue - minPrice) / (maxPrice - minPrice)));
  const hue = 120 - ratio * 120;
  return `hsl(${hue.toFixed(0)} 75% 35%)`;
};

export const getLocatedItems = (items) =>
  (Array.isArray(items) ? items : Array.from(OFFER_STORE.values())).filter((item) => {
    const lat = Number(item?.map?.lat);
    const lon = Number(item?.map?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon);
  });

export const getOfferLocationDisplay = (offer) => {
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

export const extractOffersFromPayload = (payload) => {
  const offersFromClientCompatible =
    payload?.data?.clientCompatibleListings?.data ??
    payload?.data?.clientComptabileListings?.data;
  if (Array.isArray(offersFromClientCompatible)) {
    return offersFromClientCompatible;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};

export const getSafeOfferUrl = (offer) => {
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

export const buildOfferPopupHtml = (item) => {
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
