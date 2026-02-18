export const TARGET_URL = "https://www.olx.pl/apigateway/graphql";
export const MAP_BUTTON_ID = "olx-map-open-button";
export const MAP_MODAL_ID = "olx-map-modal";
export const MAP_LIST_ID = "olx-map-list";
export const MAP_CANVAS_ID = "olx-map-canvas";
export const MAP_STATUS_ID = "olx-map-status";
export const MAP_LOAD_BUTTON_ID = "olx-map-load-button";
export const MAP_GROUP_TOGGLE_ID = "olx-map-group-toggle";
export const MAP_PRICE_COLOR_TOGGLE_ID = "olx-map-price-color-toggle";
export const MAP_INLINE_CONTAINER_ID = "olx-map-inline-container";
export const FRIENDLY_LINKS_API = "https://www.olx.pl/api/v1/friendly-links/query-params/";
export const DEFAULT_LIMIT = 40;
export const DEFAULT_OFFSET = 0;
export const LISTING_SEARCH_QUERY = `
query ListingSearchQuery(
  $searchParameters: [SearchParameter!] = []
  $fetchJobSummary: Boolean = false
  $fetchPayAndShip: Boolean = false
) {
  clientCompatibleListings(searchParameters: $searchParameters) {
    __typename
    ... on ListingSuccess {
      __typename
      data {
        id
        title
        url
        description
        photos {
          link
          height
          rotation
          width
        }
        location {
          city {
            id
            name
            normalized_name
            _nodeId
          }
          district {
            id
            name
            normalized_name
            _nodeId
          }
          region {
            id
            name
            normalized_name
            _nodeId
          }
        }
        params {
          key
          name
          type
          value {
            __typename
            ... on GenericParam {
              key
              label
            }
            ... on PriceParam {
              value
              type
              label
              currency
              arranged
              budget
              negotiable
            }
          }
        }
        map {
          lat
          lon
          radius
          show_detailed
          zoom
        }
        jobSummary @include(if: $fetchJobSummary) {
          whyApply
          whyApplyTags
        }
        payAndShip @include(if: $fetchPayAndShip) {
          sellerPaidDeliveryEnabled
        }
      }
      links {
        next {
          href
        }
      }
    }
    ... on ListingError {
      __typename
      error {
        code
        detail
        status
        title
        validation {
          detail
          field
          title
        }
      }
    }
  }
}
`;
