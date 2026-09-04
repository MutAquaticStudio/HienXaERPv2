export const GPS_FRESHNESS_STATUSES = ["LIVE", "STALE", "OFFLINE"] as const;

export type GpsFreshnessStatus = (typeof GPS_FRESHNESS_STATUSES)[number];

export interface WorkerTrackingSnapshot {
  activeDelivery: {
    id: string;
    deliveryNumber: string;
    vehicleName: string;
    status: "DISPATCHED" | "ARRIVED";
    lastRecordedAt: string | null;
    freshness: GpsFreshnessStatus | "UNKNOWN";
  } | null;
  availabilityMessage: string | null;
}

export interface FleetLocationCard {
  vehicleId: string;
  vehicleName: string;
  workerName: string;
  deliveryId: string;
  deliveryNumber: string;
  nextDestination: string;
  latitude: string;
  longitude: string;
  accuracyM: string;
  speedMps: string | null;
  recordedAt: string;
  freshness: GpsFreshnessStatus;
  etaMessage: string;
}

export interface FleetTrackingSnapshot {
  locations: FleetLocationCard[];
  providerMessage: string;
}

export type GpsLocationCommand = {
  kind: "gps.location.record";
  latitude: string;
  longitude: string;
  accuracyM: string;
  speedMps: string | null;
  headingDeg: string | null;
  recordedAt: string;
};
