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

/** Same-origin URL for an app route such as `picker?id=…`. */
export function appHref(path: string): string {
  return new URL(joinAppPath(appBase(), path), window.location.origin).href;
}

export function publicAsset(file: string): string {
  return joinAppPath(appBase(), file);
}
