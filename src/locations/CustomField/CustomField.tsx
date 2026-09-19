import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompactPicker } from "../../components/CompactPicker";
import { CropFocalEditor } from "../../components/CropFocalEditor";
import { InfoTooltip } from "../../components/InfoTooltip";
import { TransformForm } from "../../components/TransformForm";
import { useAppConfig, useAppSdk } from "../../common/hooks/useAppSdk";
import { useFieldFrameHeight } from "../../common/hooks/useFieldFrameHeight";
import {
  applyPickerSelection,
  assetFromSettings,
  normalizeCompactAssets,
  parseBynderAsset,
  parseBynderAssets,
  slimPersistedAssets,
} from "../../lib/bynder/parseAsset";
import { listThumbForAsset, LIST_THUMB_DESKTOP, LIST_THUMB_MOBILE } from "../../lib/bynder/assetUi";
import { roundCoord } from "../../lib/bynder/composeDatUrl";
import {
  applyCropConfig,
  applyCropConfigToAssetCrop,
  applyCropConfigToAssets,
  cropPreset,
  readFieldConfig,
  resolveCompactViewConfig,
  resolveCropConfig,
  resolveEnableDat,
  seedAssetCrop,
} from "../../lib/fieldConfig";
import { fetchBypassAccessToken, reportAssetUsage } from "../../lib/oauth/client";
import { resolvePersistKeys } from "../../lib/persistKeys";
import {
  asSavedAssets,
  buildSettingsPayload,
  defaultTransform,
  parseSavedSettings,
  persistedPayload,
  stashActiveCrop,
} from "../../lib/settings";
import type { BynderImageSettings, FocalPoint, ParsedBynderAsset, SavedBynderAsset, ViewportKind } from "../../lib/types";
import {
  cropSliceForAsset,
  resolveActiveViewport,
  savedAssetById,
  viewportCrop,
  withoutDesktopMobile,
  withoutMobileCrop,
} from "../../lib/viewportCrop";
import "./CustomField.css";

