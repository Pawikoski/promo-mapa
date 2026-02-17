export const tryParseJson = (value) => {
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

export const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const safeJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[nie mozna zserializowac obiektu]";
  }
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sanitizeHtml = (rawHtml) => {
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

export const truncateHtmlPreserveTags = (rawHtml, maxChars) => {
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
