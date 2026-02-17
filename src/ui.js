import {
  MAP_BUTTON_ID,
  MAP_MODAL_ID,
  MAP_LIST_ID,
  MAP_CANVAS_ID,
  MAP_STATUS_ID,
  MAP_LOAD_BUTTON_ID,
  MAP_GROUP_TOGGLE_ID,
  MAP_PRICE_COLOR_TOGGLE_ID
} from "./constants.js";
import { OFFER_STORE, state } from "./state.js";
import { getLocatedItems } from "./offers.js";
import { renderLeafletMap } from "./map.js";
import { handleLoadClick } from "./api.js";

const renderModalRows = () => {
  const list = document.getElementById(MAP_LIST_ID);
  if (!list) {
    return;
  }

  const items = Array.from(OFFER_STORE.values());
  const locatedItems = getLocatedItems(items);

  if (!items.length) {
    list.innerHTML = "<div style='padding:12px;color:#57606a;'>Brak danych ofert.</div>";
    return;
  }

  list.innerHTML = `<div id="${MAP_STATUS_ID}" style="padding:0 0 10px;color:#57606a;font:13px/1.4 sans-serif;"></div>
<div id="${MAP_CANVAS_ID}" style="height:76vh;border-radius:10px;border:1px solid #d1d5db;overflow:hidden;background:#f3f4f6;"></div>
<div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
<label style="display:inline-flex;align-items:center;gap:8px;font:600 13px/1.2 sans-serif;color:#111827;cursor:pointer;">
<input id="${MAP_GROUP_TOGGLE_ID}" type="checkbox" ${state.mapGroupingEnabled ? "checked" : ""} />
grupuj
</label>
<label style="display:inline-flex;align-items:center;gap:8px;font:600 13px/1.2 sans-serif;color:#111827;cursor:pointer;">
<input id="${MAP_PRICE_COLOR_TOGGLE_ID}" type="checkbox" ${state.mapPriceColoringEnabled ? "checked" : ""} />
kolor cen
</label>
<button id="${MAP_LOAD_BUTTON_ID}" type="button" style="border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;font:600 13px/1.2 sans-serif;">laduj</button>
</div>`;
  renderLeafletMap(locatedItems, state.mapGroupingEnabled);
  bindLoadButton();
  bindGroupToggle(locatedItems);
  bindPriceColorToggle(locatedItems);
};

export { renderModalRows };

const bindLoadButton = () => {
  const button = document.getElementById(MAP_LOAD_BUTTON_ID);
  if (!button || button.__olxLoadBound) {
    return;
  }
  button.__olxLoadBound = true;

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "ladowanie...";

    await handleLoadClick();

    button.disabled = false;
    button.textContent = "laduj";
  });
};

const bindGroupToggle = (locatedItems) => {
  const toggle = document.getElementById(MAP_GROUP_TOGGLE_ID);
  if (!toggle || toggle.__olxGroupBound) {
    return;
  }
  toggle.__olxGroupBound = true;

  toggle.addEventListener("change", () => {
    state.mapGroupingEnabled = Boolean(toggle.checked);
    renderLeafletMap(locatedItems, state.mapGroupingEnabled);
  });
};

const bindPriceColorToggle = (locatedItems) => {
  const toggle = document.getElementById(MAP_PRICE_COLOR_TOGGLE_ID);
  if (!toggle || toggle.__olxPriceColorBound) {
    return;
  }
  toggle.__olxPriceColorBound = true;

  toggle.addEventListener("change", () => {
    state.mapPriceColoringEnabled = Boolean(toggle.checked);
    renderLeafletMap(locatedItems, state.mapGroupingEnabled);
  });
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
  modal.style.maxHeight = "98vh";
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

export const observeUi = () => {
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
