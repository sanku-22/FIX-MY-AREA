import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { categoryOf, STATUS } from "@/lib/constants";

const ICON_SVGS = {
  TriangleAlert:
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  Trash2:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  Lightbulb:
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  Droplets:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  Signpost:
    '<path d="M12 3v3"/><path d="M12 21v-6"/><path d="M18 6H6l-3 3 3 3h12l3-3-3-3z"/>',
  CircleDot: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>',
  CircleHelp:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};

function pinSvg(color, glyph) {
  return `
    <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 43C17 43 32 27.5 32 15.5C32 7.2 25.3 1 17 1C8.7 1 2 7.2 2 15.5C2 27.5 17 43 17 43Z" fill="${color}" stroke="white" stroke-width="2.2"/>
      <circle cx="17" cy="15.5" r="8.2" fill="white"/>
      <g transform="translate(8.6,7.1) scale(0.70)" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    </svg>`;
}

function makeIcon(issue) {
  const cat = categoryOf(issue.category);
  const status = STATUS[issue.status] || STATUS.open;
  const glyph = ICON_SVGS[cat.icon] || ICON_SVGS.CircleHelp;
  return L.divIcon({
    html: `<div class="cf-pin">${pinSvg(status.color, glyph)}</div>`,
    className: "cf-div-icon",
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });
}

function userIcon() {
  return L.divIcon({
    html: '<div class="cf-userdot"></div>',
    className: "cf-div-icon",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function Controller({ recenterKey, userLocation }) {
  const map = useMap();
  useEffect(() => {
    if (recenterKey > 0 && userLocation) map.flyTo(userLocation, 15, { duration: 0.8 });
  }, [recenterKey]); // eslint-disable-line
  return null;
}

function ClickCapture({ onMapClick }) {
  useMapEvents({ click(e) { if (onMapClick) onMapClick([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

export default function MapView({
  center, zoom = 14, issues = [], userLocation, onMarkerClick,
  recenterKey = 0, draggableMarker, onDragMarker, onMapClick,
}) {
  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} className="h-full w-full" attributionControl={true}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <Controller recenterKey={recenterKey} userLocation={userLocation} />
      {onMapClick && <ClickCapture onMapClick={onMapClick} />}

      {userLocation && !draggableMarker && <Marker position={userLocation} icon={userIcon()} />}

      {issues.map((issue) => (
        <Marker key={issue.id} position={[issue.latitude, issue.longitude]} icon={makeIcon(issue)}
          eventHandlers={{ click: () => onMarkerClick && onMarkerClick(issue) }} />
      ))}

      {draggableMarker && (
        <Marker
          position={draggableMarker}
          draggable={true}
          icon={L.divIcon({
            html: `<div class="cf-pin">${pinSvg("#1f7a72", '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>')}</div>`,
            className: "cf-div-icon",
            iconSize: [34, 44],
            iconAnchor: [17, 44],
          })}
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onDragMarker && onDragMarker([lat, lng]);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
