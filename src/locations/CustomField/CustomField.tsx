import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetToolbar, CompactPicker } from "../../components/CompactPicker";
import { bynderMediaUrl } from "../../lib/bynder/assetUi";
import { CropFocalEditor } from "../../components/CropFocalEditor";
import { InfoTooltip } from "../../components/InfoTooltip";
import { TransformForm } from "../../components/TransformForm";
import { useAppConfig, useAppSdk } from "../../common/hooks/useAppSdk";
import { useFieldFrameHeight } from "../../common/hooks/useFieldFrameHeight";
import {
  applyPickerSelection,
  assetFromSettings,
  assetPixelSize,
  normalizeCompactAssets,
  parseBynderAsset,
  parseBynderAssets,
  slimPersistedAssets,
  isVideoAsset,
  isDocumentAsset,
} from "../../lib/bynder/parseAsset";
import { listThumbForAsset, LIST_THUMB_DESKTOP, LIST_THUMB_MOBILE } from "../../lib/bynder/assetUi";
import { datQueriesForSlice, joinDatUrl, roundCoord } from "../../lib/bynder/composeDatUrl";
import {
  applyCropConfig,
  applyCropConfigToAssetCrop,
  applyCropConfigToAssets,
  authorUsesScaleMode,
  coerceTransformForScaleMode,
  effectiveViewportLocks,
  readFieldConfig,
  resolveAdditionalFields,
  resolveCompactViewConfig,
  resolveCropConfig,
  resolveEnableDat,
  resolveVideoDefaults,
  resolveVideoFieldVisibility,
  seedAssetCrop,
} from "../../lib/fieldConfig";
import { resolvePersistPolicy } from "../../lib/persistKeys";
import {
  asSavedAsset,
  asSavedAssets,
  applyAuthorFields,
  buildSettingsPayload,
  defaultTransform,
  parseSavedSettings,
  persistedPayload,
  stashActiveCrop,
} from "../../lib/settings";
import type {
  AdditionalFieldDefinition,
  BynderImageSettings,
  FocalPoint,
  ParsedBynderAsset,
  SavedBynderAsset,
  VideoPlayback,
  ViewportKind,
} from "../../lib/types";
import {
  cropSliceForAsset,
  resolveActiveViewport,
  savedAssetById,
  viewportCrop,
  viewportCropsEqual,
  withoutDesktopMobile,
  withoutMobileCrop,
} from "../../lib/viewportCrop";
import "./CustomField.css";

function authorValues(asset: SavedBynderAsset | undefined): Record<string, string | number | boolean> | undefined {
  return asset?.additional;
}

function percent(value: number): string {
  return String(Math.round(value * 1000) / 10);
}

function assetIdentity(settings: BynderImageSettings): string {
  return (settings.assets ?? []).map((asset) => `${asset.id}:${asset.mobile?.id ?? ""}`).join("|");
}

