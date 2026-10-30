"use client";

import Link from "next/link";
import { MapPin, MapPinOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import styles from "@/components/portal/portal.module.css";
import { GPS_PING_INTERVAL_MS } from "@/modules/routing/device-availability";

/** off: not on shift · sharing: sending · waiting: on shift, no fix yet · denied: location permission refused · unsupported: no GPS. */
export type ShiftLocationState = "off" | "waiting" | "sharing" | "denied" | "unsupported";

// One state for the whole worker portal, so the "Vị trí" page shows what the tracker in the shell is doing.
let current: ShiftLocationState = "off";
const listeners = new Set<() => void>();
function setState(next: ShiftLocationState) {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function useShiftLocationState() {
  return useSyncExternalStore(subscribe, () => current, () => "off" as ShiftLocationState);
}

/** How often the shell asks "am I on shift?" while not sharing (picks up Vào ca / Ra ca made on another device). */
const STATUS_CHECK_MS = 60_000;

/**
 * FB18 (D40): from Vào ca to Ra ca the worker's phone sends its position about every 15 s while the worker portal is open,
 * so the office sees where people are on the Điều phối map. Browsers stop it when the screen is off or the page is closed.
 */
export function ShiftLocationTracker() {
  const pathname = usePathname();
  const state = useShiftLocationState();
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    let disposed = false;
    const stopWatch = () => {
      if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
    };
    const send = async (position: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSent.current < GPS_PING_INTERVAL_MS) return;
      lastSent.current = now;
      try {
        const response = await fetch("/api/gps/worker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() }),
        });
        if (disposed) return;
        if (response.status === 409) { stopWatch(); setState("off"); return; }
        if (response.ok) setState("sharing");
      } catch {
        // Weak signal: the next position retries.
      }
    };
    const start = () => {
      if (watchId.current !== null) return;
      if (!("geolocation" in navigator)) { setState("unsupported"); return; }
      setState("waiting");
      watchId.current = navigator.geolocation.watchPosition((position) => void send(position), (error) => {
        if (error.code === error.PERMISSION_DENIED) { stopWatch(); setState("denied"); }
      }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    };
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/gps/worker", { cache: "no-store" });
        if (!response.ok || disposed) return;
        const body = await response.json() as { onShift?: boolean };
        if (disposed) return;
        if (body.onShift) start();
        else { stopWatch(); setState("off"); }
      } catch {
        // Offline: try again on the next check.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
      else stopWatch();
    };
    void check();
    const timer = window.setInterval(() => { if (watchId.current === null) void check(); }, STATUS_CHECK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); stopWatch(); };
  }, [pathname]);

  if (state === "denied") return <Link className={styles.topIcon} data-warning="true" href="/work/tracking" aria-label="Chưa bật vị trí trong ca" title="Chưa bật vị trí trong ca">
    <MapPinOff aria-hidden size={19} />
  </Link>;
  if (state !== "sharing" && state !== "waiting") return null;
  const label = state === "sharing" ? "Đang chia sẻ vị trí trong ca" : "Đang lấy vị trí…";
  return <span className={styles.topIcon} data-sharing={state === "sharing" ? "true" : undefined} role="status" aria-label={label} title={label}>
    <MapPin aria-hidden size={19} />
  </span>;
}
