/** Vite `base`, always with a trailing slash. */
export function withTrailingSlash(base: string): string {
  if (!base || base === "/") return "/";
  return base.endsWith("/") ? base : `${base}/`;
}

export function routerBasenameFrom(base: string): string {
  return withTrailingSlash(base).replace(/\/$/, "");
}

export function joinAppPath(base: string, path: string): string {
  return `${withTrailingSlash(base)}${path.replace(/^\//, "")}`;
}

export function appBase(): string {
  return withTrailingSlash(import.meta.env.BASE_URL || "/");
}

/** Empty at domain root; `/contentstack-bynder-app` on GitHub project Pages. */
export function routerBasename(): string {
  return routerBasenameFrom(appBase());
}

/** Picker popup (`/picker` or `/picker.html`), including a Vite `base` prefix. */
export function isPickerPath(pathname: string): boolean {
  return /(?:^|\/)picker(?:\.html)?\/?$/.test(pathname);
}

/**
 * Directory URL of the JSON RTE plugin script.
 * Inside Contentstack the plugin runs on rte-extension.contentstack.com, so
 * `window.location` is not this app. `import.meta.url` still points at json-rte.js.
 */
export function publicRootFromModuleUrl(moduleUrl: string): string | undefined {
  try {
    const url = new URL(moduleUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.pathname.endsWith("/json-rte.js")) return undefined;
    return `${url.origin}${url.pathname.slice(0, -"json-rte.js".length)}`;
  } catch {
    return undefined;
  }
}

/**
 * Directory of json-rte.js. The module URL wins. A resource-timing URL is the
 * fallback when the bundler does not expose import.meta.url.
 * The RTE bundle's Vite base is `/`, so a same-origin script under a Pages
 * subpath must still win over that base.
 */
export function pluginRoot(moduleUrl: string, resourceUrls: readonly string[] = []): string | undefined {
  const fromModule = publicRootFromModuleUrl(moduleUrl);
  if (fromModule) return fromModule;
  let found: string | undefined;
  for (const candidate of resourceUrls) {
    const root = publicRootFromModuleUrl(candidate);
    if (root) found = root;
  }
  return found;
}

/** Absolute URL for an app route such as `picker.html?id=…`. */
export function resolveAppHref(
  path: string,
  moduleUrl: string,
  documentOrigin: string,
  base: string,
  resourceUrls: readonly string[] = []
): string {
  const root = pluginRoot(moduleUrl, resourceUrls);
  const relative = path.replace(/^\//, "");
  if (root) return new URL(relative, root).href;
  return new URL(joinAppPath(base, path), documentOrigin).href;
}

function currentModuleUrl(): string {
  try {
    return import.meta.url;
  } catch {
    return "";
  }
}

function loadedResourceUrls(): string[] {
  try {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return [];
    return performance.getEntriesByType("resource").map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function appHref(path: string): string {
  return resolveAppHref(path, currentModuleUrl(), window.location.origin, appBase(), loadedResourceUrls());
}

export function publicAsset(file: string): string {
  return joinAppPath(appBase(), file);
}
