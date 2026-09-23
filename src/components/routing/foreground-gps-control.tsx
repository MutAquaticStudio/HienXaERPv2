"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = { deliveryId: string; assignmentVersion: number };

export function ForegroundGpsControl({ deliveryId, assignmentVersion }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "active" | "stopping" | "error">("idle");
  const [message, setMessage] = useState("GPS chỉ chạy khi trang này đang mở ở foreground.");
  const [hasSession, setHasSession] = useState(false);
  const sessionId = useRef<string | null>(null);
  const watchId = useRef<number | null>(null);
  const sequence = useRef(0);
  const pingChain = useRef(Promise.resolve());

  const stop = useCallback(async (reason = "Đã dừng chia sẻ vị trí.", finalState: "idle" | "error" = "idle") => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    const activeSession = sessionId.current;
    if (!activeSession) { setHasSession(false); setState(finalState); setMessage(reason); return; }
    setState("stopping");
    setMessage("Đang dừng phiên GPS...");
    try {
      const response = await fetch("/api/gps/session/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: activeSession, operationId: crypto.randomUUID() }),
        keepalive: true,
      });
      if (!response.ok) throw new Error("gps_stop_unconfirmed");
      sessionId.current = null;
      setHasSession(false);
      setState(finalState);
      setMessage(reason);
    } catch {
      setState("error");
      setMessage("Đã ngừng gửi vị trí trên thiết bị nhưng chưa xác nhận dừng phiên trên máy chủ. Kiểm tra mạng rồi thử dừng lại.");
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && sessionId.current) void stop("Đã dừng vì ứng dụng rời foreground.");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      const activeSession = sessionId.current;
      if (activeSession) {
        void fetch("/api/gps/session/stop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: activeSession, operationId: crypto.randomUUID() }),
          keepalive: true,
        });
      }
    };
  }, [stop]);

  async function start() {
    if (!navigator.geolocation) { setState("error"); setMessage("Thiết bị không hỗ trợ định vị."); return; }
    if (document.visibilityState !== "visible") { setState("error"); setMessage("Mở ứng dụng ở foreground trước khi bật GPS."); return; }
    setState("starting");
    let response: Response;
    try {
      response = await fetch("/api/gps/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deliveryId, assignmentVersion, operationId: crypto.randomUUID() }),
      });
    } catch {
      setState("error");
      setMessage("Không thể kết nối để bật GPS. Kiểm tra mạng rồi thử lại.");
      return;
    }
    const body = await response.json().catch(() => null) as { sessionId?: string; lastSequence?: number; error?: string } | null;
    if (!response.ok || !body?.sessionId || !Number.isSafeInteger(body.lastSequence) || body.lastSequence! < 0) { setState("error"); setMessage(body?.error ?? "Không thể đồng bộ phiên GPS."); return; }
    sessionId.current = body.sessionId;
    setHasSession(true);
    sequence.current = body.lastSequence!;
    watchId.current = navigator.geolocation.watchPosition((position) => {
      if (document.visibilityState !== "visible" || !sessionId.current) return;
      sequence.current += 1;
      const targetSession = sessionId.current;
      const targetSequence = sequence.current;
      pingChain.current = pingChain.current.then(async () => {
        if (!targetSession || targetSession !== sessionId.current || document.visibilityState !== "visible") return;
        try {
          const ping = await fetch("/api/gps/session/ping", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId: targetSession,
              sequence: targetSequence,
              capturedAt: new Date(position.timestamp).toISOString(),
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters: position.coords.accuracy,
              speedMps: position.coords.speed,
              headingDegrees: position.coords.heading,
              operationId: crypto.randomUUID(),
            }),
          });
          if (!ping.ok) await stop("Phiên GPS đã dừng vì assignment hoặc thứ tự vị trí không còn hợp lệ.");
          else { setState("active"); setMessage("Đang chia sẻ vị trí khi trang ở foreground."); }
        } catch {
          await stop("Đã dừng vì không thể gửi vị trí lên máy chủ.");
        }
      });
    }, (error) => {
      void stop(error.code === error.PERMISSION_DENIED ? "Bạn chưa cấp quyền vị trí cho trình duyệt." : "Không lấy được vị trí hiện tại.", "error");
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    setState("active");
    setMessage("Đang chờ vị trí đầu tiên. GPS chỉ hoạt động khi trang ở foreground.");
  }

  return (
    <section className="command-panel">
      <div>
        <strong>Chia sẻ vị trí chuyến giao</strong>
        <p className="muted" role="status">{message}</p>
      </div>
      {state === "active" || state === "stopping" || (state === "error" && hasSession) ? (
        <button className="button button-secondary" type="button" disabled={state === "stopping"} onClick={() => void stop()}>{state === "error" ? "Thử dừng GPS" : "Dừng GPS"}</button>
      ) : (
        <button className="button button-primary" type="button" disabled={state === "starting"} onClick={() => void start()}>{state === "starting" ? "Đang bật..." : "Bật GPS foreground"}</button>
      )}
    </section>
  );
}
