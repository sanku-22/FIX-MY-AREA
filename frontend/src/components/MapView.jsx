import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { STATUS } from "@/lib/constants";
import { getStateGlyph } from "@/lib/stateIcons";

const TILES = {
  light: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

function pinSvg(color, glyph) {
  return `
    <svg width="36" height="46" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 45C18 45 33 28.5 33 16.5C33 7.9 26.3 1 18 1C9.7 1 3 7.9 3 16.5C3 28.5 18 45 18 45Z" fill="${color}" stroke="white" stroke-width="2.3"/>
      <circle cx="18" cy="16.5" r="9" fill="white"/>
      <g transform="translate(8.4,7) scale(0.79)" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    </svg>`;
}

function makeIcon(issue) {
  const status = STATUS[issue.status] || STATUS.open;
  const glyph = getStateGlyph(issue.state);
  return L.divIcon({
    html: `<div class="cf-pin">${pinSvg(status.color, glyph)}</div>`,
    className: "cf-div-icon",
    iconSize: [36, 46],
    iconAnchor: [18, 46],
  });
}

function userIcon() {
  return L.divIcon({ html: '<div class="cf-userdot"></div>', className: "cf-div-icon", iconSize: [18, 18], iconAnchor: [9, 9] });
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
  recenterKey = 0, draggableMarker, onDragMarker, onMapClick, theme = "light",
}) {
  const tile = TILES[theme] || TILES.light;
  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} className="h-full w-full" attributionControl={true}>
      <TileLayer key={theme} url={tile.url} attribution={tile.attribution} maxZoom={19} maxNativeZoom={16} />
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
            html: `<div class="cf-pin">${pinSvg("#1f7a72", '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>')}</div>`,
            className: "cf-div-icon", iconSize: [36, 46], iconAnchor: [18, 46],
          })}
          eventHandlers={{ dragend: (e) => { const { lat, lng } = e.target.getLatLng(); onDragMarker && onDragMarker([lat, lng]); } }}
        />
      )}
    </MapContainer>
  );
}
