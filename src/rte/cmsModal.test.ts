import { describe, expect, it } from "vitest";
import { createFullscreenSession, type FullscreenBridge } from "./cmsModal";

function bridge(overrides: Partial<FullscreenBridge> = {}): FullscreenBridge {
  return {
    send: async () => undefined,
    editorAlreadyFullscreen: () => false,
    snapshotHtml: () => "<p>editor</p>",
    snapshotStyles: () => "<style></style>",
    extra: () => ({ dom: "replaced", keep: true }),
    stylesAlreadySent: () => false,
    markStylesSent: () => undefined,
    ...overrides,
  };
}

describe("CMS fullscreen session", () => {
  it("copies the field, then expands, and lets the snapshot dom win over extra props", async () => {
    const sent: Array<[string, unknown]> = [];
    let stylesSent = false;
    const session = createFullscreenSession(() =>
      bridge({
        send: async (name, data) => {
          sent.push([name, data]);
        },
        stylesAlreadySent: () => stylesSent,
        markStylesSent: () => {
          stylesSent = true;
        },
      })
    );
    await session.open();
    expect(sent).toEqual([
      ["DOMCopy", { dom: "<p>editor</p>", keep: true, styles: "<style></style>" }],
      ["goFullscreen", { open: true }],
    ]);
    await session.close();
    expect(sent[2]).toEqual(["goFullscreen", { open: false }]);
  });

  it("keeps the CMS expanded until the outer dialog closes", async () => {
    const sent: string[] = [];
    const session = createFullscreenSession(() =>
      bridge({
        send: async (name, data) => {
          sent.push(`${name}:${JSON.stringify(data)}`);
        },
      })
    );
    await session.open();
    await session.open();
    await session.close();
    expect(sent.filter((entry) => entry.startsWith("goFullscreen"))).toEqual(['goFullscreen:{"open":true}']);
    await session.close();
    expect(sent.filter((entry) => entry.startsWith("goFullscreen"))).toEqual([
      'goFullscreen:{"open":true}',
      'goFullscreen:{"open":false}',
    ]);
  });

  it("does not leave fullscreen open when the dialog closes before the request finishes", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: unknown[] = [];
    const session = createFullscreenSession(() =>
      bridge({
        send: async (name, data) => {
          sent.push(data ?? name);
          if (name === "DOMCopy") await gate;
        },
      })
    );
    const opening = session.open();
    const closing = session.close();
    release();
    await opening;
    await closing;
    expect(sent).not.toContainEqual({ open: true });
  });

  it("undoes an expand that resolves after the dialog has closed", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: unknown[] = [];
    const session = createFullscreenSession(() =>
      bridge({
        snapshotHtml: () => undefined,
        send: async (name, data) => {
          sent.push(data ?? name);
          if (name === "goFullscreen" && (data as { open?: boolean }).open === true) await gate;
        },
      })
    );
    const opening = session.open();
    await Promise.resolve();
    const closing = session.close();
    release();
    await opening;
    await closing;
    expect(sent).toEqual([{ open: true }, { open: false }]);
  });

  it("leaves the editor's own fullscreen mode in place", async () => {
    const sent: unknown[] = [];
    const session = createFullscreenSession(() =>
      bridge({
        editorAlreadyFullscreen: () => true,
        send: async (_name, data) => {
          sent.push(data);
        },
      })
    );
    await session.open();
    await session.close();
    expect(sent).not.toContainEqual({ open: false });
  });

  it("still expands when the field snapshot is rejected", async () => {
    const sent: string[] = [];
    const session = createFullscreenSession(() =>
      bridge({
        send: async (name) => {
          sent.push(name);
          if (name === "DOMCopy") throw new Error("too large");
        },
      })
    );
    await session.open();
    expect(sent).toEqual(["DOMCopy", "goFullscreen"]);
    await session.close();
    expect(sent).toEqual(["DOMCopy", "goFullscreen", "goFullscreen"]);
  });

  it("does not collapse the editor when expand is rejected", async () => {
    const sent: string[] = [];
    const session = createFullscreenSession(() =>
      bridge({
        send: async (name) => {
          sent.push(name);
          if (name === "goFullscreen") throw new Error("unsupported");
        },
      })
    );
    await session.open();
    await session.close();
    expect(sent).toEqual(["DOMCopy", "goFullscreen"]);
  });
});
