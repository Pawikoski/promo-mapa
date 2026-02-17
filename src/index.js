import { TARGET_URL } from "./constants.js";
import { tryParseJson } from "./utils.js";
import { logOffers, logPrerenderedOffers, setRenderModalRowsFn } from "./offers.js";
import { observeUi, renderModalRows } from "./ui.js";

setRenderModalRowsFn(renderModalRows);

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
// window.fetch = async (...args) => {
//   const response = await originalFetch(...args);
//   const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
//   const requestMethod =
//     (args[1]?.method || args[0]?.method || "GET").toUpperCase();

//   if (requestMethod === "POST" && isTargetGraphql(requestUrl)) {
//     response
//       .clone()
//       .json()
//       .then(logOffers)
//       .catch(() => {});
//   }

//   return response;
// };

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
