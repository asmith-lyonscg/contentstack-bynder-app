import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CropFocalEditor } from "../../components/CropFocalEditor";
import { InfoTooltip } from "../../components/InfoTooltip";
import { LivePreview } from "../../components/LivePreview";
import { TransformForm } from "../../components/TransformForm";
import { useAppConfig, useAppSdk } from "../../common/hooks/useAppSdk";
import { pickBynderAsset } from "../../lib/bynder/parseAsset";
import { roundCoord } from "../../lib/bynder/composeDatUrl";
import {
  applyCropConfig,
  liveSiblingRaw,
  readSiblingFieldData,
  resolveBynderFieldUid,
  resolveCropConfig,
  resolveEnableDat,
  resolveSiblingAsset,
} from "../../lib/fieldConfig";
import {
  isEmptyBynderValue,
  parseAutoUpdateEntry,
  parseExtensionFieldChange,
  shouldApplyHostFieldData,
} from "../../lib/hostEvents";
import { buildSettingsPayload, parseSavedSettings } from "../../lib/settings";
import { focalPointToObjectPosition } from "../../delivery/composeBynderImageUrl";
import type { BynderImageSettings, FocalPoint, ParsedBynderAsset } from "../../lib/types";
import "./CustomField.css";

function readFieldConfig(customField: unknown): unknown {
  if (!customField || typeof customField !== "object") return undefined;
  const location = customField as Record<string, unknown>;
  if (location.fieldConfig) return location.fieldConfig;
  const field = location.field as Record<string, unknown> | undefined;
  if (field?.config) return field.config;
  const schema = field?.schema as Record<string, unknown> | undefined;
  return schema?.config ?? schema?.field_metadata;
}

function percent(value: number): string {
  return String(Math.round(value * 1000) / 10);
}

function assetKey(asset: ParsedBynderAsset | null): string {
  if (!asset) return "";
  return `${asset.id}\0${asset.sourceUrl}\0${asset.transformBaseUrl ?? ""}`;
}

