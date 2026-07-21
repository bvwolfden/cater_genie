"use client";

import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, Tooltip } from "react-leaflet";
import { divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { driverColor } from "@/lib/delivery-palette";

export interface MapStop {
  orderId: string;
  label: string;
  timeLabel: string | null;
  address: string | null;
  lat: number;
  lng: number;
  laneIndex: number | null; // null = unassigned
}

export interface MapLane {
  name: string;
  index: number;
  path: Array<[number, number]>; // depot → stops in time order
}

/** Simple, transparent map: depot, one pin per geocoded drop (driver color,
 *  gray = unassigned), straight polylines per driver in drop order. */
export default function DeliveryMapInner({
  depot,
  stops,
  lanes,
}: {
  depot: { lat: number; lng: number; label: string };
  stops: MapStop[];
  lanes: MapLane[];
}) {
  const depotIcon = divIcon({
    className: "",
    html: `<div style="background:#222;color:#fff;border-radius:8px;padding:2px 6px;font:600 10px system-ui;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">🏠 depot</div>`,
    iconAnchor: [24, 12],
  });
  const center: [number, number] = stops.length
    ? [
        (depot.lat + stops.reduce((s, x) => s + x.lat, 0) / stops.length) / 2,
        (depot.lng + stops.reduce((s, x) => s + x.lng, 0) / stops.length) / 2,
      ]
    : [depot.lat, depot.lng];

  return (
    <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%", borderRadius: 12 }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[depot.lat, depot.lng]} icon={depotIcon} />
      {lanes.map((lane) => (
        <Polyline
          key={lane.index}
          positions={lane.path}
          pathOptions={{ color: driverColor(lane.index), weight: 2.5, opacity: 0.75, dashArray: "6 6" }}
        />
      ))}
      {stops.map((s) => (
        <CircleMarker
          key={s.orderId}
          center={[s.lat, s.lng]}
          radius={8}
          pathOptions={{
            color: "#fff",
            weight: 2,
            fillColor: s.laneIndex != null ? driverColor(s.laneIndex) : "#A6A6A6",
            fillOpacity: 0.95,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <span style={{ font: "600 11px system-ui" }}>{s.timeLabel ?? "no time"} · {s.label}</span>
          </Tooltip>
          <Popup>
            <div style={{ font: "12px system-ui" }}>
              <b>{s.label}</b>
              <br />
              {s.timeLabel ?? "no delivery time"} · {s.address ?? "no address"}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
