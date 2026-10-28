import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetToolbar, CompactPicker } from "../../components/CompactPicker";
import { bynderMediaUrl } from "../../lib/bynder/assetUi";
import { CropFocalEditor } from "../../components/CropFocalEditor";
import { InfoTooltip } from "../../components/InfoTooltip";
import { TransformForm, transformFormHasFields } from "../../components/TransformForm";
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
  isImageAsset,
} from "../../lib/bynder/parseAsset";
import { listThumbForAsset, LIST_THUMB_DESKTOP, LIST_THUMB_MOBILE } from "../../lib/bynder/assetUi";
import { fitPreviewBox, roundCoord } from "../../lib/bynder/composeDatUrl";
import { ImageSpinner } from "../../components/ImageSpinner";
import {
  fetchOriginalPixelSizes,
  mergeOriginalSizes,
  missingOriginalSizeIds,
  rememberBynderSession,
} from "../../lib/bynder/originalDimensions";
import {
  applyCropConfig,
  applyCropConfigToAssetCrop,
  readFieldConfig,
  resolveAdditionalFields,
  resolveCompactViewConfig,
  resolveCropConfig,
  resolveVideoDefaults,
  showVideoControlsTheme,
  seedAssetCrop,
  withActiveProfile,
} from "../../lib/fieldConfig";
import { composeBynderImageUrl } from "../../delivery/composeBynderImageUrl";
import { hydrateFieldValue } from "../../lib/hydrate";
import {
  viewportAssetSize,
  CUSTOM_PROFILE_ID,
  customProfileSettings,
  isCustomProfile,
  profileCropsCanMatch,
  profileSelectOptions,
  viewportImageSize,
  withViewportAspect,
} from "../../lib/profiles";
import { resolvePersistPolicy } from "../../lib/persistKeys";
import {
  asSavedAsset,
  asSavedAssets,
  buildSettingsPayload,
  defaultTransform,
  parseSavedSettings,
  persistedPayload,
  stashActiveCrop,
} from "../../lib/settings";
import type {
  AdditionalFieldDefinition,
  AppInstallationConfig,
  BynderImageSettings,
  FocalPoint,
  OriginalAssetSize,
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

function savedMirror(crop: { mirror?: boolean } | null | undefined): true | undefined {
  return crop?.mirror === true ? true : undefined;
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

function EditorSkeleton({ width, height }: { width: number; height: number }) {
  return (
    <div className="editor-row editor-skeleton" aria-busy="true" aria-label="Loading editor">
      <aside className="editor-fields" aria-hidden>
        <div className="editor-skeleton-card">
          <span className="editor-skeleton-bar is-title" />
          <span className="editor-skeleton-bar" />
          <span className="editor-skeleton-bar" />
          <span className="editor-skeleton-bar is-short" />
        </div>
        <div className="editor-skeleton-card">
          <span className="editor-skeleton-bar is-title" />
          <span className="editor-skeleton-block" />
        </div>
      </aside>
      <section className="editor-preview">
        <div className="editor-skeleton-preview" style={{ width, height }}>
          <ImageSpinner />
        </div>
      </section>
    </div>
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

function originalSize(
  saved: SavedBynderAsset,
  raw: unknown,
  additionalInfo?: unknown
): OriginalAssetSize {
  const measured = assetPixelSize(raw, additionalInfo);
  const width = saved.origWidth ?? measured.width;
  const height = saved.origHeight ?? measured.height;
  return {
    ...(width ? { origWidth: Math.round(width) } : {}),
    ...(height ? { origHeight: Math.round(height) } : {}),
  };
}

/** Original size of the file shown in `viewport`, falling back to what Compact View reported. */
function displaySize(
  saved: SavedBynderAsset | undefined,
  parsed: ParsedBynderAsset | null | undefined,
  viewport: ViewportKind
): OriginalAssetSize | undefined {
  const own = viewportAssetSize(saved, viewport);
  if (own?.origWidth && own.origHeight) return own;
  if (viewport === "mobile" && saved?.mobile?.id) return own;
  if (parsed?.width && parsed.height) {
    return {
      origWidth: parsed.width,
      origHeight: parsed.height,
    };
  }
  return own;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export interface EditorHost {
  appConfig: AppInstallationConfig;
  fieldConfig?: unknown;
  initialValue: unknown;
  onDraft: (payload: Record<string, unknown>) => void;
  /** The Desktop or Mobile tab the author is editing. */
  onViewport?: (viewport: ViewportKind) => void;
  singleAsset?: boolean;
}

export default function CustomField({ editorHost }: { editorHost?: EditorHost } = {}) {
  const sdk = useAppSdk();
  const contextConfig = useAppConfig();
  const appConfig = editorHost?.appConfig ?? contextConfig;
  const customField = editorHost ? undefined : sdk?.location.CustomField;
  const fieldConfig = editorHost ? editorHost.fieldConfig : readFieldConfig(customField);
  const editorHostRef = useRef(editorHost);
  editorHostRef.current = editorHost;
  const compact = useMemo(() => {
    const resolved = resolveCompactViewConfig(fieldConfig, appConfig);
    if (!editorHost?.singleAsset) return resolved;
    return { ...resolved, mode: "SingleSelect" as const, maxLimit: 1 };
  }, [appConfig, editorHost?.singleAsset, fieldConfig]);
  const fieldCropConfig = useMemo(
    () => resolveCropConfig(fieldConfig, appConfig),
    [fieldConfig, appConfig]
  );
  const videoDefaults = useMemo(() => resolveVideoDefaults(fieldConfig, appConfig), [fieldConfig, appConfig]);
  const showControlsTheme = useMemo(() => showVideoControlsTheme(fieldConfig, appConfig), [fieldConfig, appConfig]);
  const additionalFields = useMemo(
    () => resolveAdditionalFields(fieldConfig, appConfig),
    [fieldConfig, appConfig]
  );
  const presentationOptions = [["controls", "Show controls"]] as const;
  const initialPlaybackOptions = (
    [
      ["autoplay", "Autoplay"],
      ["muted", "Mute"],
      ["loop", "Loop"],
    ] as const
  );

  const [settings, setSettings] = useState<BynderImageSettings>(() => parseSavedSettings(null));
  const [thumbSettings, setThumbSettings] = useState(settings);
  const [assets, setAssets] = useState<ParsedBynderAsset[]>([]);
  const [assetReady, setAssetReady] = useState(false);
  const [changedOnLoad, setChangedOnLoad] = useState(false);
  const [bynderTokenTick, setBynderTokenTick] = useState(0);
  const [originalSizeBlocked, setOriginalSizeBlocked] = useState(false);
  const [editorBooting, setEditorBooting] = useState(false);
  const [missingProfile, setMissingProfile] = useState<string>();
  const [panelAsset, setPanelAsset] = useState<ParsedBynderAsset | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [mobilePickRequest, setMobilePickRequest] = useState<{ id: string; nonce: number }>();
  const [desktopPickRequest, setDesktopPickRequest] = useState<{ id: string; nonce: number }>();
  const heldMobile = useRef(new Map<string, NonNullable<SavedBynderAsset["mobile"]>>());
  const heldSameCrop = useRef(
    new Map<string, { focalPoint: FocalPoint; transform: BynderImageSettings["transform"]; mirror?: true }>()
  );
  const shellRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef("");
  const hydrated = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const cropConfig = useMemo(
    () => withActiveProfile(fieldCropConfig, settings.profile, settings.profileSettings),
    [fieldCropConfig, settings.profile, settings.profileSettings]
  );

  const activeAsset = assets.find((item) => item.id === settings.activeAssetId) ?? null;
  const focused = activeAsset && !isDocumentAsset(activeAsset) ? activeAsset : null;
  const focusedIsVideo = isVideoAsset(focused);
  const focusedIsDocument = isDocumentAsset(focused);
  const desktopMobileMode = cropConfig.desktopMobileMode !== false;
  const activeViewport = desktopMobileMode ? resolveActiveViewport(settings) : "desktop";
  const onViewportRef = useRef(editorHost?.onViewport);
  onViewportRef.current = editorHost?.onViewport;
  useEffect(() => {
    onViewportRef.current?.(activeViewport);
  }, [activeViewport]);
  const focusedSaved = savedAssetById(settings, focused?.id);
  const sameMobileAsset = desktopMobileMode && !focusedSaved?.differentMobileAsset;
  const mobileDiverged = Boolean(sameMobileAsset && focusedSaved?.mobile);
  const liveCrop = { focalPoint: settings.focalPoint, transform: settings.transform, mirror: settings.mirror };
  const cropsLinked =
    sameMobileAsset &&
    viewportCropsEqual(
      activeViewport === "desktop" ? liveCrop : viewportCrop(focusedSaved, "desktop") ?? liveCrop,
      activeViewport === "mobile" ? liveCrop : viewportCrop(focusedSaved, "mobile") ?? liveCrop
    );
  const focalCentered = percent(settings.focalPoint.x) === "50" && percent(settings.focalPoint.y) === "50";
  const viewportsIdentical = sameMobileAsset && profileCropsCanMatch(cropConfig.active);
  const profileName = isCustomProfile(cropConfig.profile)
    ? "Customize"
    : (cropConfig.profile && cropConfig.profiles[cropConfig.profile]?.name) ||
      cropConfig.profile ||
      "Original aspect ratio";
  const desktopAspect = viewportImageSize(
    cropConfig.active.desktop,
    viewportAssetSize(focusedSaved, "desktop")
  ).aspectRatio;
  const mobileAspect = viewportImageSize(
    cropConfig.active.mobile,
    viewportAssetSize(focusedSaved, "mobile")
  ).aspectRatio;
  const activeAspect = activeViewport === "mobile" ? mobileAspect : desktopAspect;

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
    () => applyCropConfig(defaultTransform(), cropConfig, "desktop"),
    [cropConfig]
  );
  const fallbackMobileTransform = useMemo(
    () => applyCropConfig(defaultTransform(), cropConfig, "mobile"),
    [cropConfig]
  );
  const editorTransform = applyCropConfig(
    settings.transform,
    cropConfig,
    activeViewport,
    displaySize(focusedSaved, focused, activeViewport)
  );
  const thumbs = useMemo(() => {
    const next: Record<string, { desktop: ReturnType<typeof listThumbForAsset>; mobile: ReturnType<typeof listThumbForAsset> }> =
      {};
    const sized = (
      slice: ReturnType<typeof cropSliceForAsset>,
      viewport: ViewportKind,
      saved: SavedBynderAsset | undefined,
      parsed: ParsedBynderAsset
    ) => ({
      ...slice,
      transform: applyCropConfig(
        slice.transform ?? defaultTransform(),
        cropConfig,
        viewport,
        displaySize(saved, parsed, viewport)
      ),
    });
    for (const asset of assets) {
      const saved = thumbSettings.assets?.find((item) => item.id === asset.id);
      const desktop = sized(
        cropSliceForAsset(thumbSettings, asset.id, "desktop", fallbackTransform),
        "desktop",
        saved,
        asset
      );
      const thumb = listThumbForAsset({
        asset,
        live: desktop,
        datAllowed: !isVideoAsset(asset) && !isDocumentAsset(asset),
        fallbackTransform,
        slot: LIST_THUMB_DESKTOP,
      });
      if (!desktopMobileMode) {
        next[asset.id] = { desktop: thumb, mobile: thumb };
        continue;
      }
      const mobile = sized(
        cropSliceForAsset(thumbSettings, asset.id, "mobile", fallbackMobileTransform),
        "mobile",
        saved,
        asset
      );
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
            !isVideoAsset(mobileSource) &&
            !isDocumentAsset(mobileSource) &&
            Boolean(mobileSource.transformBaseUrl),
          fallbackTransform: fallbackMobileTransform,
          slot: LIST_THUMB_MOBILE,
        }),
      };
    }
    return next;
  }, [assets, cropConfig, desktopMobileMode, fallbackMobileTransform, fallbackTransform, thumbSettings]);

  const persistPolicy = useMemo(() => resolvePersistPolicy(fieldConfig, appConfig), [fieldConfig, appConfig]);

  const persist = useCallback((next: BynderImageSettings) => {
    const payload = buildSettingsPayload(next, {
      profile: next.profile,
      profileSettings: next.profileSettings ?? cropConfig.active,
      omitWebImage: persistPolicy.omitWebImage,
      omitName: persistPolicy.omitName,
      authorFields: additionalFields.fields,
    });
    const prepared = desktopMobileMode ? payload : withoutDesktopMobile(payload);
    settingsRef.current = prepared;
    setSettings(prepared);
    const host = editorHostRef.current;
    if (host) host.onDraft(persistedPayload(prepared));
    return prepared;
  }, [additionalFields.fields, cropConfig, desktopMobileMode, persistPolicy.omitName, persistPolicy.omitWebImage]);

  const onProfileChange = useCallback(
    (name: string) => {
      const source = settingsRef.current;
      if (name === CUSTOM_PROFILE_ID) {
        const asset = savedAssetById(source, source.activeAssetId);
        const nextSettings = customProfileSettings(
          source.profileSettings ?? cropConfig.active,
          viewportAssetSize(asset, "desktop"),
          viewportAssetSize(asset, "mobile")
        );
        persist({
          ...stashActiveCrop(source, source.activeAssetId),
          profile: CUSTOM_PROFILE_ID,
          profileSettings: nextSettings,
        });
        setMissingProfile(undefined);
        return;
      }
      const next = withActiveProfile(fieldCropConfig, name || undefined);
      persist({
        ...stashActiveCrop(source, source.activeAssetId),
        profile: next.profile,
        profileSettings: next.active,
      });
      setMissingProfile(undefined);
    },
    [cropConfig.active, fieldCropConfig, persist]
  );

  const onCustomAspect = useCallback(
    (aspectRatio: string) => {
      const source = settingsRef.current;
      if (!isCustomProfile(source.profile)) return;
      const current = source.profileSettings ?? cropConfig.active;
      const viewport = activeViewport === "mobile" ? "mobile" : "desktop";
      const slice = viewport === "mobile" ? current.mobile : current.desktop;
      if (slice === aspectRatio) return;
      persist({
        ...source,
        profile: CUSTOM_PROFILE_ID,
        profileSettings: withViewportAspect(current, viewport, aspectRatio),
      });
    },
    [activeViewport, cropConfig.active, persist]
  );

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
      const slimmed = slimPersistedAssets(rawAssets, {
        omitWebImage: persistPolicy.omitWebImage,
        omitName: persistPolicy.omitName,
      });
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
        if (isDocumentAsset(identity) || isDocumentAsset(parsed)) {
          return {
            id: identity.id,
            name: identity.name ?? existing?.name,
            type: "DOCUMENT",
            url: identity.url ?? existing?.url,
            downloadUrl: identity.downloadUrl ?? existing?.downloadUrl,
            ...(identity.additional || existing?.additional
              ? { additional: identity.additional ?? existing?.additional }
              : {}),
          };
        }
        if (existing) {
          const sized = sizes?.get(identity.id);
          const origWidth = existing.origWidth ?? identity.origWidth ?? sized?.width;
          const origHeight = existing.origHeight ?? identity.origHeight ?? sized?.height;
          return withVideoDefaults(
            applyCropConfigToAssetCrop(
              {
                ...existing,
                name: identity.name ?? existing.name,
                type: identity.type ?? existing.type,
                transformBaseUrl: identity.transformBaseUrl ?? existing.transformBaseUrl,
                webImage: identity.webImage ?? existing.webImage,
                ...(origWidth ? { origWidth } : {}),
                ...(origHeight ? { origHeight } : {}),
              },
              cropConfig
            ),
            parsed
          );
        }
        const sized = sizes?.get(identity.id);
        const origWidth = identity.origWidth ?? sized?.width;
        const origHeight = identity.origHeight ?? sized?.height;
        return withVideoDefaults(
          {
            ...identity,
            ...seedAssetCrop(cropConfig, { origWidth, origHeight }),
            ...(origWidth ? { origWidth } : {}),
            ...(origHeight ? { origHeight } : {}),
            alt: identity.alt ?? parsed?.alt ?? "",
            ...(identity.mobile?.id
              ? { differentMobileAsset: true as const, mobile: identity.mobile }
              : {}),
          },
          parsed
        );
      });
      const isNewAsset = Boolean(focusedAsset && focusedId && !previousById.has(focusedId));
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
            ? applyCropConfig(savedCrop?.transform ?? source.transform, cropConfig, viewport)
            : source.transform,
          focalPoint: focusedAsset
            ? savedCrop?.focalPoint ?? (isNewAsset ? { x: 0.5, y: 0.5 } : source.focalPoint)
            : source.focalPoint,
          mirror: focusedAsset ? (isNewAsset ? undefined : savedMirror(savedCrop)) : source.mirror,
        },
        {
          assets: nextAssets,
          activeAssetId: focusedAsset?.id,
          activeViewport: focusedAsset && viewport === "mobile" ? "mobile" : undefined,
          profile: source.profile,
          profileSettings: source.profileSettings ?? cropConfig.active,
          omitWebImage: persistPolicy.omitWebImage,
          omitName: persistPolicy.omitName,
          authorFields: additionalFields.fields,
        }
      );
      const next = desktopMobileMode ? payload : withoutDesktopMobile(payload);
      settingsRef.current = next;
      setAssets(parsedList);
      setAssetReady(true);
      setSettings(next);
    },
    [additionalFields.fields, cropConfig, desktopMobileMode, persistPolicy.omitName, persistPolicy.omitWebImage, videoDefaults]
  );

  const onCompactSelect = useCallback(
    (rawAssets: unknown[], additionalInfo?: unknown) => {
      if (!rawAssets.length) return;
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo);
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
    [applyAssets, compact.maxLimit, compact.mode, focused?.id]
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
        mirror: savedMirror(crop),
        transform: applyCropConfig(crop?.transform ?? source.transform, cropConfig, nextViewport),
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
      mirror: savedMirror(desktop),
      transform: applyCropConfig(desktop?.transform ?? source.transform, cropConfig, "mobile"),
    });
  }, [cropConfig, focused, persist]);

  const onMatchMobileCrop = useCallback(() => {
    if (!focused) return;
    const source = settingsRef.current;
    const stashed = stashActiveCrop(source, focused.id);
    const current = savedAssetById(stashed, focused.id);
    const mobile = viewportCrop(current, "mobile");
    const focalPoint = mobile?.focalPoint ?? { x: 0.5, y: 0.5 };
    const nextAssets = (stashed.assets ?? []).map((asset) => {
      if (asset.id !== focused.id) return asset;
      const cleared = withoutMobileCrop(asset);
      return {
        ...(cleared ?? asset),
        focalPoint,
        mirror: savedMirror(mobile),
        transform: mobile?.transform ?? asset.transform,
      } as SavedBynderAsset;
    });
    persist({
      ...stashed,
      assets: nextAssets,
      activeViewport: undefined,
      focalPoint,
      mirror: savedMirror(mobile),
      transform: applyCropConfig(mobile?.transform ?? source.transform, cropConfig, "desktop"),
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
        mirror: viewingRow ? savedMirror(desktop) : source.mirror,
        transform: viewingRow ? desktop?.transform ?? source.transform : source.transform,
      });
    },
    [persist]
  );

  const onDifferentAssetChange = (useDifferent: boolean) => {
    if (!focused || !isImageAsset(focused)) return;
    const source = settingsRef.current;
    const stashed = stashActiveCrop(source, focused.id);
    const current = savedAssetById(stashed, focused.id);
    const desktopCrop = {
      focalPoint: current?.focalPoint ?? source.focalPoint,
      transform: current?.transform ?? source.transform,
      mirror: savedMirror(current),
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
          mirror: savedMirror(restored),
          transform: restored.transform,
        } as SavedBynderAsset;
      }
      if (remembered?.id) {
        return { ...asset, differentMobileAsset: true as const, mobile: remembered };
      }
      const { mobile: _mobile, ...rest } = asset;
      return {
        ...rest,
        focalPoint: desktopCrop.focalPoint,
        mirror: desktopCrop.mirror,
        transform: desktopCrop.transform,
        differentMobileAsset: true as const,
      };
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
          ? remembered.focalPoint ?? { x: 0.5, y: 0.5 }
          : { x: 0.5, y: 0.5 }
        : sameCrop.focalPoint ?? { x: 0.5, y: 0.5 },
      mirror: useDifferent ? (remembered?.id ? savedMirror(remembered) : undefined) : savedMirror(sameCrop),
      transform: useDifferent
        ? remembered?.id
          ? remembered.transform ?? clearedTransform
          : clearedTransform
        : sameCrop.transform ?? clearedTransform,
    });
    setEditorOpen(true);
  };

  const onReplaceDesktop = useCallback(
    (rowId: string, rawAssets: unknown[], additionalInfo?: unknown) => {
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo);
      const parsed = parseBynderAssets(incoming)[0];
      const saved = asSavedAssets(
        slimPersistedAssets(incoming, {
          omitWebImage: persistPolicy.omitWebImage,
          omitName: persistPolicy.omitName,
        })
      )?.[0];
      if (!parsed || !saved) return;
      const source = settingsRef.current;
      const stashed = stashActiveCrop(source, rowId);
      const size = originalSize(saved, rawAssets[0], additionalInfo);
      const seeded = seedAssetCrop(cropConfig, size);
      const focalPoint = seeded.focalPoint ?? { x: 0.5, y: 0.5 };
      const nextAssets = (stashed.assets ?? []).map((asset) => {
        if (asset.id !== rowId) return asset;
        if (isDocumentAsset(parsed) || isDocumentAsset(saved)) {
          return {
            id: saved.id,
            name: saved.name,
            type: "DOCUMENT" as const,
            url: saved.url,
            downloadUrl: saved.downloadUrl,
            ...(saved.additional ? { additional: saved.additional } : {}),
          };
        }
        const { origWidth: _w, origHeight: _h, ...kept } = asset;
        const keepMobile = isImageAsset(parsed) && isImageAsset(asset.mobile);
        const { mobile: _mobile, differentMobileAsset: _split, ...withoutMobile } = kept;
        return {
          ...withoutMobile,
          id: saved.id,
          name: saved.name,
          type: saved.type,
          transformBaseUrl: saved.transformBaseUrl,
          webImage: saved.webImage,
          ...size,
          focalPoint,
          transform: seeded.transform,
          ...(keepMobile ? { mobile: asset.mobile, differentMobileAsset: asset.differentMobileAsset } : {}),
        };
      });
      const document = isDocumentAsset(parsed);
      setAssets((current) => current.map((item) => (item.id === rowId ? parsed : item)));
      persist({
        ...stashed,
        assets: nextAssets,
        activeAssetId: document ? undefined : saved.id,
        ...(document
          ? { activeViewport: undefined }
          : {
              activeViewport: "desktop" as const,
              focalPoint,
              mirror: undefined,
              transform: seeded.transform ?? defaultTransform(),
            }),
      });
      if (!document) setEditorOpen(true);
    },
    [cropConfig, persist, persistPolicy.omitName, persistPolicy.omitWebImage]
  );

  const onSelectMobile = useCallback(
    (rowId: string, rawAssets: unknown[], additionalInfo?: unknown) => {
      const incoming = normalizeCompactAssets(rawAssets, additionalInfo);
      const parsed = parseBynderAssets(incoming)[0];
      const saved = asSavedAssets(
        slimPersistedAssets(incoming, {
          omitWebImage: persistPolicy.omitWebImage,
          omitName: persistPolicy.omitName,
        })
      )?.[0];
      if (!parsed || !saved || !isImageAsset(parsed)) return;
      const source = settingsRef.current;
      const stashed = stashActiveCrop(source, rowId);
      const desktop = (stashed.assets ?? []).find((asset) => asset.id === rowId);
      if (!desktop || !isImageAsset(desktop)) return;
      const size = originalSize(saved, rawAssets[0], additionalInfo);
      const seeded = seedAssetCrop(cropConfig, size);
      const nextAssets = (stashed.assets ?? []).map((asset) => {
        if (asset.id !== rowId) return asset;
        const sameFile = saved.id === asset.id;
        return {
          ...asset,
          differentMobileAsset: true as const,
          mobile: {
            focalPoint: seeded.focalPoint,
            transform: applyCropConfig(seeded.transform ?? defaultTransform(), cropConfig, "mobile", size),
            id: saved.id,
            name: saved.name,
            type: saved.type,
            transformBaseUrl: saved.transformBaseUrl,
            webImage: saved.transformBaseUrl ? undefined : saved.webImage,
            ...size,
            alt: sameFile ? asset.alt ?? parsed.alt ?? "" : parsed.alt ?? "",
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
        mirror: savedMirror(mobile),
        transform: mobile?.transform ?? source.transform,
        alt: mobile?.alt ?? "",
      });
      setEditorOpen(true);
    },
    [cropConfig, persist, persistPolicy.omitName, persistPolicy.omitWebImage]
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
    const host = editorHostRef.current;
    if (hydrated.current || (!host && !customField)) return;
    try {
      const raw = host ? host.initialValue : customField!.field.getData();
      const { settings: prepared, changed, missingProfile: missing } = hydrateFieldValue(raw, {
        cropConfig: fieldCropConfig,
        omitWebImage: persistPolicy.omitWebImage,
        omitName: persistPolicy.omitName,
        authorFields: additionalFields.fields,
      });
      const limited = host?.singleAsset && prepared.assets && prepared.assets.length > 1
        ? { ...prepared, assets: prepared.assets.slice(0, 1) }
        : prepared;
      const payload = persistedPayload(limited);
      lastSaved.current = host || changed ? "" : safeJsonStringify(payload);
      setChangedOnLoad(changed);
      setMissingProfile(missing);
      settingsRef.current = limited;
      setSettings(limited);
      const parsedList = parseBynderAssets(limited.assets);
      if (parsedList.length) setAssets(parsedList);
      else {
        const fromSettings = assetFromSettings(limited);
        setAssets(fromSettings ? [fromSettings] : []);
      }
      if (host) host.onDraft(payload);
    } catch (error) {
      console.error("Bynder Image Settings hydrate failed", error);
    } finally {
      hydrated.current = true;
      setAssetReady(true);
    }
  }, [additionalFields.fields, customField, fieldCropConfig, persistPolicy.omitName, persistPolicy.omitWebImage]);

  useEffect(() => {
    const entry = customField?.entry as { onSave?: (callback: () => void) => void } | undefined;
    entry?.onSave?.(() => setChangedOnLoad(false));
  }, [customField]);

  useEffect(() => rememberBynderSession(() => setBynderTokenTick((tick) => tick + 1)), []);

  useEffect(() => {
    if (!assetReady || !compact.portalUrl) return undefined;
    const ids = missingOriginalSizeIds(settingsRef.current.assets);
    if (!ids.length) {
      setOriginalSizeBlocked(false);
      return undefined;
    }
    let cancelled = false;
    void fetchOriginalPixelSizes(compact.portalUrl, ids).then((sizes) => {
      if (cancelled) return;
      const latest = settingsRef.current;
      const assets = mergeOriginalSizes(latest.assets, sizes);
      if (!assets) {
        setOriginalSizeBlocked(missingOriginalSizeIds(latest.assets).length > 0);
        return;
      }
      persist({ ...latest, assets });
      setOriginalSizeBlocked(false);
      setChangedOnLoad(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assetReady, bynderTokenTick, compact.portalUrl, persist]);

  useEffect(() => {
    if (!assetReady) return undefined;
    const host = editorHostRef.current;
    if (!host && !customField?.field) return undefined;
    const payload = persistedPayload(settings);
    const serialized = safeJsonStringify(payload);
    if (!serialized || serialized === lastSaved.current) return undefined;
    if (host) {
      host.onDraft(payload);
      lastSaved.current = serialized;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      try {
        const done = customField!.field.setData(payload);
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
  const showCropChrome = Boolean(panel) && !isDocumentAsset(panel);
  const hasDatUrl = Boolean(panel?.transformBaseUrl);
  const datActive = hasDatUrl;
  const profileOptions = profileSelectOptions(cropConfig, desktopMobileMode);
  const transformFields = {
    value: editorTransform,
    profiles: profileOptions,
    showProfile: profileOptions.length > 0,
    profile: cropConfig.profile ?? "",
  };
  const previewSrc = panel?.sourceUrl;
  const mobileAssetPreview =
    activeViewport === "mobile" && focusedSaved?.mobile?.id
      ? focusedSaved.mobile.webImage?.url ?? focusedSaved.mobile.transformBaseUrl
      : undefined;
  const editorSrc = mobileAssetPreview || previewSrc;
  const activeDatUrl =
    datActive && focused
      ? composeBynderImageUrl(persistedPayload(settings), { viewport: activeViewport, assetId: focused.id })
      : undefined;
  const copyUrl = activeDatUrl || editorSrc || previewSrc || "";
  const editorImage = editorSrc || previewSrc || "";
  const editorBootKey =
    editorOpen && !focusedIsVideo && !focusedIsDocument ? `${focused?.id ?? ""}:${activeViewport}` : "";

  useEffect(() => {
    if (!editorBootKey || !editorImage) {
      setEditorBooting(false);
      return undefined;
    }
    const src = editorImage;
    let cancelled = false;
    const img = new Image();
    const done = () => {
      if (!cancelled) setEditorBooting(false);
    };
    img.onload = done;
    img.onerror = done;
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      setEditorBooting(false);
      return undefined;
    }
    setEditorBooting(true);
    return () => {
      cancelled = true;
    };
    // The skeleton covers the first open of this asset and viewport, not later transform URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorBootKey]);

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

  const patchVideo = (key: keyof VideoPlayback, value: boolean | "light" | "dark") => {
    if (!focusedIsVideo) return;
    patchFocusedAsset((asset) => ({
      ...asset,
      video: { ...(asset.video ?? videoDefaults), [key]: value },
    }));
  };

  const playback = focusedSaved?.video ?? videoDefaults;

  if (!customField && !editorHost) {
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
  "profiles": ["hero", "card"],
  "defaultProfile": "hero"
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

      {originalSizeBlocked ? (
        <div className="notice-card warning compact" role="status">
          <strong>Original image size is not on this entry yet.</strong> Open the Bynder picker so Bynder can
          sign in, then close it. You do not need to choose the asset again. This field will read the original
          file’s width and height and show Unsaved changes. Save the entry to keep them.
        </div>
      ) : null}

      {changedOnLoad ? (
        <div className="notice-card warning compact unsaved-notice" role="status">
          {editorHost ? (
            <>
              <strong>Unsaved changes.</strong> These settings were updated to match the current configuration.
              Save to keep them.
            </>
          ) : (
            <>
              <strong>Unsaved changes.</strong> This field’s settings changed since the entry was last saved, so its
              saved value was updated to match (for example the render profile or the original image size). Save
              the entry to keep it.
            </>
          )}
        </div>
      ) : null}

      {missingProfile ? (
        <div className="notice-card warning compact" role="status">
          <strong>Render profile “{missingProfile}” is no longer in App Configuration.</strong> This entry keeps
          its saved aspect ratio, file type, and quality. Pick another profile to update them.
        </div>
      ) : null}
      {cropConfig.fieldProfileErrors.length ? (
        <div className="notice-card warning compact" role="alert">
          <strong>This field’s profile config has a problem.</strong>
          <ul>
            {cropConfig.fieldProfileErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
        linkedIds={
          profileCropsCanMatch(cropConfig.active)
            ? settings.assets
                ?.filter((asset) => {
                  if (asset.differentMobileAsset || asset.mobile?.id) return false;
                  if (!asset.mobile) return true;
                  return viewportCropsEqual(asset, asset.mobile);
                })
                .map((asset) => asset.id)
            : []
        }
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
              <fieldset className="video-options">
                <legend>Presentation</legend>
                {presentationOptions.map(([key, label]) => (
                  <label key={key} className="video-option">
                    <input
                      type="checkbox"
                      checked={playback[key]}
                      onChange={(event) => patchVideo(key, event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                {showControlsTheme ? (
                  <div className="video-theme" role="group" aria-label="Control appearance">
                    <span className="video-theme-label">Control appearance</span>
                    <label className="video-option">
                      <input
                        type="radio"
                        name="video-controls-theme"
                        checked={playback.controlsTheme !== "dark"}
                        onChange={() => patchVideo("controlsTheme", "light")}
                      />
                      Light
                    </label>
                    <label className="video-option">
                      <input
                        type="radio"
                        name="video-controls-theme"
                        checked={playback.controlsTheme === "dark"}
                        onChange={() => patchVideo("controlsTheme", "dark")}
                      />
                      Dark
                    </label>
                  </div>
                ) : null}
              </fieldset>
              <fieldset className="video-options">
                <legend>Initial Playback Settings</legend>
                {initialPlaybackOptions.map(([key, label]) => (
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
              <AdditionalFields fields={additionalFields.fields} values={authorValues(focusedSaved)} onChange={patchAdditional} />
              <section className="video-crop">
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
                {viewportsIdentical ? (
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

          {isCustomProfile(cropConfig.profile) ? (
            <p className="notice-card warning compact custom-aspect-disclaimer" role="note">
              Customize saves this aspect ratio on the asset. It will not necessarily appear at this ratio in
              the browser. The React site decides how the image is rendered and at what size.
            </p>
          ) : null}

          {editorBooting ? (
            <EditorSkeleton width={fitPreviewBox(editorTransform).width} height={fitPreviewBox(editorTransform).height} />
          ) : (
          <div className="editor-row">
            <aside className="editor-fields">
              <div className="crop-fields-card">
                <div className="crop-fields-card-header">
                  <p className="crop-fields-card-profile">
                    <span className="crop-fields-card-kicker">Image Profile:</span>
                    <strong>{profileName}</strong>
                  </p>
                  <p className="crop-fields-card-profile">
                    <span className="crop-fields-card-kicker">Aspect Ratio:</span>
                    <strong>{activeAspect ?? "—"}</strong>
                  </p>
                </div>
                <div className="crop-fields-card-body">
              {transformFormHasFields(transformFields) ? (
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">{datActive ? "Transforms" : "Crop frame"}</span>
                  <InfoTooltip>
                    {isCustomProfile(cropConfig.profile)
                      ? "Drag the right edge of the preview to set the aspect ratio for this viewport. Past the edge of the canvas, the preview shrinks and the ratio keeps widening. File type and quality stay as they are. The site chooses the pixel widths."
                      : "The render profile sets the aspect ratio, file type, and quality. The site chooses the pixel widths, and delivery keeps each one inside the Bynder max dimension. The focal point decides which part of the photo is kept when the image is cropped."}
                  </InfoTooltip>
                </div>
                <TransformForm
                  {...transformFields}
                  onProfileChange={onProfileChange}
                  onChange={(transform) => persist(stashActiveCrop({ ...settings, transform }, focused?.id))}
                />
              </div>
              ) : null}
              <div className="field-group">
                <div className="panel-title">
                  <span className="panel-title-label">Edit Crop &amp; Focal Point</span>
                  <InfoTooltip>
                    Drag the white circle, or click the image, to choose what stays in view when the image is
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
                <label className="asset-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.mirror === true}
                    onChange={(event) => {
                      const next = { ...settings, mirror: event.target.checked ? (true as const) : undefined };
                      if (!next.mirror) delete next.mirror;
                      persist(stashActiveCrop(next, focused?.id));
                    }}
                    aria-label="Mirror image"
                  />
                  <span>
                    Mirror
                    <InfoTooltip>
                      Flips the image left to right, across the vertical axis. Desktop and mobile stay in sync
                      until you change one of them. The site requests Bynder’s horizontal mirror after the crop.
                    </InfoTooltip>
                  </span>
                </label>
                {!focalCentered || (sameMobileAsset && !cropsLinked) ? (
                <div className="focal-reset-row">
                  {!focalCentered ? (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => onFocalChange({ x: 0.5, y: 0.5 })}
                    >
                      <span>Reset center</span>
                    </button>
                  ) : null}
                  {sameMobileAsset && !cropsLinked && activeViewport === "mobile" ? (
                    <button type="button" className="linkish" onClick={onMatchDesktopCrop}>
                      <span>Match desktop</span>
                    </button>
                  ) : null}
                  {sameMobileAsset && !cropsLinked && activeViewport === "desktop" ? (
                    <button type="button" className="linkish" onClick={onMatchMobileCrop}>
                      <span>Match mobile</span>
                    </button>
                  ) : null}
                </div>
                ) : null}
              </div>
                </div>
              </div>
              {editorHost ? null : <div className="field-group">
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
              </div>}
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
                key={`${panel?.id ?? ""}:${activeViewport}`}
                src={editorImage}
                alt={panel?.name}
                focalPoint={settings.focalPoint}
                transform={editorTransform}
                mirror={settings.mirror === true}
                customAspect={isCustomProfile(cropConfig.profile)}
                onAspectChange={onCustomAspect}
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
                        ? "Remove mobile asset (Use desktop for both)."
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
          )}

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
