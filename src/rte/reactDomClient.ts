import ReactDOM from "react-dom";

type Root = {
  render: (node: React.ReactNode) => void;
  unmount: () => void;
};

type LegacyRoot = typeof ReactDOM & {
  render?: (node: React.ReactNode, container: Element) => void;
  unmountComponentAtNode?: (container: Element) => boolean;
  createRoot?: (container: Element) => Root;
};

/** The editor provides `react-dom`, which is where `createRoot` lives in its build. */
export function createRoot(container: Element): Root {
  const legacy = ReactDOM as LegacyRoot;
  if (typeof legacy.createRoot === "function") return legacy.createRoot(container);
  return {
    render(node) {
      legacy.render?.(node, container);
    },
    unmount() {
      legacy.unmountComponentAtNode?.(container);
    },
  };
}
