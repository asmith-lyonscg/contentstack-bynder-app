type PostRobot = {
  sendToParent: (name: string, data?: unknown) => Promise<unknown>;
};

type CmsWindow = Window & {
  postRobot?: PostRobot;
  iframeRef?: HTMLElement;
  isStyleSend?: boolean;
  getExtraProps?: () => Record<string, unknown>;
};

type SnapshotElement = HTMLElement & {
  getInnerHTML?: (options?: { includeShadowRoots?: boolean }) => string;
};

export type FullscreenBridge = {
  send: (name: string, data?: unknown) => Promise<unknown>;
  editorAlreadyFullscreen: () => boolean;
  snapshotHtml: () => string | undefined;
  snapshotStyles: () => string | undefined;
  extra: () => Record<string, unknown> | undefined;
  stylesAlreadySent: () => boolean;
  markStylesSent: () => void;
};

/**
 * Contentstack expands the RTE iframe when it receives DOMCopy and goFullscreen.
 * Calls are queued so a nested dialog does not close the outer one, and a close
 * that wins the race undoes an open that has already been sent.
 */
export function createFullscreenSession(getBridge: () => FullscreenBridge | undefined) {
  let depth = 0;
  let tail: Promise<void> = Promise.resolve();
  let fullscreenOpen = false;
  let preserveEditorFullscreen = false;

  async function requestOpen() {
    if (depth === 0 || fullscreenOpen) return;
    const bridge = getBridge();
    if (!bridge) return;
    const preserve = bridge.editorAlreadyFullscreen();
    try {
      const dom = bridge.snapshotHtml();
      if (dom) {
        let extra: Record<string, unknown> | undefined;
        try {
          const value = bridge.extra();
          if (value && typeof value === "object") extra = value;
        } catch {
          extra = undefined;
        }
        const payload: { dom: string; styles?: string } = { ...extra, dom };
        if (!bridge.stylesAlreadySent()) {
          try {
            const styles = bridge.snapshotStyles();
            if (styles) payload.styles = styles;
          } catch {
            delete payload.styles;
          }
        }
        await bridge.send("DOMCopy", payload);
        if (payload.styles) bridge.markStylesSent();
      }
    } catch {
      // The field snapshot is optional. Fullscreen can still be requested.
    }
    if (depth === 0) return;
    try {
      await bridge.send("goFullscreen", { open: true });
    } catch {
      return;
    }
    if (depth === 0) {
      if (!preserve) {
        try {
          await bridge.send("goFullscreen", { open: false });
        } catch {
          // The dialog is already gone.
        }
      }
      return;
    }
    fullscreenOpen = true;
    preserveEditorFullscreen = preserve;
  }

  async function requestClose() {
    if (depth > 0 || !fullscreenOpen) return;
    fullscreenOpen = false;
    const preserve = preserveEditorFullscreen;
    preserveEditorFullscreen = false;
    if (preserve) return;
    const bridge = getBridge();
    if (!bridge) return;
    try {
      await bridge.send("goFullscreen", { open: false });
    } catch {
      // The in-iframe dialog is already gone.
    }
  }

  function enqueue(task: () => Promise<void>) {
    tail = tail.then(task).catch(() => undefined);
    return tail;
  }

  return {
    open() {
      depth += 1;
      return enqueue(() => requestOpen());
    },
    close() {
      depth = Math.max(0, depth - 1);
      return enqueue(() => requestClose());
    },
  };
}

function cmsWindow(): CmsWindow {
  return window as CmsWindow;
}

function snapshotHtml(element: SnapshotElement): string | undefined {
  try {
    if (typeof element.getInnerHTML === "function") {
      return element.getInnerHTML({ includeShadowRoots: true });
    }
    return element.innerHTML;
  } catch {
    return undefined;
  }
}

function snapshotStyles(): string | undefined {
  try {
    let styles = "";
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const node = sheet.ownerNode;
        if (node instanceof Element) styles += node.outerHTML;
      } catch {
        // A cross-origin sheet cannot be read.
      }
    }
    return styles || undefined;
  } catch {
    return undefined;
  }
}

function snapshotTarget(modalHost: HTMLElement | undefined): SnapshotElement | undefined {
  const editor = document.getElementById("scrte-editor");
  if (editor && (!modalHost || !editor.contains(modalHost))) return editor;
  const ref = cmsWindow().iframeRef;
  if (
    ref &&
    ref !== document.body &&
    ref !== document.documentElement &&
    (!modalHost || !ref.contains(modalHost))
  ) {
    return ref;
  }
  return undefined;
}

function extraProps(): Record<string, unknown> | undefined {
  const read = cmsWindow().getExtraProps;
  if (typeof read !== "function") return undefined;
  try {
    const value = read();
    if (value && typeof value === "object") return value;
  } catch {
    return undefined;
  }
  return undefined;
}

let activeHost: HTMLElement | undefined;

function liveBridge(): FullscreenBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const host = cmsWindow();
  const postRobot = host.postRobot;
  if (!postRobot?.sendToParent) return undefined;
  return {
    send: (name, data) => postRobot.sendToParent(name, data),
    editorAlreadyFullscreen: () =>
      document.getElementById("scrte-editor")?.classList.contains("fullscreen") ?? false,
    snapshotHtml: () => {
      const target = snapshotTarget(activeHost);
      return target ? snapshotHtml(target) : undefined;
    },
    snapshotStyles,
    extra: extraProps,
    stylesAlreadySent: () => host.isStyleSend === true,
    markStylesSent: () => {
      host.isStyleSend = true;
    },
  };
}

const session = createFullscreenSession(liveBridge);

/** Ask Contentstack to cover the entry with this dialog. The in-iframe dialog stays if the host cannot expand. */
export function openCmsFullscreen(modalHost: HTMLElement): Promise<void> {
  activeHost = modalHost;
  return session.open();
}

export function closeCmsFullscreen(): Promise<void> {
  return session.close();
}
