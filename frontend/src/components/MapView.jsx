import React, { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import "maplibre-gl/dist/maplibre-gl.css";
import { STATUS } from "@/lib/constants";
import { getStateGlyph } from "@/lib/stateIcons";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const PIN_GLYPH = '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>';

function pinSvg(color, glyph) {
  return `
    <svg width="36" height="46" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 45C18 45 33 28.5 33 16.5C33 7.9 26.3 1 18 1C9.7 1 3 7.9 3 16.5C3 28.5 18 45 18 45Z" fill="${color}" stroke="white" stroke-width="2.3"/>
      <circle cx="18" cy="16.5" r="9" fill="white"/>
      <g transform="translate(8.4,7) scale(0.79)" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    </svg>`;
}

function issueMarkerEl(issue) {
  const status = STATUS[issue.status] || STATUS.open;
  const glyph = getStateGlyph(issue.state);
  const el = document.createElement("div");
  el.className = "cf-pin";
  el.innerHTML = pinSvg(status.color, glyph);
  return el;
}

function clusterEl(count) {
  const el = document.createElement("div");
  el.className = "cf-cluster";
  el.textContent = String(count);
  return el;
}

export default function MapView({
  center, zoom = 14, issues = [], userLocation, onMarkerClick,
  recenterKey = 0, draggableMarker, onDragMarker, onMapClick, theme = "light",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const dragMarkerRef = useRef(null);
  const clusterRef = useRef(null);

  const issuesRef = useRef(issues);
  const draggableRef = useRef(draggableMarker);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const onDragMarkerRef = useRef(onDragMarker);

  useEffect(() => {
    issuesRef.current = issues;
    draggableRef.current = draggableMarker;
    onMarkerClickRef.current = onMarkerClick;
    onMapClickRef.current = onMapClick;
    onDragMarkerRef.current = onDragMarker;
  });

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || draggableRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const index = clusterRef.current;
    if (!index) return;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const z = Math.round(map.getZoom());
    index.getClusters(bbox, z).forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      if (feature.properties.cluster) {
        const el = clusterEl(feature.properties.point_count_abbreviated);
        el.addEventListener("click", () => {
          const expZoom = index.getClusterExpansionZoom(feature.properties.cluster_id);
          map.easeTo({ center: [lng, lat], zoom: Math.min(expZoom, 18), duration: 500 });
        });
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map));
      } else {
        const issue = feature.properties.issue;
        const el = issueMarkerEl(issue);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onMarkerClickRef.current && onMarkerClickRef.current(issue);
        });
        markersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map)
        );
      }
    });
  }, []);

  // init once
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [center[1], center[0]],
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      loadedRef.current = true;
      map.resize();
      renderMarkers();
    });
    map.on("moveend", renderMarkers);
    map.on("click", (e) => onMapClickRef.current && onMapClickRef.current([e.lngLat.lat, e.lngLat.lng]));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line
  }, []);

  // build cluster index on issues change
  useEffect(() => {
    const index = new Supercluster({ radius: 55, maxZoom: 16 });
    index.load(
      issues
        .filter((i) => typeof i.latitude === "number" && typeof i.longitude === "number"
          && !Number.isNaN(i.latitude) && !Number.isNaN(i.longitude))
        .map((i) => ({
          type: "Feature",
          properties: { issue: i },
          geometry: { type: "Point", coordinates: [i.longitude, i.latitude] },
        }))
    );
    clusterRef.current = index;
    renderMarkers();
  }, [issues, renderMarkers]);

  // user location dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
    if (userLocation && !draggableMarker) {
      const el = document.createElement("div");
      el.className = "cf-userdot";
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation[1], userLocation[0]]).addTo(map);
    }
  }, [userLocation, draggableMarker]);

  // draggable / selected pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draggableMarker) {
      if (dragMarkerRef.current) { dragMarkerRef.current.remove(); dragMarkerRef.current = null; }
      return;
    }
    const lngLat = [draggableMarker[1], draggableMarker[0]];
    if (!dragMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "cf-pin";
      el.innerHTML = pinSvg("#1f7a72", PIN_GLYPH);
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom", draggable: true })
        .setLngLat(lngLat).addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        onDragMarkerRef.current && onDragMarkerRef.current([ll.lat, ll.lng]);
      });
      dragMarkerRef.current = marker;
    } else {
      dragMarkerRef.current.setLngLat(lngLat);
      if (!map.getBounds().contains(lngLat)) {
        map.easeTo({ center: lngLat, duration: 600 });
      }
    }
  }, [draggableMarker]);

  // recenter on user request
  useEffect(() => {
    const map = mapRef.current;
    if (map && recenterKey > 0 && userLocation) {
      map.flyTo({ center: [userLocation[1], userLocation[0]], zoom: 15, duration: 800 });
    }
    // eslint-disable-next-line
  }, [recenterKey]);

  // theme (dark = css filter over tiles)
  useEffect(() => {
    if (containerRef.current) containerRef.current.classList.toggle("cf-map-dark", theme === "dark");
  }, [theme]);

  return <div ref={containerRef} data-testid="maplibre-container" className="h-full w-full" />;
}
