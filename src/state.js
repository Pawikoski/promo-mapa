export const OFFER_STORE = new Map();

export const state = {
  leafletLoadPromise: null,
  markerClusterLoadPromise: null,
  leafletMap: null,
  leafletApi: null,
  leafletMarkerLayer: null,
  renderedOfferIds: new Set(),
  loadInProgress: false,
  mapGroupingEnabled: false,
  mapPriceColoringEnabled: true,
};
