import ContentstackAppSDK, { PluginBuilder } from "@contentstack/app-sdk";
import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";
import type { AppInstallationConfig } from "../lib/types";
import { RTE_ELEMENT_TYPE, joinRteAttrs, splitRteAttrs } from "../lib/rteDisplay";
import bynderIconUrl from "../../assets/bynder_thumb.png";
import { openAssetEditor } from "./AssetEditorModal";
import { BynderRteNode } from "./BynderRteNode";
import { ensureEditorStyles } from "./editorStyles";
import { readRteRenderArgs } from "./renderArgs";

const BynderIcon = (
  <img src={bynderIconUrl} alt="" width={18} height={18} style={{ display: "block" }} />
);

async function editorConfig(rte: IRteParam): Promise<{ appConfig: AppInstallationConfig; fieldConfig: unknown }> {
  let appConfig: AppInstallationConfig = {};
  try {
    appConfig = (await rte.sdk.getConfig()) as AppInstallationConfig;
  } catch {
    appConfig = {};
  }
  return { appConfig, fieldConfig: rte.getConfig() };
}

function insertBynder(rte: IRteParam, attrs: Record<string, unknown>) {
  const node = { type: RTE_ELEMENT_TYPE, attrs, children: [{ text: "" }] };
  const inline = Boolean(splitRteAttrs(attrs).display.inline);
  if (!inline) {
    rte.insertNode(node, { select: true });
    return;
  }
  rte.insertNode(
    {
      type: "p",
      attrs: { style: { display: "inline-block", overflow: "hidden" }, classname: "bynder" },
      children: [{ text: "" }, node, { text: "" }],
    },
    { select: true }
  );
}

const bynderPlugin = new PluginBuilder(RTE_ELEMENT_TYPE)
  .title("Bynder")
  .icon(BynderIcon)
  .display(["toolbar", "hoveringToolbar"])
  .elementType((element) => (element.attrs?.display?.inline ? ["inline", "void"] : ["void"]))
  .render((...args: unknown[]) => {
    const model = readRteRenderArgs(...args);
    return (
      <BynderRteNode
        attrs={model.attrs}
        path={model.path}
        rte={model.rte}
        attributes={model.attributes}
        slateChildren={model.children}
      />
    );
  })
  .on("exec", (rte) => {
    ensureEditorStyles();
    void editorConfig(rte).then(async ({ appConfig, fieldConfig }) => {
      const payload = await openAssetEditor({
        appConfig,
        fieldConfig,
        initialValue: null,
        title: "Insert Bynder asset",
        confirmLabel: "Insert",
      });
      if (!payload) return;
      insertBynder(rte, joinRteAttrs(payload, {}));
    });
  })
  .build();

/** Same entry as the Highlight marketplace plugin: SystemJS default export of registerRTEPlugins. */
export default ContentstackAppSDK.registerRTEPlugins(bynderPlugin);
