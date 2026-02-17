import {
  TARGET_URL,
  FRIENDLY_LINKS_API,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  LISTING_SEARCH_QUERY
} from "./constants.js";
import { state } from "./state.js";
import { upsertOffers } from "./offers.js";
import { extractOffersFromPayload } from "./offers.js";
import { addOffersSequentiallyToMap, setMapStatus } from "./map.js";

const buildSearchParametersFromFriendlyLinks = (friendlyLinksResponse, options = {}) => {
  const sourceData = friendlyLinksResponse?.data;
  const searchParameters = [];
  const offset = options.offset ?? DEFAULT_OFFSET;
  const limit = options.limit ?? DEFAULT_LIMIT;

  searchParameters.push({ key: "offset", value: String(offset) });
  searchParameters.push({ key: "limit", value: String(limit) });

  if (sourceData && typeof sourceData === "object") {
    for (const [key, value] of Object.entries(sourceData)) {
      if (value == null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          const item = value[i];
          if (item == null) {
            continue;
          }
          searchParameters.push({
            key: `${key}[${i}]`,
            value: String(item)
          });
        }
        continue;
      }
      searchParameters.push({
        key,
        value: String(value)
      });
    }
  }

  if (options.lastSeenId != null) {
    searchParameters.push({ key: "last_seen_id", value: String(options.lastSeenId) });
  }
  if (options.sl != null) {
    searchParameters.push({ key: "sl", value: String(options.sl) });
  }

  return searchParameters;
};

const buildListingSearchPayload = (friendlyLinksResponse, options = {}) => ({
  query: LISTING_SEARCH_QUERY,
  variables: {
    searchParameters: buildSearchParametersFromFriendlyLinks(friendlyLinksResponse, options),
    fetchJobSummary: false,
    fetchPayAndShip: true
  }
});

const getCookieValue = (cookieName) => {
  const prefix = `${cookieName}=`;
  const pairs = document.cookie ? document.cookie.split("; ") : [];
  for (const pair of pairs) {
    if (pair.startsWith(prefix)) {
      return pair.slice(prefix.length);
    }
  }
  return "";
};

const getPaginationContext = () => {
  const params = new URLSearchParams(window.location.search);
  const pageRaw = params.get("page");
  const pageNum = Number(pageRaw);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const offset = (page - 1) * DEFAULT_LIMIT;

  const lastSeenId = params.get("min_id") || null;
  let sl = params.get("sl") || null;

  if (!sl) {
    const onapCookie = decodeURIComponent(getCookieValue("onap") || "");
    if (onapCookie) {
      const firstSegment = onapCookie.split("-")[0]?.trim();
      if (firstSegment) {
        sl = firstSegment;
      }
    }
  }

  return { offset, limit: DEFAULT_LIMIT, lastSeenId, sl };
};

const toAbsoluteUrl = (href) => {
  if (typeof href !== "string" || !href.trim()) {
    return null;
  }
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return null;
  }
};

const extractNextHrefFromResponse = (payload) => {
  const candidates = [
    payload?.data?.clientComptabileListings?.links?.next?.href,
    payload?.data?.clientCompatibleListings?.links?.next?.href,
    payload?.links?.next?.href,
    payload?.data?.links?.next?.href
  ];

  for (const href of candidates) {
    const absolute = toAbsoluteUrl(href);
    if (absolute) {
      return absolute;
    }
  }

  return null;
};

const fetchJsonFromUrl = async (url) => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`request failed (${response.status}) for ${url}`);
  }

  return response.json();
};

const followNextLinks = async (initialPayload) => {
  const maxIterations = 5;
  let nextUrl = extractNextHrefFromResponse(initialPayload);
  let iteration = 0;

  while (nextUrl && iteration < maxIterations) {
    iteration += 1;
    const responsePayload = await fetchJsonFromUrl(nextUrl);
    const added = upsertOffers(extractOffersFromPayload(responsePayload), `next-${iteration}`, {
      skipRender: true
    });
    await addOffersSequentiallyToMap(added, 5);
    console.log(`OLX next request #${iteration} url:`, nextUrl);
    console.log(`OLX next request #${iteration} response:`, responsePayload);
    nextUrl = extractNextHrefFromResponse(responsePayload);
  }

  return iteration;
};

export const fetchFriendlyLinks = async () => {
  const pathSegments = window.location.pathname
    .split("/")
    .filter(Boolean);
  const friendlyPath = pathSegments.join(",");

  const params = new URLSearchParams(window.location.search);
  params.delete("reason");
  if (params.has("min_id") && !params.has("page")) {
    params.set("page", "2");
  }
  const queryString = params.toString();
  const endpointByPath = `${FRIENDLY_LINKS_API}${friendlyPath}/${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(endpointByPath, {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`friendly-links request failed (${response.status})`);
  }

  return response.json();
};

export const handleLoadClick = async () => {
  if (state.loadInProgress) {
    return;
  }
  state.loadInProgress = true;

  try {
    const response1 = await fetchFriendlyLinks();
    console.log("OLX friendly-links response:", response1);

    const paginationContext = getPaginationContext();
    const request2Payload = buildListingSearchPayload(response1, paginationContext);
    console.log("OLX graphql ListingSearchQuery payload:", request2Payload);
    const graphqlResponse = await fetch(TARGET_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-client": "DESKTOP"
      },
      body: JSON.stringify(request2Payload)
    });

    if (!graphqlResponse.ok) {
      throw new Error(`graphql request failed (${graphqlResponse.status})`);
    }

    const response2 = await graphqlResponse.json();
    upsertOffers(extractOffersFromPayload(response2), "graphql-load");
    console.log("OLX graphql ListingSearchQuery response:", response2);
    const nextRequestsCount = await followNextLinks(response2);
    setMapStatus(
      `Wyslano request #2 do GraphQL. Dodatkowe requesty po next.href: ${nextRequestsCount} (max 5).`
    );
  } catch (error) {
    console.error("OLX load button error:", error);
    setMapStatus("Nie udalo sie pobrac danych lub wykonac requestu GraphQL.");
  } finally {
    state.loadInProgress = false;
  }
};
