import type { FleetTrackingSnapshot, WorkerTrackingSnapshot } from "@/modules/gps/types";

export const SYNTHETIC_WORKER_TRACKING: WorkerTrackingSnapshot = {
  activeDelivery: {
    id: "72000000-0000-4000-8000-000000000002",
    deliveryNumber: "DLV-2026-000013",
    vehicleName: "XE-02 · 29H-678.90",
    status: "ARRIVED",
    lastRecordedAt: "2026-09-01T07:14:35.000Z",
    freshness: "LIVE",
  },
  availabilityMessage: null,
};

export const SYNTHETIC_FLEET_TRACKING: FleetTrackingSnapshot = {
  locations: [{
    vehicleId: "71000000-0000-4000-8000-000000000001",
    vehicleName: "XE-02 · 29H-678.90",
    workerName: "Trần Văn Nam",
    deliveryId: "72000000-0000-4000-8000-000000000002",
    deliveryNumber: "DLV-2026-000013",
    nextDestination: "Khu công nghiệp VSIP Bắc Ninh",
    latitude: "21.1714382",
    longitude: "106.0697221",
    accuracyM: "18",
    speedMps: "0",
    recordedAt: "2026-09-01T07:14:35.000Z",
    freshness: "LIVE",
    etaMessage: "Đang ở điểm giao · thời gian đến đã được cập nhật theo tiến độ.",
  }],
  providerMessage: "Nếu bản đồ nền hoặc Realtime không khả dụng, điều phối vẫn xem được telemetry đã nhận; ETA chỉ là ước tính vận hành và Delivery không bị thay đổi.",
};
