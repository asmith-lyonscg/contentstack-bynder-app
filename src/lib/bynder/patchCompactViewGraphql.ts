import { keepGraphqlNodesDespiteErrors } from "./preselect";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isBynderGraphql(url: string): boolean {
  return url.includes("/api/graphql") || /\/graphql(\?|$)/.test(url);
}

/** Compact View 6.0.1: `errors !== undefined` discards `data.nodes`. */
export function installCompactViewGraphqlPatch(): () => void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    if (!isBynderGraphql(requestUrl(input))) return response;
    try {
      const json: unknown = await response.clone().json();
      const next = keepGraphqlNodesDespiteErrors(json);
      if (next === json) return response;
      console.info("[bynder-picker] Compact View getAssetsById had GraphQL errors; keeping data.nodes");
      return new Response(JSON.stringify(next), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return response;
    }
  };
  return () => {
    window.fetch = original;
  };
}