function percent(value: number): string {
  return String(Math.round(value * 1000) / 10);
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.54.54l1.96-1.96a5 5 0 0 0-7.07-7.07L11.17 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54L4.5 12.42a5 5 0 0 0 7.07 7.07L13 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UnlinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.54.54l1.96-1.96a5 5 0 1 0-7.07-7.07"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54L4.5 12.42a5 5 0 0 0 7.07 7.07"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 4l16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function openTransformedPreview(url: string) {
  const popup = window.open(url, "bynder-dat-preview", "popup=yes,width=1280,height=860");
  if (!popup) window.open(url, "_blank", "noopener");
}

function pruneAssets(settings: BynderImageSettings, ids: string[]): SavedBynderAsset[] | undefined {
  if (!settings.assets?.length) return undefined;
  const keep = new Set(ids);
  const next = settings.assets.filter((asset) => keep.has(asset.id));
  return next.length ? next : undefined;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export default function CustomField() {
  const sdk = useAppSdk();
  const appConfig = useAppConfig();
  const customField = sdk?.location.CustomField;
  const fieldConfig = readFieldConfig(customField);
  const compact = useMemo(
    () => resolveCompactViewConfig(fieldConfig, appConfig),
    [fieldConfig, appConfig]
  );
  const configAllowsDat = useMemo(
    () => resolveEnableDat(fieldConfig, appConfig),
    [fieldConfig, appConfig]
  );
  const cropConfig = useMemo(
    () => resolveCropConfig(fieldConfig, appConfig),
    [fieldConfig, appConfig]
  );

  const [settings, setSettings] = useState<BynderImageSettings>(() => parseSavedSettings(null));
  const [assets, setAssets] = useState<ParsedBynderAsset[]>([]);
  const [assetReady, setAssetReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewUpdating, setPreviewUpdating] = useState(false);
  const [panelAsset, setPanelAsset] = useState<ParsedBynderAsset | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef("");
  const hydrated = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const focused = assets.find((item) => item.id === settings.activeAssetId) ?? null;
  const desktopMobileMode = cropConfig.desktopMobileMode !== false;
  const activeViewport = desktopMobileMode ? resolveActiveViewport(settings) : "desktop";
  const focusedSaved = savedAssetById(settings, focused?.id);
  const mobileDiverged = Boolean(desktopMobileMode && focusedSaved?.mobile);

  useEffect(() => {
    if (focused) {
      setPanelAsset(focused);
      return;
    }
    setPanelAsset((current) =>
      current && assets.some((item) => item.id === current.id) ? current : null
    );
  }, [assets, focused]);
  useFieldFrameHeight(sdk, shellRef, focused?.id, assets.length);
  const fallbackTransform = useMemo(
    () => applyCropConfig(defaultTransform(), cropConfig, "defaults", "desktop"),
    [cropConfig]
  );
  const fallbackMobileTransform = useMemo(
    () => applyCropConfig(defaultTransform(), cropConfig, "defaults", "mobile"),
    [cropConfig]
  );
  const viewportLocks = cropPreset(cropConfig, activeViewport);
  const thumbs = useMemo(() => {
    const next: Record<string, { desktop: ReturnType<typeof listThumbForAsset>; mobile: ReturnType<typeof listThumbForAsset> }> =
      {};
    for (const asset of assets) {
      const desktop = cropSliceForAsset(settings, asset.id, "desktop", fallbackTransform);
      const thumb = listThumbForAsset({
        asset,
        live: desktop,
        datAllowed: configAllowsDat,
        fallbackTransform,
        slot: LIST_THUMB_DESKTOP,
      });
      if (!desktopMobileMode) {
        next[asset.id] = { desktop: thumb, mobile: thumb };
        continue;
      }
      const mobile = cropSliceForAsset(settings, asset.id, "mobile", fallbackMobileTransform);
      next[asset.id] = {
        desktop: thumb,
        mobile: listThumbForAsset({
          asset,
          live: mobile,
          datAllowed: configAllowsDat,
          fallbackTransform: fallbackMobileTransform,
          slot: LIST_THUMB_MOBILE,
        }),
      };
    }
    return next;
  }, [assets, configAllowsDat, desktopMobileMode, fallbackMobileTransform, fallbackTransform, settings]);

  const persistKeys = useMemo(() => resolvePersistKeys(appConfig?.persistAssetKeys), [appConfig]);

  const persist = useCallback((next: BynderImageSettings) => {
    const viewport = desktopMobileMode ? resolveActiveViewport(next) : "desktop";
    const payload = buildSettingsPayload(
      {
        ...next,
        transform: applyCropConfig(next.transform, cropConfig, "locks", viewport),
        assets: applyCropConfigToAssets(next.assets, cropConfig, "locks"),
      },
      { persistAssetKeys: persistKeys, enableDat: configAllowsDat }
    );
    const prepared = desktopMobileMode ? payload : withoutDesktopMobile(payload);
    settingsRef.current = prepared;
    setSettings(prepared);
    return prepared;
  }, [configAllowsDat, cropConfig, desktopMobileMode, persistKeys]);

  const applyAssets = useCallback(
    (rawAssets: unknown[], nextFocusedId?: string) => {
      const source = settingsRef.current;
      const parsedList = parseBynderAssets(rawAssets);
      const ids = parsedList.map((item) => item.id);
      const focusedId =
        (nextFocusedId && ids.includes(nextFocusedId) ? nextFocusedId : undefined) ??
        (source.activeAssetId && ids.includes(source.activeAssetId) ? source.activeAssetId : undefined);
      const focusedAsset = focusedId ? parsedList.find((item) => item.id === focusedId) ?? null : null;
      const slimmed = slimPersistedAssets(rawAssets, persistKeys);
      const incoming = asSavedAssets(slimmed) ?? [];
      const previous = pruneAssets(stashActiveCrop(source, source.activeAssetId), ids) ?? [];
      const previousById = new Map(previous.map((asset) => [asset.id, asset]));
      const nextAssets: SavedBynderAsset[] = incoming.map((identity) => {
        const existing = previousById.get(identity.id);
        if (existing) {
          return applyCropConfigToAssetCrop(
            {
              ...existing,
              name: identity.name ?? existing.name,
              transformBaseUrl: identity.transformBaseUrl ?? existing.transformBaseUrl,
              webImage: identity.webImage ?? existing.webImage,
            },
            cropConfig,
            "locks"
          );
        }
        const parsed = parsedList.find((item) => item.id === identity.id);
        return {
          ...identity,
          ...seedAssetCrop(cropConfig, { width: parsed?.width, height: parsed?.height }),
          alt: identity.alt ?? parsed?.alt ?? "",
        };
      });
      const isNewAsset = Boolean(focusedAsset && focusedId && !previousById.has(focusedId));
      const isFirstPick = !source.assets?.length;
      const viewport =
        desktopMobileMode && focusedAsset && !isNewAsset && !nextFocusedId
          ? resolveActiveViewport(source)
          : "desktop";
      const savedCrop = focusedId ? viewportCrop(nextAssets.find((asset) => asset.id === focusedId), viewport) : undefined;
      const storedAlt = focusedId ? nextAssets.find((asset) => asset.id === focusedId)?.alt : undefined;
      const alt = focusedAsset
        ? typeof storedAlt === "string"
          ? storedAlt
          : focusedAsset.alt ?? ""
        : undefined;

      const payload = buildSettingsPayload(
        {
          ...source,
          alt,
          transform: focusedAsset
            ? applyCropConfig(
                savedCrop?.transform ?? source.transform,
                cropConfig,
                isFirstPick || isNewAsset ? "defaults" : "locks",
                viewport
              )
            : source.transform,
          focalPoint: focusedAsset
            ? savedCrop?.focalPoint ?? (isNewAsset ? { x: 0.5, y: 0.5 } : source.focalPoint)
            : source.focalPoint,
        },
        {
          assets: nextAssets,
          activeAssetId: focusedAsset?.id,
          activeViewport: focusedAsset && viewport === "mobile" ? "mobile" : undefined,
          persistAssetKeys: persistKeys,
          enableDat: configAllowsDat,
        }
      );
      const next = desktopMobileMode ? payload : withoutDesktopMobile(payload);
      settingsRef.current = next;
      setAssets(parsedList);
      setAssetReady(true);
      setSettings(next);
    },
    [configAllowsDat, cropConfig, desktopMobileMode, persistKeys]
  );

  const onCompactSelect = useCallback(
    (rawAssets: unknown[], additionalInfo?: unknown) => {
      if (!rawAssets.length) return;
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo, persistKeys);
      const current = settingsRef.current;
      const previousIds = new Set(parseBynderAssets(current.assets ?? []).map((item) => item.id));
      const incomingParsed = parseBynderAssets(incoming);
      const firstNew = incomingParsed.find((item) => !previousIds.has(item.id)) ?? incomingParsed[0];
      const nextRaw = applyPickerSelection({
        current: current.assets ?? [],
        incoming,
        mode: compact.mode,
        focusedId: focused?.id,
        maxLimit: compact.maxLimit,
      });
      applyAssets(nextRaw, firstNew?.id);
    },
    [applyAssets, compact.maxLimit, compact.mode, focused?.id, persistKeys]
  );

  const onCompactRemove = useCallback(
    (id: string) => {
      const remaining = (settingsRef.current.assets ?? []).filter((raw) => {
        const parsed = parseBynderAssets([raw])[0];
        return parsed && parsed.id !== id;
      });
      applyAssets(remaining);
    },
    [applyAssets]
  );

  const onFocusAsset = useCallback(
    (id: string, viewport?: ViewportKind) => {
      const parsed = assets.find((item) => item.id === id);
      if (!parsed) return;
      const source = settingsRef.current;
      const currentViewport = resolveActiveViewport(source);
      const nextViewport = desktopMobileMode ? viewport ?? (id === focused?.id ? currentViewport : "desktop") : "desktop";
      const sameThumb =
        id === focused?.id && (viewport == null || nextViewport === currentViewport);
      if (sameThumb) {
        persist({
          ...stashActiveCrop(source, focused.id),
          activeAssetId: undefined,
          activeViewport: undefined,
        });
        return;
      }
      const sameAsset = id === focused?.id;
      const stashed = stashActiveCrop(source, focused?.id);
      const crop = viewportCrop(savedAssetById(stashed, id), nextViewport);
      const storedAlt = savedAssetById(stashed, id)?.alt;
      persist({
        ...stashed,
        activeAssetId: id,
        activeViewport: nextViewport === "mobile" ? "mobile" : undefined,
        alt: sameAsset
          ? (typeof stashed.alt === "string" ? stashed.alt : storedAlt ?? parsed.alt ?? "")
          : (typeof storedAlt === "string" ? storedAlt : parsed.alt ?? ""),
        focalPoint: crop?.focalPoint ?? { x: 0.5, y: 0.5 },
        transform: sameAsset
          ? (crop?.transform ?? source.transform)
          : applyCropConfig(crop?.transform ?? source.transform, cropConfig, "locks", nextViewport),
      });
    },
    [assets, cropConfig, desktopMobileMode, focused?.id, persist]
  );

  const onMatchDesktopCrop = useCallback(() => {
    if (!focused) return;
    const source = settingsRef.current;
    const stashed = stashActiveCrop(source, focused.id);
    const current = savedAssetById(stashed, focused.id);
    const desktop = viewportCrop(current, "desktop");
    const nextAssets = (stashed.assets ?? []).map((asset) => {
      if (asset.id !== focused.id) return asset;
      const cleared = withoutMobileCrop(asset);
      return (cleared ?? asset) as SavedBynderAsset;
    });
    persist({
      ...stashed,
      assets: nextAssets,
      activeViewport: "mobile",
      focalPoint: desktop?.focalPoint ?? { x: 0.5, y: 0.5 },
      transform: applyCropConfig(desktop?.transform ?? source.transform, cropConfig, "locks", "mobile"),
    });
  }, [cropConfig, focused, persist]);

  const onCompactReorder = useCallback(
    (ids: string[]) => {
      const current = settingsRef.current.assets ?? [];
      const byId = new Map<string, unknown>();
      for (const raw of current) {
        const parsed = parseBynderAsset(raw);
        if (parsed) byId.set(parsed.id, raw);
      }
      const next = ids.map((id) => byId.get(id)).filter((item): item is unknown => item != null);
      if (next.length !== current.length) return;
      applyAssets(next);
    },
    [applyAssets]
  );

  useEffect(() => {
    if (!customField || hydrated.current) return;
    try {
      const raw = customField.field.getData();
      const saved = parseSavedSettings(raw);
      const isNew = !saved.assets?.length;
      saved.transform = applyCropConfig(
        saved.transform,
        cropConfig,
        isNew ? "defaults" : "locks",
        desktopMobileMode ? resolveActiveViewport(saved) : "desktop"
      );
      saved.assets = applyCropConfigToAssets(saved.assets, cropConfig, isNew ? "defaults" : "locks");
      const originalAssets = saved.assets;
      const slimmed = slimPersistedAssets(saved.assets, persistKeys);
      if (slimmed) saved.assets = asSavedAssets(slimmed);
      const prepared = desktopMobileMode ? saved : withoutDesktopMobile(saved);
      const serialized = safeJsonStringify(persistedPayload(prepared));
      const assetsNeedRewrite =
        Array.isArray(originalAssets) &&
        safeJsonStringify(originalAssets) !== safeJsonStringify(prepared.assets);
      const viewportNeedRewrite = !desktopMobileMode && serialized !== safeJsonStringify(persistedPayload(saved));
      lastSaved.current = assetsNeedRewrite || viewportNeedRewrite ? "" : serialized;
      settingsRef.current = prepared;
      setSettings(prepared);
      const parsedList = parseBynderAssets(prepared.assets);
      if (parsedList.length) setAssets(parsedList);
      else {
        const legacy = assetFromSettings(prepared);
        setAssets(legacy ? [legacy] : []);
      }
    } catch (error) {
      console.error("Bynder Image Settings hydrate failed", error);
    } finally {
      hydrated.current = true;
      setAssetReady(true);
    }
  }, [customField, cropConfig, desktopMobileMode, persistKeys]);

  useEffect(() => {
    if (!assetReady || !customField?.field) return undefined;
    const payload = persistedPayload(settings);
    const serialized = safeJsonStringify(payload);
    if (!serialized || serialized === lastSaved.current) return undefined;
    const timer = window.setTimeout(() => {
      try {
        const done = customField.field.setData(payload);
        lastSaved.current = serialized;
        if (done && typeof (done as Promise<unknown>).then === "function") {
          void (done as Promise<unknown>).catch((error) => {
            console.error("Bynder Image Settings setData failed", error);
          });
        }
      } catch (error) {
        console.error("Bynder Image Settings setData failed", error);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [assetReady, customField, settings]);

  useEffect(() => {
    if (!assetReady || !appConfig?.enableAssetTracker || !compact.loginBypass || !sdk?.ids?.installationUID) {
      return undefined;
    }
    const report = () => {
      const assetIds = parseBynderAssets(settingsRef.current.assets)
        .map((item) => item.id)
        .filter(Boolean);
      const ids = sdk.ids as { installationUID?: string; entry?: string; contentType?: string; stack?: string };
      if (!assetIds.length || !ids.entry) return;
      void reportAssetUsage({
        installationUid: ids.installationUID ?? "",
        assetIds,
        uri: `contentstack://${ids.stack ?? "stack"}/${ids.contentType ?? "entry"}/${ids.entry}`,
      }).catch(() => undefined);
    };
    try {
      const entry = customField?.entry as
        | {
            on?: (event: string, cb: () => void) => unknown;
            off?: (event: string, cb: () => void) => unknown;
          }
        | undefined;
      if (typeof entry?.on !== "function") return undefined;
      entry.on("save", report);
      return () => {
        try {
          entry.off?.("save", report);
        } catch {
          /* ignore */
        }
      };
    } catch (error) {
      console.error("Bynder Image Settings asset tracker hook failed", error);
      return undefined;
    }
  }, [appConfig?.enableAssetTracker, assetReady, compact.loginBypass, customField, sdk]);

  const panel = focused ?? panelAsset;
  const hasDatUrl = Boolean(panel?.transformBaseUrl);
  const datMissing = Boolean(focused && configAllowsDat && !hasDatUrl);
  const datActive = Boolean(configAllowsDat && hasDatUrl);
  const previewSrc = panel?.sourceUrl;
  const activeDatUrl = datActive
    ? cropSliceForAsset(settings, panel?.id, activeViewport, settings.transform).url
    : undefined;

  useEffect(() => {
    if (!datActive) {
      setPreviewUpdating(false);
      setPreviewUrl(undefined);
      return undefined;
    }
    if (activeDatUrl === previewUrl) {
      setPreviewUpdating(false);
      return undefined;
    }
    setPreviewUpdating(true);
    const timer = window.setTimeout(() => {
      setPreviewUrl(activeDatUrl);
      setPreviewUpdating(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [datActive, activeDatUrl, previewUrl]);

  const onFocalChange = (focalPoint: FocalPoint) => {
    persist(
      stashActiveCrop(
        {
          ...settings,
          focalPoint: { x: roundCoord(focalPoint.x), y: roundCoord(focalPoint.y) },
        },
        focused?.id
      )
    );
  };

  const onPercentChange = (axis: "x" | "y", raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onFocalChange({ ...settings.focalPoint, [axis]: n / 100 });
  };

  if (!customField) {
    return (
      <div className="bynder-settings" ref={shellRef}>
        <p className="notice">This view only works as a Custom Field location.</p>
      </div>
    );
  }

  if (!compact.portalUrl) {
    return (
      <div className="bynder-settings" ref={shellRef}>
        <div className="notice-card">
          <h3>Connect a Bynder portal</h3>
          <p>
            Set <code>bynderPortalUrl</code> in App Configuration, or override it on this field’s Config
            Parameter.
          </p>
          <pre>{`{
  "bynderPortalUrl": "acme.getbynder.com",
  "desktopMobileMode": true,
  "aspect": { "desktop": "16:9", "mobile": "9:16" },
  "width": { "desktop": 1200, "mobile": 390 },
  "lockAspect": true
}`}</pre>
        </div>
      </div>
    );
  }

  if (!assetReady) {
    return (
      <div className="bynder-settings" ref={shellRef}>
        <p className="notice">Loading…</p>
      </div>
    );
  }

  return (
    <div className="bynder-settings" ref={shellRef}>
      <header className="header">
        <div>
          <h2>Bynder image settings</h2>
          <p>
            {focused?.name
              ? `${focused.name}${assets.length > 1 ? ` · ${assets.length} assets` : ""}`
              : assets.length
                ? `${assets.length} asset${assets.length === 1 ? "" : "s"}`
                : "Pick a Bynder image, then set crop and focal point."}
          </p>
        </div>
      </header>

      <CompactPicker
        compact={compact}
        portalUrl={compact.portalUrl}
        assets={assets}
        thumbs={thumbs}
        focusedId={focused?.id}
        activeViewport={activeViewport}
        onFocus={onFocusAsset}
        onSelect={onCompactSelect}
        onRemove={onCompactRemove}
        onReorder={onCompactReorder}
        getAccessToken={
          compact.loginBypass && sdk?.ids?.installationUID
            ? () => fetchBypassAccessToken(sdk.ids.installationUID)
            : undefined
        }
        desktopMobileMode={desktopMobileMode}
      />

      <div
        className={`crop-editor-collapse${focused ? " is-open" : ""}`}
        aria-hidden={!focused}
      >
        <div className="crop-editor-collapse-inner">
      {previewSrc ? (
        <div className="crop-editor-frame">
          {datMissing ? (
            <div className="notice-card warning">
              <h3>DAT is unavailable for this image</h3>
              <p>
                DAT is enabled in config, but this Bynder payload has no <code>transformBaseUrl</code>.
                Using CSS crop and focal point until then.
              </p>
            </div>
          ) : null}

          {desktopMobileMode ? (
          <div className="viewport-toolbar">
            <div className="viewport-tabs" role="tablist" aria-label="Crop viewport">
              <button
                type="button"
                role="tab"
                aria-selected={activeViewport === "desktop"}
                className={activeViewport === "desktop" ? "is-active" : ""}
                onClick={() => focused && onFocusAsset(focused.id, "desktop")}
              >
                Desktop
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeViewport === "mobile"}
                className={activeViewport === "mobile" ? "is-active" : ""}
                onClick={() => focused && onFocusAsset(focused.id, "mobile")}
              >
                <span
                  className={mobileDiverged ? "viewport-link-icon is-broken" : "viewport-link-icon"}
                  title={mobileDiverged ? "Mobile does not match desktop" : "Mobile matches desktop"}
                  aria-hidden
                >
                  {mobileDiverged ? <UnlinkIcon /> : <LinkIcon />}
                </span>
                Mobile
              </button>
            </div>
            <p className="viewport-hint">
              {mobileDiverged ? (
                <>
                  <strong>Mobile does not match desktop.</strong>{" "}
                  <button type="button" className="linkish viewport-match" onClick={onMatchDesktopCrop}>
                    Revert mobile to match desktop
                  </button>
                </>
              ) : (
                <>
                  <strong>Mobile matches desktop</strong> unless you edit it on the Mobile tab.
                </>
              )}
            </p>
          </div>
          ) : null}

          <div className="editor-row">
            <aside className="editor-fields">
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">Crop &amp; focal point</span>
                  <InfoTooltip>
                    Drag the red dot, or click the image, to choose what stays in view when the image is
                    cropped. With more than one asset, this applies only to the highlighted thumbnail.
                  </InfoTooltip>
                </div>
                <label className="field">
                  <span>X %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={percent(settings.focalPoint.x)}
                    onChange={(event) => onPercentChange("x", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Y %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={percent(settings.focalPoint.y)}
                    onChange={(event) => onPercentChange("y", event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onFocalChange({ x: 0.5, y: 0.5 })}
                >
                  Reset center
                </button>
              </div>
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">{datActive ? "Transforms" : "Crop frame"}</span>
                  <InfoTooltip>
                    {datActive ? (
                      <>
                        Width and Height define the output box Bynder generates. When the image is cropped to
                        that box, the focal point decides which part of the photo is kept.
                      </>
                    ) : (
                      <>
                        Width and Height define the crop box your site should use. When the image is cropped to
                        that box, the focal point decides which part of the photo is kept.
                      </>
                    )}
                  </InfoTooltip>
                </div>
                <TransformForm
                  value={settings.transform}
                  datEnabled={datActive}
                  aspectPresets={cropConfig.aspectPresets}
                  datPresets={compact.datPresets}
                  hideFormat={cropConfig.hideFormat}
                  showOperation={cropConfig.showOperation}
                  showAspect={cropConfig.showAspect}
                  showQuality={cropConfig.showQuality}
                  showAdvancedQuery={cropConfig.showAdvancedQuery}
                  showDatPreset={cropConfig.showDatPreset}
                  locks={{
                    aspect: viewportLocks.lockAspect,
                    width: viewportLocks.lockWidth,
                    height: viewportLocks.lockHeight,
                    format: cropConfig.lockFormat,
                  }}
                  onChange={(transform) => persist(stashActiveCrop({ ...settings, transform }, focused?.id))}
                />
              </div>
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">Alt text</span>
                  <InfoTooltip>
                    Prefills from Bynder metadata in this order: alt_text, alttext, alt, then description. You
                    can overwrite it for this entry.
                  </InfoTooltip>
                </div>
                <textarea
                  className="alt-input"
                  rows={3}
                  value={settings.alt ?? ""}
                  disabled={!focused}
                  placeholder={focused ? "Describe the image" : "Pick an asset first"}
                  onChange={(event) =>
                    persist(stashActiveCrop({ ...settings, alt: event.target.value }, focused?.id))
                  }
                />
              </div>
            </aside>
            <section className="editor-preview">
              <CropFocalEditor
                key={`${panel?.id ?? ""}:${activeViewport}:${previewSrc}`}
                src={previewSrc}
                alt={panel?.name}
                focalPoint={settings.focalPoint}
                transform={settings.transform}
                onChange={onFocalChange}
              />
            </section>
          </div>

          {datActive && previewUrl ? (
            <div className="dat-preview-actions">
              <button type="button" className="linkish" onClick={() => openTransformedPreview(previewUrl)}>
                View transformed image
              </button>
              {previewUpdating ? <span className="dat-preview-status">Updating…</span> : null}
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  void navigator.clipboard.writeText(previewUrl).catch(() => undefined);
                }}
              >
                Copy DAT URL
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