export default function CustomField() {
  const sdk = useAppSdk();
  const appConfig = useAppConfig();
  const customField = sdk?.location.CustomField;
  const fieldConfig = readFieldConfig(customField);
  const fieldUid = useMemo(
    () => resolveBynderFieldUid(fieldConfig, appConfig),
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

  const [settings, setSettings] = useState<BynderImageSettings>(() => parseSavedSettings(null, fieldUid ?? ""));
  const [asset, setAsset] = useState<ParsedBynderAsset | null>(null);
  const [assetReady, setAssetReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewUpdating, setPreviewUpdating] = useState(false);
  const lastSaved = useRef("");
  const previousAssetId = useRef<string | undefined>(undefined);
  const assetRef = useRef<ParsedBynderAsset | null>(null);
  const writingSelf = useRef(false);
  const lastSiblingJson = useRef<string | undefined>(undefined);
  const syncAssetRef = useRef<(liveEntry?: Record<string, unknown>, fieldEventData?: unknown) => void>(
    () => undefined
  );
  const hydrated = useRef(false);

  const persist = useCallback((next: BynderImageSettings) => {
    const payload = buildSettingsPayload({
      ...next,
      transform: applyCropConfig(next.transform, cropConfig),
    });
    setSettings(payload);
    return payload;
  }, [cropConfig]);

  const commitAsset = useCallback(
    (parsed: ParsedBynderAsset | null, allowClear: boolean) => {
      if (!parsed && !allowClear && assetRef.current) {
        setAssetReady(true);
        return;
      }
      if (assetKey(parsed) === assetKey(assetRef.current)) {
        setAssetReady(true);
        return;
      }

      assetRef.current = parsed;
      setAsset(parsed);
      setAssetReady(true);

      setSettings((current) => {
        const sameSnapshot =
          (parsed?.id ?? undefined) === current.assetId &&
          (parsed?.sourceUrl ?? undefined) === current.sourceUrl &&
          (parsed?.transformBaseUrl ?? undefined) === current.transformBaseUrl;
        if (sameSnapshot && Boolean(parsed) === Boolean(current.assetId || current.sourceUrl)) {
          return current;
        }

        const assetChanged =
          previousAssetId.current !== undefined && parsed?.id !== previousAssetId.current;
        if (parsed?.id) previousAssetId.current = parsed.id;
        else previousAssetId.current = undefined;

        const hasDatUrl = Boolean(parsed?.transformBaseUrl);
        const datEnabled = Boolean(configAllowsDat && hasDatUrl && (current.datEnabled ?? false));

        return buildSettingsPayload(
          {
            ...current,
            transform: applyCropConfig(current.transform, cropConfig),
            focalPoint: assetChanged ? { x: 0.5, y: 0.5 } : current.focalPoint,
          },
          {
            sourceFieldUid: fieldUid ?? current.sourceFieldUid,
            assetId: parsed?.id,
            transformBaseUrl: parsed?.transformBaseUrl,
            sourceUrl: parsed?.sourceUrl,
            datEnabled,
          }
        );
      });
    },
    [configAllowsDat, cropConfig, fieldUid]
  );

  const applySiblingRaw = useCallback(
    (raw: unknown, allowClear: boolean) => {
      const serialized = JSON.stringify(raw ?? null);
      const parsed = pickBynderAsset(raw, assetRef.current?.id);

      if (parsed) {
        if (lastSiblingJson.current === serialized) {
          setAssetReady(true);
          return;
        }
        lastSiblingJson.current = serialized;
        commitAsset(parsed, false);
        return;
      }

      if (!allowClear && assetRef.current) {
        setAssetReady(true);
        return;
      }

      if (lastSiblingJson.current === serialized) {
        setAssetReady(true);
        return;
      }
      lastSiblingJson.current = serialized;
      commitAsset(null, true);
    },
    [commitAsset]
  );

  const syncAsset = useCallback(
    (liveEntry?: Record<string, unknown>, fieldEventData?: unknown) => {
      if (!fieldUid) {
        commitAsset(null, true);
        return;
      }

      if (fieldEventData !== undefined) {
        if (!shouldApplyHostFieldData(fieldEventData)) return;
        applySiblingRaw(fieldEventData, true);
        return;
      }

      const live = liveSiblingRaw(fieldUid, liveEntry);
      if (live.present) {
        const parsed = pickBynderAsset(live.value, assetRef.current?.id);
        if (parsed) {
          applySiblingRaw(live.value, false);
          return;
        }
        // $autoUpdateEntry / entry.onChange is the only iframe-reachable
        // remove signal. Ignore empties while our own setData is in flight.
        applySiblingRaw(live.value, !writingSelf.current);
        return;
      }

      const result = resolveSiblingAsset({
        uid: fieldUid,
        liveEntry,
        fieldData: readSiblingFieldData(customField?.entry, fieldUid),
        writingSelf: writingSelf.current,
        current: assetRef.current,
      });

      if (result.type === "apply") {
        lastSiblingJson.current = JSON.stringify(readSiblingFieldData(customField?.entry, fieldUid) ?? null);
        commitAsset(result.asset, false);
        return;
      }
      if (result.type === "keep") {
        setAssetReady(true);
        return;
      }
      commitAsset(null, !assetRef.current);
    },
    [applySiblingRaw, commitAsset, customField, fieldUid]
  );

  syncAssetRef.current = syncAsset;

  useEffect(() => {
    if (!customField || hydrated.current) return;
    const saved = parseSavedSettings(customField.field.getData(), fieldUid ?? "");
    const isNew = !saved.assetId && !saved.sourceUrl;
    saved.transform = applyCropConfig(saved.transform, cropConfig, isNew ? "defaults" : "locks");
    lastSaved.current = JSON.stringify(saved);
    previousAssetId.current = saved.assetId;
    setSettings(saved);
    setPreviewUrl(saved.url);
    hydrated.current = true;
    syncAssetRef.current();
  }, [customField, fieldUid, cropConfig]);

  useEffect(() => {
    const entry = customField?.entry as
      | {
          onChange?: (cb: (unresolved?: Record<string, unknown>) => void) => unknown;
          getDraftData?: () => Promise<unknown>;
        }
      | undefined;
    if (!fieldUid || !customField || !entry) return undefined;

    const unsubs: Array<() => void> = [];

    // Documented App SDK: entry.onChange ← host $autoUpdateEntry / entryChange.
    const fromEntryChange = entry.onChange?.((unresolved) => {
      syncAssetRef.current(unresolved);
      const fromEvent = liveSiblingRaw(fieldUid, unresolved);
      const eventParsed = fromEvent.present ? pickBynderAsset(fromEvent.value, assetRef.current?.id) : null;
      if (eventParsed || (fromEvent.present && isEmptyBynderValue(fromEvent.value))) return;
      void entry.getDraftData?.().then((draft) => {
        const live = liveSiblingRaw(fieldUid, draft);
        if (!live.present) return;
        if (pickBynderAsset(live.value, assetRef.current?.id)) {
          applySiblingRaw(live.value, false);
          return;
        }
        applySiblingRaw(live.value, !writingSelf.current);
      });
    });
    if (typeof fromEntryChange === "function") unsubs.push(fromEntryChange as () => void);

    // Documented App SDK: field.onChange ← host $extensionFieldChange.
    // entry.getField(uid).onChange is stripped by the SDK, so we must subscribe
    // on THIS field. That also registers the iframe so the host forwards the
    // Bynder picker’s events (the window CustomEvents stay on the parent page).
    const selfField = customField.field as {
      onChange?: (cb: (data: unknown) => void) => unknown;
      _data?: unknown;
      _resolvedData?: unknown;
    };
    const fromSelfFieldChange = selfField.onChange?.((data) => {
      if (!shouldApplyHostFieldData(data)) return;
      try {
        const restored = lastSaved.current ? JSON.parse(lastSaved.current) : undefined;
        if (restored) {
          selfField._data = restored;
          selfField._resolvedData = restored;
        }
      } catch {
        /* keep host payload */
      }
      applySiblingRaw(data, true);
    });
    if (typeof fromSelfFieldChange === "function") unsubs.push(fromSelfFieldChange as () => void);

    const emitter = (
      entry as {
        _emitter?: {
          on: (name: string, cb: (payload: { data?: unknown }) => void) => void;
          emitEvent: (name: string, args: unknown[]) => void;
        };
      }
    )._emitter;
    if (emitter?.on && emitter.emitEvent) {
      const onExt = (payload: { data?: unknown }) => {
        if (!shouldApplyHostFieldData(payload?.data)) return;
        applySiblingRaw(payload.data, true);
      };
      emitter.on("extensionFieldChange", onExt);
      emitter.emitEvent("_eventRegistration", [{ name: "extensionFieldChange" }]);
    }

    const ourExtensionUid = sdk?.locationUID ?? sdk?.ids?.locationUID;

    const onExtensionFieldChange = (event: Event) => {
      const parsed = parseExtensionFieldChange(event);
      if (!parsed) return;
      if (ourExtensionUid && parsed.extensionUid === ourExtensionUid) return;
      if (!shouldApplyHostFieldData(parsed.data)) return;
      applySiblingRaw(parsed.data, true);
    };

    const onAutoUpdateEntry = (event: Event) => {
      const entryData = parseAutoUpdateEntry(event);
      if (!entryData) return;
      syncAssetRef.current(entryData);
    };

    const targets: EventTarget[] = [window];
    try {
      if (window.parent && window.parent !== window) targets.push(window.parent);
    } catch {
      /* cross-origin parent */
    }

    for (const target of targets) {
      try {
        target.addEventListener("$extensionFieldChange", onExtensionFieldChange);
        target.addEventListener("$autoUpdateEntry", onAutoUpdateEntry);
        unsubs.push(() => {
          target.removeEventListener("$extensionFieldChange", onExtensionFieldChange);
          target.removeEventListener("$autoUpdateEntry", onAutoUpdateEntry);
        });
      } catch {
        /* parent may be cross-origin */
      }
    }

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [applySiblingRaw, customField, fieldUid, sdk]);

  useEffect(() => {
    if (!customField?.field) return undefined;
    const serialized = JSON.stringify(settings);
    if (serialized === lastSaved.current) return undefined;
    const timer = window.setTimeout(() => {
      writingSelf.current = true;
      const done = customField.field.setData(settings);
      lastSaved.current = serialized;
      const release = () => {
        window.setTimeout(() => {
          writingSelf.current = false;
        }, 2000);
      };
      if (done && typeof (done as Promise<unknown>).then === "function") {
        (done as Promise<unknown>).then(release, release);
      } else {
        release();
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customField, settings]);

  const hasDatUrl = Boolean(asset?.transformBaseUrl);
  const datMissing = Boolean(asset && configAllowsDat && !hasDatUrl);
  const datActive = Boolean(configAllowsDat && hasDatUrl && settings.datEnabled);
  const previewSrc = asset?.sourceUrl;

  useEffect(() => {
    if (!datActive) {
      setPreviewUpdating(false);
      setPreviewUrl(undefined);
      return undefined;
    }
    if (settings.url === previewUrl) {
      setPreviewUpdating(false);
      return undefined;
    }
    setPreviewUpdating(true);
    const timer = window.setTimeout(() => {
      setPreviewUrl(settings.url);
      setPreviewUpdating(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [datActive, settings.url, previewUrl]);

  const onFocalChange = (focalPoint: FocalPoint) => {
    persist({
      ...settings,
      focalPoint: { x: roundCoord(focalPoint.x), y: roundCoord(focalPoint.y) },
    });
  };

  const onPercentChange = (axis: "x" | "y", raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onFocalChange({ ...settings.focalPoint, [axis]: n / 100 });
  };

  const onToggleDat = (enabled: boolean) => {
    persist({
      ...settings,
      datEnabled: enabled && configAllowsDat && hasDatUrl,
    });
  };

  if (!customField) {
    return <p className="notice">This view only works as a Custom Field location.</p>;
  }

  if (!fieldUid) {
    return (
      <div className="notice-card">
        <h3>Connect a Bynder field</h3>
        <p>
          Set <code>bynderFieldUid</code> on this field’s Config Parameter, or as the default in App
          Configuration.
        </p>
        <pre>{`{
  "bynderFieldUid": "hero_image",
  "aspect": "16:9",
  "width": 1200,
  "lockAspect": true
}`}</pre>
      </div>
    );
  }

  if (!assetReady) {
    return <p className="notice">Loading…</p>;
  }

  if (!previewSrc) {
    return (
      <div className="notice-card">
        <h3>Assign an image first</h3>
        <p>
          You must first assign an image to <code>{fieldUid}</code>.
        </p>
      </div>
    );
  }

  const objectPosition = focalPointToObjectPosition(settings.focalPoint);

  return (
    <div className="bynder-settings">
      <header className="header">
        <div>
          <h2>Bynder image settings</h2>
          <p>
            {asset?.name ? asset.name : "Bynder image"} · source field <code>{fieldUid}</code>
          </p>
        </div>
        {configAllowsDat && hasDatUrl && (
          <label className="dat-toggle">
            <input
              type="checkbox"
              checked={datActive}
              onChange={(event) => onToggleDat(event.target.checked)}
            />
            DAT transforms
          </label>
        )}
      </header>

      {datMissing && (
        <div className="notice-card warning">
          <h3>DAT is unavailable for this image</h3>
          <p>
            DAT is enabled in config, but this Bynder payload has no <code>files.transformBaseUrl</code>.
            Add that key to the official Bynder saved keys. Using CSS crop and focal point until then.
          </p>
        </div>
      )}

      <div className="editor-row">
        <aside className="editor-fields">
          <div className="field-group">
            <div className="panel-title">
              Crop &amp; focal point
              <InfoTooltip>
                Click or drag the red dot, or anywhere on the image, to set the focal point. Saved as
                CSS <code>object-position</code>. If this panel is smaller than the crop size, the
                preview shrinks.
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
              {datActive ? "Transforms" : "Crop frame"}
              <InfoTooltip>
                {datActive ? (
                  <>
                    Bynder DAT size, operation, format, and quality. Fill crops to the box; Fit scales
                    without cropping.
                  </>
                ) : (
                  <>
                    Width, height, and aspect are saved for your site’s CSS crop box (
                    <code>object-fit: cover</code>). The image is that box, not the delivery size.
                  </>
                )}
              </InfoTooltip>
            </div>
            <TransformForm
              value={settings.transform}
              datEnabled={datActive}
              aspectPresets={cropConfig.aspectPresets}
              locks={{
                aspect: cropConfig.lockAspect,
                width: cropConfig.lockWidth,
                height: cropConfig.lockHeight,
              }}
              onChange={(transform) => persist({ ...settings, transform })}
            />
          </div>
        </aside>
        <section className="editor-preview">
          <CropFocalEditor
            key={`${asset?.id ?? ""}:${previewSrc}`}
            src={previewSrc}
            alt={asset?.name}
            focalPoint={settings.focalPoint}
            transform={settings.transform}
            onChange={onFocalChange}
          />
        </section>
      </div>

      {datActive && (
        <section className="panel">
          <div className="panel-title">
            Transformed preview
            <InfoTooltip>
              Live Bynder DAT URL using the current focal point, size, format, and quality.
            </InfoTooltip>
          </div>
          <LivePreview
            mode="dat"
            url={previewUrl}
            loading={previewUpdating}
            objectPosition={objectPosition}
          />
        </section>
      )}
    </div>
  );
}