function AdditionalFields({
  fields,
  values,
  onChange,
}: {
  fields: AdditionalFieldDefinition[];
  values?: Record<string, string | number | boolean>;
  onChange: (property: string, value: string | number | boolean | undefined) => void;
}) {
  if (!fields.length) return null;
  return (
    <div className="additional-fields">
      {fields.map((field) => {
        const current = values?.[field.property];
        if (field.type === "boolean") {
          return (
            <label key={field.property} className="video-option">
              <input
                type="checkbox"
                checked={current === true}
                onChange={(event) => onChange(field.property, event.target.checked)}
              />
              {field.label}
            </label>
          );
        }
        return (
          <label key={field.property} className="field">
            <span>{field.label}</span>
            <input
              type={field.type === "number" ? "number" : "text"}
              value={field.type === "number" ? (typeof current === "number" ? current : "") : typeof current === "string" ? current : ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (field.type === "number") {
                  if (raw === "") onChange(field.property, undefined);
                  else {
                    const next = Number(raw);
                    if (Number.isFinite(next)) onChange(field.property, next);
                  }
                  return;
                }
                onChange(field.property, raw);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

function carrySeparateMobile(current: unknown[], next: unknown[]): unknown[] {
  if (current.length !== next.length) return next;
  return next.map((raw, index) => {
    const prev = asSavedAsset(current[index]);
    if (!prev?.mobile?.id || !raw || typeof raw !== "object") return raw;
    const incomingId = asSavedAsset(raw)?.id;
    if (incomingId && incomingId === prev.id) return raw;
    return {
      ...(raw as Record<string, unknown>),
      differentMobileAsset: true,
      mobile: prev.mobile,
    };
  });
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? "crop-editor-chevron is-open" : "crop-editor-chevron"}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
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
  const videoDefaults = useMemo(() => resolveVideoDefaults(fieldConfig, appConfig), [fieldConfig, appConfig]);
  const videoFields = useMemo(() => resolveVideoFieldVisibility(fieldConfig, appConfig), [fieldConfig, appConfig]);
  const additionalFields = useMemo(
    () => resolveAdditionalFields(fieldConfig, appConfig),
    [fieldConfig, appConfig]
  );
  const playbackOptions = (
    [
      ["autoplay", "Autoplay"],
      ["muted", "Mute"],
      ["controls", "Show controls"],
      ["loop", "Loop"],
    ] as const
  ).filter(([key]) => videoFields[key]);

  const [settings, setSettings] = useState<BynderImageSettings>(() => parseSavedSettings(null));
  const [thumbSettings, setThumbSettings] = useState(settings);
  const [assets, setAssets] = useState<ParsedBynderAsset[]>([]);
  const [assetReady, setAssetReady] = useState(false);
  const [panelAsset, setPanelAsset] = useState<ParsedBynderAsset | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [mobilePickRequest, setMobilePickRequest] = useState<{ id: string; nonce: number }>();
  const [desktopPickRequest, setDesktopPickRequest] = useState<{ id: string; nonce: number }>();
  const heldMobile = useRef(new Map<string, NonNullable<SavedBynderAsset["mobile"]>>());
  const heldSameCrop = useRef(new Map<string, { focalPoint: FocalPoint; transform: BynderImageSettings["transform"] }>());
  const shellRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef("");
  const hydrated = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const activeAsset = assets.find((item) => item.id === settings.activeAssetId) ?? null;
  const focused = activeAsset && !isDocumentAsset(activeAsset) ? activeAsset : null;
  const focusedIsVideo = isVideoAsset(focused);
  const focusedIsDocument = isDocumentAsset(focused);
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

  useEffect(() => {
    if (!focused) {
      setEditorOpen(false);
      return;
    }
    setEditorOpen(true);
  }, [focused?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (settingsRef.current !== settings) return;
      setThumbSettings(settings);
    }, assetIdentity(thumbSettings) === assetIdentity(settings) ? 1000 : 0);
    return () => window.clearTimeout(timer);
  }, [settings, thumbSettings]);

  useFieldFrameHeight(sdk, shellRef, focused?.id, editorOpen, assets.length);
  const fallbackTransform = useMemo(
    () => applyCropConfig(defaultTransform(), cropConfig, "defaults", "desktop"),
    [cropConfig]
  );
  const fallbackMobileTransform = useMemo(
    () => applyCropConfig(defaultTransform(), cropConfig, "defaults", "mobile"),
    [cropConfig]
  );
  const viewportLocks = effectiveViewportLocks(cropConfig, activeViewport);
  const scaleMode = authorUsesScaleMode(cropConfig, activeViewport);
  const editorTransform = coerceTransformForScaleMode(settings.transform, scaleMode);
  const thumbs = useMemo(() => {
    const next: Record<string, { desktop: ReturnType<typeof listThumbForAsset>; mobile: ReturnType<typeof listThumbForAsset> }> =
      {};
    for (const asset of assets) {
      const desktop = cropSliceForAsset(thumbSettings, asset.id, "desktop", fallbackTransform);
      const thumb = listThumbForAsset({
        asset,
        live: desktop,
        datAllowed: configAllowsDat && !isVideoAsset(asset) && !isDocumentAsset(asset),
        fallbackTransform,
        slot: LIST_THUMB_DESKTOP,
      });
      if (!desktopMobileMode) {
        next[asset.id] = { desktop: thumb, mobile: thumb };
        continue;
      }
      const mobile = cropSliceForAsset(thumbSettings, asset.id, "mobile", fallbackMobileTransform);
      const saved = thumbSettings.assets?.find((item) => item.id === asset.id);
      const mobileFile = saved?.mobile?.id
        ? {
            id: saved.mobile.id,
            name: saved.mobile.name,
            type: saved.mobile.type,
            transformBaseUrl: saved.mobile.transformBaseUrl,
            webImage: saved.mobile.webImage,
          }
        : undefined;
      const mobileSource: ParsedBynderAsset = mobileFile
        ? {
            ...asset,
            id: mobileFile.id,
            name: mobileFile.name,
            type: mobileFile.type,
            transformBaseUrl: mobileFile.transformBaseUrl,
            sourceUrl: mobileFile.webImage?.url || mobileFile.transformBaseUrl || "",
            width: undefined,
            height: undefined,
            fileType: undefined,
            fileSize: undefined,
          }
        : asset;
      next[asset.id] = {
        desktop: thumb,
        mobile: listThumbForAsset({
          asset: mobileSource,
          live: mobile,
          datAllowed:
            configAllowsDat &&
            !isVideoAsset(mobileSource) &&
            !isDocumentAsset(mobileSource) &&
            Boolean(mobileSource.transformBaseUrl),
          fallbackTransform: fallbackMobileTransform,
          slot: LIST_THUMB_MOBILE,
        }),
      };
    }
    return next;
  }, [assets, configAllowsDat, desktopMobileMode, fallbackMobileTransform, fallbackTransform, thumbSettings]);

  const persistPolicy = useMemo(() => resolvePersistPolicy(fieldConfig, appConfig), [fieldConfig, appConfig]);
  const persistKeys = persistPolicy.keys;

  const persist = useCallback((next: BynderImageSettings) => {
    const viewport = desktopMobileMode ? resolveActiveViewport(next) : "desktop";
    const payload = buildSettingsPayload(
      {
        ...next,
        transform: applyCropConfig(next.transform, cropConfig, "locks", viewport),
        assets: applyCropConfigToAssets(next.assets, cropConfig, "locks"),
      },
      { persistAssetKeys: persistKeys, omitWebImage: persistPolicy.omitWebImage, enableDat: configAllowsDat, authorFields: additionalFields.fields }
    );
    const prepared = desktopMobileMode ? payload : withoutDesktopMobile(payload);
    settingsRef.current = prepared;
    setSettings(prepared);
    return prepared;
  }, [additionalFields.fields, configAllowsDat, cropConfig, desktopMobileMode, persistKeys, persistPolicy.omitWebImage]);

  useEffect(() => {
    if (editorTransform.operation === settings.transform.operation) return;
    persist(stashActiveCrop({ ...settings, transform: editorTransform }, focused?.id));
    // Only rewrite crop↔scale when the lock mode and stored op disagree.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid looping on full settings
  }, [scaleMode, editorTransform.operation, settings.transform.operation, focused?.id, persist]);

  const applyAssets = useCallback(
    (rawAssets: unknown[], nextFocusedId?: string, sizes?: Map<string, { width?: number; height?: number }>) => {
      const source = settingsRef.current;
      const parsedList = parseBynderAssets(rawAssets);
      const ids = parsedList.map((item) => item.id);
      const selectableId = (id?: string) => {
        if (!id || !ids.includes(id)) return undefined;
        const asset = parsedList.find((item) => item.id === id);
        if (!asset || isDocumentAsset(asset)) return undefined;
        return id;
      };
      const focusedId = selectableId(nextFocusedId) ?? selectableId(source.activeAssetId);
      const focusedAsset = focusedId ? parsedList.find((item) => item.id === focusedId) ?? null : null;
      const slimmed = slimPersistedAssets(rawAssets, persistKeys, { omitWebImage: persistPolicy.omitWebImage });
      const incoming = asSavedAssets(slimmed) ?? [];
      const previous = pruneAssets(stashActiveCrop(source, source.activeAssetId), ids) ?? [];
      const previousById = new Map(previous.map((asset) => [asset.id, asset]));
      const withVideoDefaults = (asset: SavedBynderAsset, parsed?: ParsedBynderAsset): SavedBynderAsset => {
        if (!parsed || !isVideoAsset(parsed) || asset.video) return asset;
        return { ...asset, video: { ...videoDefaults } };
      };
      const nextAssets: SavedBynderAsset[] = incoming.map((identity) => {
        const existing = previousById.get(identity.id);
        const parsed = parsedList.find((item) => item.id === identity.id);
        if (existing) {
          return withVideoDefaults(
            applyCropConfigToAssetCrop(
              {
                ...existing,
                name: identity.name ?? existing.name,
                type: identity.type ?? existing.type,
                transformBaseUrl: identity.transformBaseUrl ?? existing.transformBaseUrl,
                webImage: identity.webImage ?? existing.webImage,
              },
              cropConfig,
              "locks"
            ),
            parsed
          );
        }
        const sized = sizes?.get(identity.id);
        const seeded = seedAssetCrop(cropConfig, {
          width: sized?.width ?? parsed?.width,
          height: sized?.height ?? parsed?.height,
        });
        return withVideoDefaults(
          {
            ...identity,
            ...seeded,
            alt: identity.alt ?? parsed?.alt ?? "",
            ...(identity.mobile?.id
              ? { differentMobileAsset: true as const, mobile: identity.mobile }
              : {}),
          },
          parsed
        );
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
          omitWebImage: persistPolicy.omitWebImage,
          enableDat: configAllowsDat,
          authorFields: additionalFields.fields,
        }
      );
      const next = desktopMobileMode ? payload : withoutDesktopMobile(payload);
      settingsRef.current = next;
      setAssets(parsedList);
      setAssetReady(true);
      setSettings(next);
    },
    [additionalFields.fields, configAllowsDat, cropConfig, desktopMobileMode, persistKeys, persistPolicy.omitWebImage, videoDefaults]
  );

  const onCompactSelect = useCallback(
    (rawAssets: unknown[], additionalInfo?: unknown) => {
      if (!rawAssets.length) return;
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo, persistKeys);
      const sizes = new Map<string, { width?: number; height?: number }>();
      for (const raw of rawAssets) {
        const parsed = parseBynderAsset(raw);
        const id = parsed?.databaseId ?? parsed?.id;
        if (id) sizes.set(id, assetPixelSize(raw, additionalInfo));
      }
      const current = settingsRef.current;
      const previousIds = new Set(parseBynderAssets(current.assets ?? []).map((item) => item.id));
      const incomingParsed = parseBynderAssets(incoming);
      const firstNew = incomingParsed.find((item) => !previousIds.has(item.id) && !isDocumentAsset(item));
      const nextRaw = carrySeparateMobile(
        current.assets ?? [],
        applyPickerSelection({
          current: current.assets ?? [],
          incoming,
          mode: compact.mode,
          focusedId: focused?.id,
          maxLimit: compact.maxLimit,
        })
      );
      applyAssets(nextRaw, firstNew?.id, sizes);
    },
    [applyAssets, compact.maxLimit, compact.mode, focused?.id, persistKeys, persistPolicy.omitWebImage]
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
      if (!parsed || isDocumentAsset(parsed)) return;
      const source = settingsRef.current;
      const currentViewport = resolveActiveViewport(source);
      const nextViewport =
        !desktopMobileMode ? "desktop" : viewport ?? (id === focused?.id ? currentViewport : "desktop");
      const sameThumb = id === focused?.id && nextViewport === currentViewport;
      if (sameThumb) {
        setEditorOpen((open) => !open);
        return;
      }
      setEditorOpen(true);
      const sameAsset = id === focused?.id;
      const stashed = stashActiveCrop(source, focused?.id);
      const crop = viewportCrop(savedAssetById(stashed, id), nextViewport);
      const savedRow = savedAssetById(stashed, id);
      const separateMobile = Boolean(savedRow?.differentMobileAsset && savedRow.mobile?.id);
      const storedAlt =
        nextViewport === "mobile" && separateMobile
          ? savedRow?.mobile?.alt
          : savedRow?.alt;
      const fallbackAlt = nextViewport === "mobile" && separateMobile ? "" : parsed.alt ?? "";
      persist({
        ...stashed,
        activeAssetId: id,
        activeViewport: nextViewport === "mobile" ? "mobile" : undefined,
        alt: typeof storedAlt === "string" ? storedAlt : fallbackAlt,
        focalPoint: crop?.focalPoint ?? { x: 0.5, y: 0.5 },
        transform: sameAsset
          ? (crop?.transform ?? source.transform)
          : applyCropConfig(crop?.transform ?? source.transform, cropConfig, "locks", nextViewport),
      });
    },
    [assets, cropConfig, desktopMobileMode, focused?.id, persist]
  );

  const onCloseEditor = useCallback(() => {
    const source = settingsRef.current;
    persist({
      ...stashActiveCrop(source, source.activeAssetId),
      activeAssetId: undefined,
      activeViewport: undefined,
    });
    setEditorOpen(false);
  }, [persist]);

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

  const requestMobilePick = (id: string) => {
    setMobilePickRequest({ id, nonce: Date.now() });
  };

  const onRemoveMobileAsset = useCallback(
    (id: string) => {
      const source = settingsRef.current;
      const stashed = stashActiveCrop(source, source.activeAssetId);
      const current = savedAssetById(stashed, id);
      if (current?.mobile?.id) heldMobile.current.set(id, current.mobile);
      const nextAssets = (stashed.assets ?? []).map((asset) => {
        if (asset.id !== id) return asset;
        const cleared = withoutMobileCrop(asset);
        return (cleared ?? asset) as SavedBynderAsset;
      });
      const desktop = savedAssetById({ assets: nextAssets }, id);
      const viewingRow = source.activeAssetId === id;
      persist({
        ...stashed,
        assets: nextAssets,
        activeViewport: viewingRow ? "desktop" : source.activeViewport,
        focalPoint: viewingRow ? desktop?.focalPoint ?? source.focalPoint : source.focalPoint,
        transform: viewingRow ? desktop?.transform ?? source.transform : source.transform,
      });
    },
    [persist]
  );

  const onDifferentAssetChange = (useDifferent: boolean) => {
    if (!focused || isVideoAsset(focused) || isDocumentAsset(focused)) return;
    const source = settingsRef.current;
    const stashed = stashActiveCrop(source, focused.id);
    const current = savedAssetById(stashed, focused.id);
    const desktopCrop = {
      focalPoint: current?.focalPoint ?? source.focalPoint,
      transform: current?.transform ?? source.transform,
    };
    if (useDifferent) heldSameCrop.current.set(focused.id, desktopCrop);
    if (!useDifferent && current?.mobile?.id) {
      heldMobile.current.set(focused.id, current.mobile);
    }
    const remembered = useDifferent ? heldMobile.current.get(focused.id) : undefined;
    const sameCrop = heldSameCrop.current.get(focused.id) ?? desktopCrop;
    const nextAssets = (stashed.assets ?? []).map((asset) => {
      if (asset.id !== focused.id) return asset;
      if (!useDifferent) {
        const cleared = withoutMobileCrop(asset);
        const restored = sameCrop;
        return {
          ...(cleared ?? asset),
          focalPoint: restored.focalPoint,
          transform: restored.transform,
        } as SavedBynderAsset;
      }
      if (remembered?.id) {
        return { ...asset, differentMobileAsset: true as const, mobile: remembered };
      }
      const { mobile: _mobile, ...rest } = asset;
      return { ...rest, focalPoint: desktopCrop.focalPoint, transform: desktopCrop.transform, differentMobileAsset: true as const };
    });
    const clearedTransform = {
      ...source.transform,
      width: null,
      height: null,
      aspect: null,
    };
    persist({
      ...stashed,
      assets: nextAssets,
      activeViewport: useDifferent ? "mobile" : "desktop",
      focalPoint: useDifferent
        ? remembered?.id
          ? remembered.focalPoint
          : { x: 0.5, y: 0.5 }
        : sameCrop.focalPoint,
      transform: useDifferent
        ? remembered?.id
          ? remembered.transform
          : clearedTransform
        : sameCrop.transform,
    });
    setEditorOpen(true);
  };

  const onReplaceDesktop = useCallback(
    (rowId: string, rawAssets: unknown[], additionalInfo?: unknown) => {
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo, persistKeys);
      const parsed = parseBynderAssets(incoming)[0];
      const saved = asSavedAssets(slimPersistedAssets(incoming, persistKeys, { omitWebImage: persistPolicy.omitWebImage }))?.[0];
      if (!parsed || !saved) return;
      const source = settingsRef.current;
      const stashed = stashActiveCrop(source, rowId);
      const seeded = seedAssetCrop(cropConfig, assetPixelSize(rawAssets[0], additionalInfo));
      const nextAssets = (stashed.assets ?? []).map((asset) => {
        if (asset.id !== rowId) return asset;
        const { dat: _dat, ...kept } = asset;
        return {
          ...kept,
          id: saved.id,
          name: saved.name,
          type: saved.type,
          transformBaseUrl: saved.transformBaseUrl,
          webImage: saved.webImage,
          focalPoint: seeded.focalPoint,
          transform: seeded.transform,
          mobile: asset.mobile,
          differentMobileAsset: asset.differentMobileAsset,
        };
      });
      const selectable = !isDocumentAsset(parsed);
      const wasFocused = source.activeAssetId === rowId || source.activeAssetId === saved.id;
      setAssets((current) => current.map((item) => (item.id === rowId ? parsed : item)));
      persist({
        ...stashed,
        assets: nextAssets,
        activeAssetId: selectable ? saved.id : wasFocused ? undefined : source.activeAssetId,
        ...(selectable
          ? { activeViewport: "desktop" as const, focalPoint: seeded.focalPoint, transform: seeded.transform }
          : wasFocused
            ? { activeViewport: undefined }
            : {}),
      });
      if (selectable) setEditorOpen(true);
      else if (wasFocused) setEditorOpen(false);
    },
    [cropConfig, persist, persistKeys, persistPolicy.omitWebImage]
  );

  const onSelectMobile = useCallback(
    (rowId: string, rawAssets: unknown[], additionalInfo?: unknown) => {
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo, persistKeys);
      const parsed = parseBynderAssets(incoming)[0];
      const saved = asSavedAssets(slimPersistedAssets(incoming, persistKeys, { omitWebImage: persistPolicy.omitWebImage }))?.[0];
      if (!parsed || !saved) return;
      const source = settingsRef.current;
      const stashed = stashActiveCrop(source, rowId);
      const seeded = seedAssetCrop(cropConfig, assetPixelSize(rawAssets[0], additionalInfo));
      const nextAssets = (stashed.assets ?? []).map((asset) => {
        if (asset.id !== rowId) return asset;
        return {
          ...asset,
          differentMobileAsset: true as const,
          mobile: {
            focalPoint: seeded.focalPoint,
            transform: seeded.mobile?.transform ?? seeded.transform,
            id: saved.id,
            name: saved.name,
            type: saved.type,
            transformBaseUrl: saved.transformBaseUrl,
            webImage: saved.transformBaseUrl ? undefined : saved.webImage,
            alt: parsed.alt ?? "",
          },
        };
      });
      const mobile = nextAssets.find((asset) => asset.id === rowId)?.mobile;
      persist({
        ...stashed,
        assets: nextAssets,
        activeAssetId: rowId,
        activeViewport: "mobile",
        focalPoint: mobile?.focalPoint ?? { x: 0.5, y: 0.5 },
        transform: mobile?.transform ?? source.transform,
        alt: mobile?.alt ?? "",
      });
      setEditorOpen(true);
    },
    [cropConfig, persist, persistKeys, persistPolicy.omitWebImage]
  );

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
      const authorProperties = additionalFields.fields.map((field) => field.property);
      const slimmed = slimPersistedAssets(saved.assets, persistKeys, {
        omitWebImage: persistPolicy.omitWebImage,
        additionalProperties: authorProperties,
      });
      if (slimmed) {
        saved.assets = asSavedAssets(slimmed, authorProperties)?.map((asset) =>
          applyAuthorFields(asset, additionalFields.fields)
        );
      }
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
  }, [additionalFields.fields, customField, cropConfig, desktopMobileMode, persistKeys, persistPolicy.omitWebImage]);

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

  const panel = focused ?? panelAsset;
  const showCropChrome = Boolean(panel) && !isDocumentAsset(focused ?? panel);
  const hasDatUrl = Boolean(panel?.transformBaseUrl);
  const datActive = Boolean(configAllowsDat && hasDatUrl);
  const previewSrc = panel?.sourceUrl;
  const mobileAssetPreview =
    activeViewport === "mobile" && focusedSaved?.mobile?.id
      ? focusedSaved.mobile.webImage?.url ?? focusedSaved.mobile.transformBaseUrl
      : undefined;
  const editorSrc = mobileAssetPreview || previewSrc;
  const activeSlice = cropSliceForAsset(settings, panel?.id, activeViewport, settings.transform);
  const activeBase =
    activeViewport === "mobile" && focusedSaved?.mobile?.transformBaseUrl
      ? focusedSaved.mobile.transformBaseUrl
      : panel?.transformBaseUrl;
  const activeDatUrl =
    datActive && activeBase ? joinDatUrl(activeBase, datQueriesForSlice(activeSlice)["2x"]) : undefined;
  const copyUrl = activeDatUrl || editorSrc || previewSrc || "";

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

  const patchFocusedAsset = (update: (asset: SavedBynderAsset) => SavedBynderAsset) => {
    if (!focused?.id) return;
    const assets = (settings.assets ?? []).map((asset) => (asset.id === focused.id ? update(asset) : asset));
    persist({ ...settings, assets });
  };

  const patchAdditional = (property: string, value: string | number | boolean | undefined) => {
    patchFocusedAsset((asset) => {
      const current = { ...(asset.additional ?? {}) };
      if (value === undefined || value === "") delete current[property];
      else current[property] = value;
      const next = { ...asset };
      if (Object.keys(current).length) next.additional = current;
      else delete next.additional;
      return next;
    });
  };

  const patchVideo = (key: keyof VideoPlayback, value: boolean) => {
    if (!focusedIsVideo) return;
    patchFocusedAsset((asset) => ({
      ...asset,
      video: { ...(asset.video ?? videoDefaults), [key]: value },
    }));
  };

  const playback = focusedSaved?.video ?? videoDefaults;

  if (!customField) {
    return (
      <div className="bynder-settings" ref={shellRef}>
        <p className="notice">This view only works as a Custom Field location.</p>
      </div>
    );
  }

  if (additionalFields.error) {
    return (
      <div className="bynder-settings" ref={shellRef}>
        <div className="notice-card error" role="alert">
          <h3>Invalid field config</h3>
          <p>{additionalFields.error}</p>
        </div>
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
          <h2>Bynder Asset Settings</h2>
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
        onRemoveMobile={onRemoveMobileAsset}
        onReorder={onCompactReorder}
        desktopMobileMode={desktopMobileMode}
        separateMobileIds={settings.assets?.filter((asset) => asset.differentMobileAsset).map((asset) => asset.id)}
        linkedIds={settings.assets
          ?.filter((asset) => {
            if (asset.differentMobileAsset || asset.mobile?.id) return false;
            if (!asset.mobile) return true;
            return viewportCropsEqual(asset, asset.mobile);
          })
          .map((asset) => asset.id)}
        emptyMobileIds={settings.assets
          ?.filter((asset) => asset.differentMobileAsset && !asset.mobile?.id)
          .map((asset) => asset.id)}
        mobilePickRequest={mobilePickRequest}
        desktopPickRequest={desktopPickRequest}
        onSelectMobile={onSelectMobile}
        onReplaceDesktop={onReplaceDesktop}
        mobileFiles={Object.fromEntries(
          (settings.assets ?? [])
            .filter((asset) => asset.differentMobileAsset && asset.mobile?.id)
            .map((asset) => [
              asset.id,
              {
                id: asset.mobile!.id!,
                name: asset.mobile!.name,
                type: asset.mobile!.type,
                sourceUrl: asset.mobile!.webImage?.url || asset.mobile!.transformBaseUrl,
              },
            ])
        )}
      />

      {showCropChrome ? (
      <div className={`crop-editor-collapse${focused && !focusedIsDocument ? " is-open" : ""}`} aria-hidden={!focused || focusedIsDocument}>
        <div className="crop-editor-collapse-inner">
          {previewSrc ? (
            <div className="crop-editor-frame">
              <div className="crop-editor-bar">
                <button
                  type="button"
                  className="crop-editor-toggle"
                  aria-expanded={editorOpen}
                  aria-controls="crop-editor-body"
                  onClick={() => setEditorOpen((open) => !open)}
                >
                  <ChevronIcon open={editorOpen} />
                  <span className="crop-editor-toggle-label">
                    {focusedIsVideo ? "Video settings" : "Edit Crop & Focal Point"}
                    {focused ? (
                      <span className="crop-editor-asset">
                        {activeViewport === "mobile" && focusedSaved?.mobile?.id
                          ? focusedSaved.mobile.name || focusedSaved.mobile.id
                          : focused.name ?? focused.id}
                      </span>
                    ) : null}
                    {focusedIsVideo ? (
                      <span className="dat-badge is-video" title="Bynder video asset">
                        Video
                      </span>
                    ) : hasDatUrl ? (
                      <span className="dat-badge" title="This Bynder asset has a DAT transform URL">
                        DAT capable
                      </span>
                    ) : (
                      <span className="dat-badge is-missing" title="This Bynder asset has no DAT transform URL">
                        Not DAT capable
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="crop-editor-close"
                  aria-label={focusedIsVideo ? "Close video settings" : "Close crop editor"}
                  title={focusedIsVideo ? "Close video settings" : "Close crop editor"}
                  onClick={onCloseEditor}
                >
                  <CloseIcon />
                </button>
              </div>

              <div
                id="crop-editor-body"
                className={`crop-editor-body${editorOpen ? " is-open" : ""}`}
                aria-hidden={!editorOpen}
              >
                <div className="crop-editor-body-inner">
          {focusedIsVideo ? (
            <div className="video-settings">
              {playbackOptions.length ? (
              <fieldset className="video-options">
                <legend>Playback</legend>
                {playbackOptions.map(([key, label]) => (
                  <label key={key} className="video-option">
                    <input
                      type="checkbox"
                      checked={playback[key]}
                      onChange={(event) => patchVideo(key, event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              ) : null}
              <AdditionalFields fields={additionalFields.fields} values={authorValues(focusedSaved)} onChange={patchAdditional} />
              <section className="video-crop">
                <h4>Edit Crop</h4>
                <div className="video-dat-note">
                  <p>
                    DAT transforms such as cropping or resizing via URL parameters are unavailable for video assets. They can only be applied to image assets.
                  </p>
                  <p>
                    If you need to crop or modify this video, you must prepare it within Bynder first using one
                    of the following methods:{" "}
                    <a
                      href="https://support.bynder.com/hc/en-us/articles/14540950050322-How-To-Use-And-Manage-Videos-In-Studio"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Bynder Studio
                    </a>
                    ,{" "}
                    <a
                      href="https://support.bynder.com/hc/en-us/articles/16130743711890-Create-Video-Derivatives"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Custom Video Derivatives
                    </a>
                    , or{" "}
                    <a
                      href="https://support.bynder.com/hc/en-us/articles/360013870380-Trim-Videos-in-the-Asset-Bank"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Clip Video Tool
                    </a>
                    .
                  </p>
                </div>
              </section>
            </div>
          ) : (
            <>
          {desktopMobileMode && !focusedIsVideo ? (
          <div className="viewport-toolbar">
            <div
              className={
                focusedSaved?.differentMobileAsset ? "viewport-tabs is-split" : "viewport-tabs"
              }
              role="tablist"
              aria-label="Crop viewport"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeViewport === "desktop"}
                className={activeViewport === "desktop" ? "is-active" : ""}
                onClick={() => {
                  if (!focused) return;
                  if (activeViewport === "desktop") {
                    setEditorOpen(true);
                    return;
                  }
                  onFocusAsset(focused.id, "desktop");
                }}
              >
                Desktop
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeViewport === "mobile"}
                className={activeViewport === "mobile" ? "is-active" : ""}
                onClick={() => {
                  if (!focused) return;
                  if (activeViewport === "mobile") {
                    setEditorOpen(true);
                    return;
                  }
                  onFocusAsset(focused.id, "mobile");
                }}
              >
                {!focusedSaved?.differentMobileAsset ? (
                <span
                  className={mobileDiverged ? "viewport-link-icon is-broken" : "viewport-link-icon"}
                  title={mobileDiverged ? "Mobile does not match desktop" : "Mobile matches desktop"}
                  aria-hidden
                >
                  {mobileDiverged ? <UnlinkIcon /> : <LinkIcon />}
                </span>
                ) : null}
                Mobile
              </button>
            </div>
            {!focusedIsVideo && !focusedIsDocument ? (
              <label className="asset-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={Boolean(focusedSaved?.differentMobileAsset)}
                  onChange={(event) => onDifferentAssetChange(event.target.checked)}
                  aria-label="Use a different asset for mobile"
                />
                <span>Use a different asset for mobile</span>
              </label>
            ) : null}
          </div>
          ) : null}

          <div className="editor-row">
            <aside className="editor-fields">
              <div className="crop-fields-card">
                {desktopMobileMode && !focusedSaved?.differentMobileAsset ? (
                  <div className="crop-fields-card-header">
                    <p className="crop-fields-card-kicker">Mobile &amp; desktop crops are currently:</p>
                    <p className="crop-fields-card-status">
                      {mobileDiverged ? (
                        <>
                          <strong>DIFFERENT</strong>{" "}
                          <button type="button" className="crop-fields-card-cta" onClick={onMatchDesktopCrop}>
                            (revert to match)
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>MATCHING</strong>{" "}
                          <span className="crop-fields-card-aside">(and linked)</span>
                        </>
                      )}
                      <InfoTooltip>
                        {mobileDiverged
                          ? "Click “revert to match” to copy the desktop crop onto mobile and link them again."
                          : "Mobile matches desktop by default unless you edit it on the Mobile tab. Desktop edits update mobile immediately."}
                      </InfoTooltip>
                    </p>
                  </div>
                ) : null}
                <div className="crop-fields-card-body">
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">{datActive ? "Transforms" : "Crop frame"}</span>
                  <InfoTooltip>
                    {datActive ? (
                      <>
                        These are CSS layout pixels, not the original file size. A layout width of 1200 is
                        delivered to Bynder at 2400 (2×) for a single image URL, and the saved field also
                        includes 1× and 2× URLs for srcset. The focal point decides which part of the photo
                        is kept when the image is cropped.
                      </>
                    ) : (
                      <>
                        These are CSS layout pixels for the crop box on your site. The focal point decides
                        which part of the photo is kept.
                      </>
                    )}
                  </InfoTooltip>
                </div>
                <TransformForm
                  value={editorTransform}
                  datEnabled={datActive}
                  aspectPresets={cropConfig.aspectPresets}
                  datPresets={compact.datPresets}
                  hideFormat={cropConfig.hideFormat}
                  showOperation={cropConfig.showOperation}
                  showAspect={cropConfig.showAspect}
                  showWidth={cropConfig.showWidth}
                  showHeight={cropConfig.showHeight}
                  scaleMode={scaleMode}
                  showQuality={cropConfig.showQuality}
                  showAdvancedQuery={cropConfig.showAdvancedQuery}
                  showDatPreset={cropConfig.showDatPreset}
                  locks={{
                    aspect: viewportLocks.lockAspect,
                    width: viewportLocks.lockWidth,
                    height: viewportLocks.lockHeight,
                    format: cropConfig.lockFormat,
                  }}
                  ratioScope={`${focused?.id ?? ""}:${activeViewport}`}
                  onChange={(transform) =>
                    persist(
                      stashActiveCrop(
                        { ...settings, transform: coerceTransformForScaleMode(transform, scaleMode) },
                        focused?.id
                      )
                    )
                  }
                />
              </div>
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">Edit Crop &amp; Focal Point</span>
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
                  <span>Reset center</span>
                </button>
              </div>
                </div>
              </div>
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">
                    {focusedSaved?.differentMobileAsset && focusedSaved.mobile?.id && activeViewport === "mobile"
                      ? "Mobile alt text"
                      : "Alt text"}
                  </span>
                  <InfoTooltip>
                    {focusedSaved?.differentMobileAsset && focusedSaved.mobile?.id
                      ? activeViewport === "mobile"
                        ? "Alt text for the mobile image only. Prefills from that asset’s Bynder metadata."
                        : "Alt text for the desktop image. The mobile image has its own alt text on the Mobile tab."
                      : "Prefills from Bynder metadata in this order: alt_text, alttext, alt, then description. You can overwrite it for this entry."}
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
              <AdditionalFields fields={additionalFields.fields} values={authorValues(focusedSaved)} onChange={patchAdditional} />
            </aside>
            <section className="editor-preview">
              {focusedSaved?.differentMobileAsset && activeViewport === "mobile" && !focusedSaved.mobile?.id ? (
                <button type="button" className="mobile-asset-cta" onClick={() => focused && requestMobilePick(focused.id)}>
                  <span className="mobile-asset-cta-icon" aria-hidden>
                    +
                  </span>
                  Select a mobile asset
                </button>
              ) : (
              <>
              <CropFocalEditor
                key={`${panel?.id ?? ""}:${activeViewport}:${editorSrc}`}
                src={editorSrc ?? previewSrc}
                alt={panel?.name}
                focalPoint={settings.focalPoint}
                transform={editorTransform}
                onChange={onFocalChange}
              />
              {focused ? (
                <div className="editor-asset-actions">
                  <AssetToolbar
                    previewUrl={copyUrl || editorSrc || previewSrc}
                    copyUrl={copyUrl}
                    bynderUrl={bynderMediaUrl(
                      compact.portalUrl,
                      activeViewport === "mobile" && focusedSaved?.mobile?.id
                        ? { id: focusedSaved.mobile.id }
                        : focused
                    )}
                    changeLabel={activeViewport === "mobile" ? "Change mobile asset" : "Change desktop asset"}
                    removeLabel={
                      activeViewport === "mobile" && focusedSaved?.differentMobileAsset
                        ? "Remove mobile asset"
                        : "Remove"
                    }
                    onChange={() => {
                      if (activeViewport === "mobile") requestMobilePick(focused.id);
                      else setDesktopPickRequest({ id: focused.id, nonce: Date.now() });
                    }}
                    onRemove={() => {
                      if (activeViewport === "mobile" && focusedSaved?.differentMobileAsset) onRemoveMobileAsset(focused.id);
                      else onCompactRemove(focused.id);
                    }}
                  />
                </div>
              ) : null}
              </>
              )}
            </section>
          </div>

          {!hasDatUrl ? (
            <p className="dat-error" role="status">
              This image is not DAT capable. CSS cropping will be needed.
            </p>
          ) : null}
            </>
          )}
                </div>
              </div>
        </div>
      ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}
