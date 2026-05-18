import type { PointerEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { BuildingScene } from "./BuildingScene";
import { HomeControls } from "./HomeControls";
import { HoverTooltip } from "./HoverTooltip";
import { RoomDetailOverlay } from "./RoomDetailOverlay";
import { useFakedTelemetry } from "./hooks/useFakedTelemetry";
import { useHomeCamera } from "./hooks/useHomeCamera";
import { washingtonOpera } from "./data/washingtonOpera";
import type { FloorGeometry, MockDevice, RoomGeometry } from "./data/types";

export default function HomePage() {
  const [paused, setPaused] = useState(false);
  const [restartToken, setRestartToken] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<{
    room: RoomGeometry;
    floor: FloorGeometry;
  } | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<RoomGeometry | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<{
    device: MockDevice;
    room: RoomGeometry;
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const telemetry = useFakedTelemetry({ paused, restartToken });
  const cameraApi = useHomeCamera(washingtonOpera);

  const orbitEnabled = !paused && selectedRoom === null;

  const handleRoomClick = useCallback(
    (room: RoomGeometry, floor: FloorGeometry) => {
      setSelectedRoom({ room, floor });
    },
    [],
  );

  const handleClose = useCallback(() => {
    setSelectedRoom(null);
  }, []);

  const handleStart = useCallback(() => setPaused(false), []);
  const handleStop = useCallback(() => setPaused(true), []);
  const handleRestart = useCallback(() => {
    setRestartToken((n) => n + 1);
    setPaused(false);
    setSelectedRoom(null);
    cameraApi.flyHome();
  }, [cameraApi]);

  // Track pointer for hover tooltip positioning.
  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const banner = telemetry.alertBanner;
  const tooltipRoom = selectedRoom === null ? hoveredRoom : null;

  const stats = useMemo(() => {
    const rooms = washingtonOpera.floors.flatMap((f) => f.rooms);
    const devices = rooms.flatMap((r) => r.devices);
    return {
      floors: washingtonOpera.floors.length,
      rooms: rooms.length,
      devices: devices.length,
    };
  }, []);

  return (
    <div
      className="relative -mx-6 -my-8 h-[calc(100vh-4rem)] overflow-hidden bg-[#222a3e] lg:-mx-8"
      onPointerMove={onPointerMove}
    >
      <BuildingScene
        building={washingtonOpera}
        values={telemetry.values}
        statuses={telemetry.statuses}
        alertingRooms={telemetry.alertingRooms}
        selectedRoomId={selectedRoom?.room.assetId ?? null}
        orbitEnabled={orbitEnabled}
        onRoomClick={handleRoomClick}
        onRoomHover={setHoveredRoom}
        onDeviceHover={setHoveredDevice}
        cameraApi={cameraApi}
      />

      {/* Header — building name + address + mock-data label */}
      <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-md">
        <div className="rounded-2xl border border-white/10 bg-black/60 px-5 py-4 text-white shadow-2xl backdrop-blur-xl">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">
            Live overview
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight">
            {washingtonOpera.name}
          </h1>
          <div className="mt-1 text-xs text-white/55">
            {washingtonOpera.address}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-white/60">
            <span>
              <span className="font-mono text-white">{stats.floors}</span>{" "}
              floors
            </span>
            <span>
              <span className="font-mono text-white">{stats.rooms}</span> rooms
            </span>
            <span>
              <span className="font-mono text-white">{stats.devices}</span>{" "}
              devices
            </span>
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Mock telemetry
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {banner ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2">
          <div className="rounded-full border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 shadow-2xl backdrop-blur-xl">
            {banner}
          </div>
        </div>
      ) : null}

      <HoverTooltip
        room={tooltipRoom}
        device={selectedRoom === null ? hoveredDevice : null}
        values={telemetry.values}
        statuses={telemetry.statuses}
        mousePos={mousePos}
      />

      {selectedRoom ? (
        <RoomDetailOverlay
          room={selectedRoom.room}
          currentTime={telemetry.time}
          values={telemetry.values}
          statuses={telemetry.statuses}
          onClose={handleClose}
        />
      ) : null}

      <HomeControls
        paused={paused}
        time={telemetry.time}
        onStart={handleStart}
        onStop={handleStop}
        onRestart={handleRestart}
      />
    </div>
  );
}
