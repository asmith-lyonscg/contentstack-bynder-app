import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompactPicker } from "../../components/CompactPicker";
import { CropFocalEditor } from "../../components/CropFocalEditor";
import { InfoTooltip } from "../../components/InfoTooltip";
import { LivePreview } from "../../components/LivePreview";
import { TransformForm } from "../../components/TransformForm";
import { useAppConfig, useAppSdk } from "../../common/hooks/useAppSdk";
import { COMPACT_PICKER_HEIGHT } from "../../lib/bynder/compactView";
import { assetFromSettings, normalizeCompactAssets, pickBynderAsset } from "../../lib/bynder/parseAsset";
import { roundCoord } from "../../lib/bynder/composeDatUrl";
import { applyCropConfig, resolveCompactViewConfig, resolveCropConfig, resolveEnableDat } from "../../lib/fieldConfig";
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
  const [asset, setAsset] = useState<ParsedBynderAsset | null>(null);
  const [assetReady, setAssetReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewUpdating, setPreviewUpdating] = useState(false);
  const lastSaved = useRef("");
  const previousAssetId = useRef<string | undefined>(undefined);
  const assetRef = useRef<ParsedBynderAsset | null>(null);
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
    (parsed: ParsedBynderAsset | null, assets?: unknown[]) => {
      if (assetKey(parsed) === assetKey(assetRef.current) && parsed) {
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
          (parsed?.transformBaseUrl ?? undefined) === current.transformBaseUrl &&
          Boolean(parsed) === Boolean(current.assetId || current.sourceUrl || current.assets?.length);
        if (sameSnapshot && parsed) {
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
            assetId: parsed?.id,
            transformBaseUrl: parsed?.transformBaseUrl,
            sourceUrl: parsed?.sourceUrl,
            datEnabled,
            assets: parsed ? assets ?? current.assets : undefined,
          }
        );
      });
    },
    [configAllowsDat, cropConfig]
  );

  const onCompactSelect = useCallback(
    (rawAssets: unknown[], additionalInfo?: unknown) => {
      const assets = normalizeCompactAssets(rawAssets, additionalInfo);
      const parsed = pickBynderAsset(assets);
      if (!parsed) return;
      commitAsset(parsed, assets);
    },
    [commitAsset]
  );

  const onCompactRemove = useCallback(() => {
    commitAsset(null, []);
  }, [commitAsset]);

  const onPickerOpenChange = useCallback(
    (open: boolean) => {
      const frame = customField?.frame as
        | { updateHeight?: (height: number) => void; enableAutoResizing?: () => void }
        | undefined;
      if (open) {
        frame?.updateHeight?.(COMPACT_PICKER_HEIGHT);
        return;
      }
      frame?.enableAutoResizing?.();
    },
    [customField]
  );

  useEffect(() => {
    if (!customField || hydrated.current) return;
    const saved = parseSavedSettings(customField.field.getData());
    const isNew = !saved.assetId && !saved.sourceUrl && !saved.assets?.length;
    saved.transform = applyCropConfig(saved.transform, cropConfig, isNew ? "defaults" : "locks");
    lastSaved.current = JSON.stringify(saved);
    previousAssetId.current = saved.assetId;
    setSettings(saved);
    setPreviewUrl(saved.url);
    const parsed = assetFromSettings(saved);
    assetRef.current = parsed;
    setAsset(parsed);
    setAssetReady(true);
    hydrated.current = true;
  }, [customField, cropConfig]);

  useEffect(() => {
    if (!customField?.field) return undefined;
    const serialized = JSON.stringify(settings);
    if (serialized === lastSaved.current) return undefined;
    const timer = window.setTimeout(() => {
      const done = customField.field.setData(settings);
      lastSaved.current = serialized;
      if (done && typeof (done as Promise<unknown>).then === "function") {
        void (done as Promise<unknown>).catch(() => undefined);
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

  if (!compact.portalUrl) {
    return (
      <div className="notice-card">
        <h3>Connect a Bynder portal</h3>
        <p>
          Set <code>bynderPortalUrl</code> in App Configuration, or override it on this field’s Config
          Parameter.
        </p>
        <pre>{`{
  "bynderPortalUrl": "acme.getbynder.com",
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

  const objectPosition = focalPointToObjectPosition(settings.focalPoint);

  return (
    <div className="bynder-settings">
      <header className="header">
        <div>
          <h2>Bynder image settings</h2>
          <p>{asset?.name ? asset.name : "Pick a Bynder image, then set crop and focal point."}</p>
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

      <CompactPicker
        portalUrl={compact.portalUrl}
        language={compact.language}
        mode={compact.mode}
        selected={asset}
        onSelect={onCompactSelect}
        onRemove={onCompactRemove}
        onOpenChange={onPickerOpenChange}
      />

      {datMissing && (
        <div className="notice-card warning">
          <h3>DAT is unavailable for this image</h3>
          <p>
            DAT is enabled in config, but this Bynder payload has no <code>files.transformBaseUrl</code>.
            Using CSS crop and focal point until then. Compact View File mode can supply a DAT URL as{" "}
            <code>selectedFile</code>.
          </p>
        </div>
      )}

      {previewSrc ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
