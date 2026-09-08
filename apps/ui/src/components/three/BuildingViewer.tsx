import { useCallback, useMemo, useRef, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { Asset, BuildingModel, Device } from "@gridone/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsChip } from "./AlertsChip";
import { ColorModeControl } from "./ColorModeControl";
import { LevelPanel } from "./LevelPanel";
import { buildLevelSummaries } from "./levelSummaries";
import { RoomPanel } from "./RoomPanel";
import { buildRoomStates, type RoomState } from "./roomStates";
import { SceneContent } from "./SceneContent";
import { parseBuildingScene } from "./sceneContract";
import { hslToCss } from "./temperature";
import { functionKeyOf, useViewerTheme, zoneTriplet } from "./themeColors";
import { useModelScene } from "./useModelScene";
import { useViewerState, type HoverInfo } from "./useViewerState";
import { ViewportControls } from "./ViewportControls";

export type BuildingViewerProps = {
  building: Asset;
  model: BuildingModel;
  assets: Asset[];
  devices: Device[];
};

const NO_STOREYS: ReadonlyMap<string, string> = new Map();

/** Function families actually present, so the legend lists only what's here. */
function presentFunctionKeys(roomStates: Map<string, RoomState>): string[] {
  const keys = new Set<string>();
  for (const state of roomStates.values()) {
    const key = functionKeyOf(state.objectType);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}

/**
 * Ref callback for the EffectComposer. @react-three/postprocessing (2.19)
 * never disposes a composer it replaces — and swapping the camera for the
 * plan replaces it, twice per round trip. Its multisampled render targets are
 * GPU memory garbage collection cannot reclaim, so every instance this ref
 * lets go of is released: the ones a swap replaces, and the last one, whose
 * detach on unmount arrives as a null instance.
 */
function useComposerJanitor() {
  const composerRef = useRef<{ dispose: () => void } | null>(null);
  return useCallback((instance: { dispose: () => void } | null) => {
    if (composerRef.current && composerRef.current !== instance) {
      composerRef.current.dispose();
    }
    composerRef.current = instance;
  }, []);
}

const HoverTooltip: FC<{ info: HoverInfo; state: RoomState }> = ({
  info,
  state,
}) => (
  <div
    className="pointer-events-none fixed z-50 -translate-y-full rounded-lg border border-border bg-popover px-3 py-1.5 text-xs shadow-md"
    style={{ left: info.x + 12, top: info.y - 8 }}
  >
    <span className="font-medium text-foreground">{state.name}</span>
    {state.temperature != null && (
      <span className="ml-2 text-muted-foreground">
        {state.temperature.toFixed(1)}°
      </span>
    )}
  </div>
);

/**
 * Live 3D digital twin of the building: exploded storeys from the converted
 * IFC scene, spaces coloured by room temperature (or function, alerts,
 * connectivity), a levels navigator that can isolate one storey and lay it
 * flat as a 2D plan, and an in-scene room panel.
 */
const BuildingViewer: FC<BuildingViewerProps> = ({
  building,
  model,
  assets,
  devices,
}) => {
  const { t } = useTranslation("home");
  const theme = useViewerTheme();
  const { scene, isLoading, error } = useModelScene(
    building.id,
    model.updated_at,
  );
  const parsed = useMemo(
    () => (scene ? parseBuildingScene(scene) : null),
    [scene],
  );
  const roomStates = useMemo(
    () => buildRoomStates(model.spaces ?? [], assets, devices),
    [model.spaces, assets, devices],
  );
  const levels = useMemo(
    () => (parsed ? buildLevelSummaries(parsed.storeys, roomStates) : []),
    [parsed, roomStates],
  );
  const functionKeys = useMemo(
    () => presentFunctionKeys(roomStates),
    [roomStates],
  );
  const {
    hover,
    setHover,
    selectedId,
    setSelectedId,
    focusedLevelId,
    focusLevel,
    viewMode,
    planStoreyId,
    togglePlan,
    exploded,
    toggleExploded,
    showFacade,
    toggleFacade,
    showMarkers,
    toggleMarkers,
    colorMode,
    setColorMode,
    panelExpanded,
    togglePanel,
    viewRequest,
    revealedDevice,
    focusZone,
    focusDevice,
    goToDepth,
    resetView,
  } = useViewerState({
    levels,
    spaceStoreys: parsed?.spaceStoreys ?? NO_STOREYS,
    scene,
  });
  const composerRef = useComposerJanitor();

  const planActive = viewMode === "plan";
  const hoveredState = hover ? roomStates.get(hover.globalId) : undefined;
  const selectedState = selectedId ? roomStates.get(selectedId) : undefined;

  return (
    <div
      className="building-viewer relative aspect-[16/9] max-h-[70vh] min-h-64 w-full overflow-hidden rounded-xl"
      data-testid="building-viewer"
    >
      <Canvas
        dpr={[1, 2]}
        // On demand: a static home page must not spin the GPU. The frame loop
        // keeps invalidating while anything is easing or pulsing.
        frameloop="demand"
        shadows="soft"
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 45, near: 0.1, far: 500 }}
        style={{ cursor: hover ? "pointer" : "grab" }}
        // A click into empty sky drops the selection — never the isolation,
        // which a stray click while orbiting would otherwise undo.
        onPointerMissed={() => setSelectedId(null)}
      >
        {scene && parsed && (
          <>
            <SceneContent
              scene={scene}
              parsed={parsed}
              roomStates={roomStates}
              theme={theme}
              colorMode={colorMode}
              hoveredId={hover?.globalId ?? null}
              selectedId={selectedId}
              focusedStoreyId={focusedLevelId}
              planStoreyId={planStoreyId}
              exploded={exploded}
              showFacade={showFacade}
              showMarkers={showMarkers}
              viewRequest={viewRequest}
              onHover={setHover}
              onSelect={setSelectedId}
              onFocusZone={focusZone}
            />
            {/* Composer replaces the canvas's own MSAA, hence multisampling.
                Threshold sits above the neutral-room emissive so only lit
                facade panes, the selection glow and alert pulses bloom. A
                plan is a flat document: bloom halos over it hurt reading, so
                post-processing stands down while the plan is open. */}
            <EffectComposer
              ref={composerRef}
              multisampling={4}
              enabled={!planActive}
            >
              <Bloom
                mipmapBlur
                intensity={theme.isDark ? 0.55 : 0.28}
                luminanceThreshold={0.55}
                luminanceSmoothing={0.3}
              />
            </EffectComposer>
          </>
        )}
      </Canvas>

      {isLoading && <Skeleton className="absolute inset-0 rounded-xl" />}

      {error != null && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground"
          data-testid="building-viewer-error"
        >
          {t("zonesByLevel.viewer.loadError")}
        </div>
      )}

      {hover && hoveredState && hover.globalId !== selectedId && (
        <HoverTooltip info={hover} state={hoveredState} />
      )}

      {scene && !error && (
        <>
          <LevelPanel
            levels={levels}
            devices={devices}
            roomStates={roomStates}
            theme={theme}
            colorMode={colorMode}
            expanded={panelExpanded}
            focusedLevelId={focusedLevelId}
            selectedZoneId={selectedId}
            planActive={planActive}
            onToggleExpanded={togglePanel}
            onGoToDepth={goToDepth}
            onFocusLevel={focusLevel}
            onSelectZone={focusZone}
            onSelectDevice={focusDevice}
            onTogglePlan={togglePlan}
          />

          {/* Right-hand column: what is wrong, then the room being read. The
              chip is not always there, so they stack rather than each owning a
              fixed offset. */}
          <div className="pointer-events-none absolute bottom-3 right-3 top-3 z-10 flex flex-col items-end gap-2">
            <AlertsChip
              devices={devices}
              roomStates={roomStates}
              levels={levels}
              onFocusRoom={focusDevice}
            />
            {selectedState && (
              <RoomPanel
                state={selectedState}
                accent={hslToCss(zoneTriplet(selectedState, theme, colorMode))}
                reveal={revealedDevice}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>

          {/* Bottom-right cluster: the colour key sits left of the chrome that
              changes the view. */}
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-end gap-1.5">
            <ColorModeControl
              mode={colorMode}
              onChange={setColorMode}
              theme={theme}
              functionKeys={functionKeys}
            />
            <ViewportControls
              exploded={exploded}
              facade={showFacade}
              markers={showMarkers}
              planActive={planActive}
              planEnabled={focusedLevelId !== null}
              onToggleExplode={toggleExploded}
              onToggleFacade={toggleFacade}
              onToggleMarkers={toggleMarkers}
              onResetView={resetView}
              onTogglePlan={togglePlan}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default BuildingViewer;
