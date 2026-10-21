import { keepGraphqlNodesDespiteErrors } from "./preselect";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isBynderGraphql(url: string): boolean {
  return url.includes("/api/graphql") || /\/graphql(\?|$)/.test(url);
}

/**
 * Compact View 6.0.1's `getAssetsById` query selects `files` twice on Asset
 * (once in `DisplayAsset`, once beside it). Bynder rejects that query, so
 * `selectedAssets` comes back empty while search still works.
 */
export function rewriteGetAssetsByIdQuery(query: string): string {
  if (!query.includes("getAssetsById")) return query;
  return query.replace(/(\.\.\.DisplayAsset)\s+files\b/g, "$1");
}

function initQuery(init?: RequestInit): string {
  if (!init || typeof init.body !== "string") return "";
  try {
    const parsed = JSON.parse(init.body) as { query?: unknown };
    return typeof parsed.query === "string" ? parsed.query : "";
  } catch {
    return "";
  }
}

function graphqlErrorMessages(json: unknown): string[] {
  const errors = (json as { errors?: { message?: string }[] } | null)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((error) => error?.message ?? "Unknown GraphQL error");
}

function rewriteGraphqlInit(init?: RequestInit): RequestInit | undefined {
  if (!init || typeof init.body !== "string") return init;
  try {
    const parsed = JSON.parse(init.body) as { query?: unknown };
    if (typeof parsed.query !== "string") return init;
    const query = rewriteGetAssetsByIdQuery(parsed.query);
    if (query === parsed.query) return init;
    return { ...init, body: JSON.stringify({ ...parsed, query }) };
  } catch {
    return init;
  }
}

/** Drop null `nodes` entries. Compact View sorts `node.id` and throws on null, which aborts preselect. */
export function withoutNullNodes(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const data = (json as { data?: { nodes?: unknown } }).data;
  if (!data || !Array.isArray(data.nodes) || data.nodes.every(Boolean)) return json;
  return {
    ...(json as object),
    data: { ...data, nodes: data.nodes.filter(Boolean) },
  };
}

let patchedFetch: typeof window.fetch | undefined;

/** Compact View 6.0.1: `errors !== undefined` discards `data.nodes`. Install before Compact View fetches. */
export function installCompactViewGraphqlPatch(): () => void {
  if (patchedFetch) return () => undefined;
  const original = window.fetch.bind(window);
  patchedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const nextInit = isBynderGraphql(requestUrl(input)) ? rewriteGraphqlInit(init) : init;
    if (initQuery(nextInit).includes("getAssetsById") && nextInit && typeof nextInit.body === "string") {
      try {
        const parsed = JSON.parse(nextInit.body) as { variables?: { ids?: unknown } };
        console.info(
          "[bynder-picker] getAssetsById lookup. Compact View hashed the raw media ids.",
          parsed.variables?.ids,
        );
      } catch {
        // The request still goes out. This log is only for the popup console.
      }
    }
    const response = await original(input, nextInit);
    if (!isBynderGraphql(requestUrl(input))) return response;
    try {
      const json: unknown = await response.clone().json();
      const next = keepGraphqlNodesDespiteErrors(withoutNullNodes(json));
      if (next === json) {
        if (initQuery(nextInit).includes("getAssetsById")) {
          const errors = graphqlErrorMessages(json);
          if (errors.length) console.info("[bynder-picker] getAssetsById was rejected", errors);
        }
        return response;
      }
      console.info("[bynder-picker] Compact View getAssetsById response kept for preselect");
      return new Response(JSON.stringify(next), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return response;
    }
  };
  window.fetch = patchedFetch;
  return () => undefined;
}
