import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Deck } from '@deck.gl/core';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PathLayer, ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  CHENNAI_TNAGAR_CENTER,
  INITIAL_MAP_OPTIONS,
} from '../config/mapConfig';
import { RISK_COLORS_RGB, STATUS_COLORS_RGB, TIER_LABELS } from '../config/riskColors';
import { CHENNAI_TNAGAR_BUILDINGS_GEOJSON } from '../config/chennaiBuildings';
import { MapPin } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildFloodPolygons(roads) {
  const ROAD_BUFFER_DEG = 0.0003;
  return roads
    .filter((r) => r.depthCm > 5)
    .map((r) => {
      const [start, end] = [r.path[0], r.path[r.path.length - 1]];
      return {
        polygon: [
          [start[0] - ROAD_BUFFER_DEG, start[1] - ROAD_BUFFER_DEG],
          [start[0] + ROAD_BUFFER_DEG, start[1] - ROAD_BUFFER_DEG],
          [end[0] + ROAD_BUFFER_DEG, end[1] + ROAD_BUFFER_DEG],
          [end[0] - ROAD_BUFFER_DEG, end[1] + ROAD_BUFFER_DEG],
        ],
        depth: r.depthCm,
        risk: r.risk,
      };
    });
}

function floodPolygonColor(d) {
  const alpha = Math.min(180, 40 + d.depth * 3);
  if (d.risk === 'CRITICAL') return [239, 68, 68, alpha];
  if (d.risk === 'HIGH') return [249, 115, 22, alpha];
  if (d.risk === 'CAUTION') return [245, 158, 11, alpha];
  return [59, 130, 246, Math.round(alpha * 0.5)];
}

function buildTooltipHtml(object) {
  if (!object) return null;

  if (object.path && object.name) {
    const riskColor = (RISK_COLORS_RGB[object.risk] || [180, 180, 180]).join(',');
    const ttfLine = object.ttf != null
      ? `<div>Time-to-flood: <strong>${object.ttf} min</strong></div>`
      : '';
    const causeLine = object.causeSummary
      ? `<div style="margin-top:4px;color:#f87171;font-size:0.8rem">${object.causeSummary}</div>`
      : '';
    return `
      <div style="margin-bottom:6px"><strong>${object.name}</strong> <span style="opacity:0.6">(${object.id})</span></div>
      <div>Risk: <span style="font-weight:700;color:rgb(${riskColor})">${object.risk}</span></div>
      <div>Depth: <strong>${object.depthCm.toFixed(1)} cm</strong> <span style="opacity:0.6">[${object.depthLower.toFixed(1)}–${object.depthUpper.toFixed(1)}]</span></div>
      <div>Drain Util: <strong>${object.drainUtilPct.toFixed(0)}%</strong></div>
      ${ttfLine}${causeLine}
      <div style="margin-top:4px;opacity:0.5;font-size:0.75rem">Confidence: Tier ${object.tier} · Click for details</div>
    `;
  }

  if (object.type && object.id && !object.source) {
    const statusColor = (STATUS_COLORS_RGB[object.status] || [180, 180, 180]).join(',');
    const ttcLine = object.ttc != null
      ? `<div>Time-to-critical: <strong>${object.ttc} min</strong></div>`
      : '';
    return `
      <div style="margin-bottom:6px"><strong>Node ${object.id}</strong> <span style="opacity:0.6">(${object.type})</span></div>
      <div>Status: <span style="font-weight:700;color:rgb(${statusColor})">${object.status}</span></div>
      <div>Utilisation: <strong>${object.utilPct.toFixed(0)}%</strong></div>
      <div>Flow: ${object.flow.toFixed(0)} L/s · Cap: ${object.capacity} L/s</div>
      ${ttcLine}
      <div>Tier: ${TIER_LABELS[object.tier] || object.tier}</div>
      ${object.cause ? `<div style="margin-top:4px;color:#f87171;font-size:0.8rem">${object.cause}</div>` : ''}
      <div style="margin-top:4px;opacity:0.5;font-size:0.75rem">Click for full details</div>
    `;
  }

  if (object.source && object.target) {
    return `
      <div><strong>Pipe ${object.id}</strong> (${object.type})</div>
      <div>${object.source} → ${object.target}</div>
      <div>Util: ${object.utilPct.toFixed(0)}% · Flow: ${object.flow.toFixed(0)} L/s</div>
      <div>Dia: ${object.diameter}mm · Len: ${object.length}m</div>
    `;
  }
  return null;
}

// ── Google Maps loader ────────────────────────────────────────────────────────

const GOOGLE_MAPS_SCRIPT_ID = 'floodtwin-gmaps-script';

function loadGoogleMapsApi(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(window.google.maps); return; }
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=visualization,places&v=beta`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Google Maps failed'));
    document.head.appendChild(script);
  });
}

// ── MapLibre style ────────────────────────────────────────────────────────────

const MAPLIBRE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics',
      maxzoom: 19,
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri',
      maxzoom: 19,
    },
    'chennai-3d-buildings': {
      type: 'geojson',
      data: CHENNAI_TNAGAR_BUILDINGS_GEOJSON,
    },
  },
  layers: [
    { id: 'satellite-base', type: 'raster', source: 'esri-satellite' },
    { id: 'road-labels', type: 'raster', source: 'esri-labels', minzoom: 12, paint: { 'raster-opacity': 0.7 } },
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'chennai-3d-buildings',
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'height'],
          15, '#1e293b', 30, '#334155', 45, '#475569', 60, '#64748b'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.82,
      },
    },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapComponent({
  simState,
  layers: enabledLayers,
  onNodeClick,
  onRoadClick,
  onMapClick,
  routePath,
  routingOrigin,
  routingDestination,
}) {
  const wrapperRef = useRef(null);          // outer div
  const mapContainerRef = useRef(null);     // MapLibre target div
  const maplibreRef = useRef(null);
  const deckRef = useRef(null);
  const googleMapRef = useRef(null);
  const googleDeckRef = useRef(null);

  const [activeProvider, setActiveProvider] = useState(
    GOOGLE_MAPS_API_KEY ? 'google-loading' : 'maplibre'
  );
  const [tooltip, setTooltip] = useState(null); // { x, y, html }
  const [viewState, setViewState] = useState({
    longitude: CHENNAI_TNAGAR_CENTER.lng,
    latitude: CHENNAI_TNAGAR_CENTER.lat,
    zoom: 15.6,
    pitch: 52,
    bearing: -15,
  });

  // Google Maps auth failure handler
  useEffect(() => {
    window.gm_authFailure = () => {
      console.warn('[FloodTwin] Google Maps auth failed — switching to MapLibre.');
      setActiveProvider('maplibre');
    };
    return () => { window.gm_authFailure = null; };
  }, []);

  // ── Build simulation Deck.gl layers ──────────────────────────────────────
  const buildLayers = useCallback(() => {
    const result = [];

    if (enabledLayers.rainfall && simState.nowcast?.cells?.length) {
      result.push(new HeatmapLayer({
        id: 'rainfall-heat',
        data: simState.nowcast.cells.filter((c) => c.intensity > 0),
        getPosition: (d) => [d.lng, d.lat],
        getWeight: (d) => d.intensity,
        radiusPixels: 80,
        intensity: 1,
        threshold: 0.1,
        colorRange: [
          [65, 182, 196, 60], [127, 205, 187, 100],
          [199, 233, 180, 120], [255, 255, 204, 140],
          [255, 237, 160, 180], [254, 178, 76, 200],
          [253, 141, 60, 220], [240, 59, 32, 240],
        ],
      }));
    }

    if (enabledLayers.floodDepth) {
      result.push(new PolygonLayer({
        id: 'flood-depth',
        data: buildFloodPolygons(simState.roads),
        pickable: false,
        stroked: false,
        filled: true,
        getPolygon: (d) => d.polygon,
        getFillColor: floodPolygonColor,
      }));
    }

    if (enabledLayers.drainage) {
      result.push(new PathLayer({
        id: 'drainage-edges',
        data: simState.edges,
        pickable: true,
        widthMinPixels: 2,
        widthMaxPixels: 5,
        getPath: (d) => {
          const src = simState.nodes.find((n) => n.id === d.source);
          const tgt = simState.nodes.find((n) => n.id === d.target);
          if (!src || !tgt) return [[0, 0], [0, 0]];
          return [[src.lng, src.lat], [tgt.lng, tgt.lat]];
        },
        getColor: (d) => {
          const c = STATUS_COLORS_RGB[d.status] || [100, 100, 100];
          return [...c, d.type === 'culvert' ? 200 : 150];
        },
        getWidth: (d) => (d.utilPct > 100 ? 5 : 3),
      }));
    }

    if (enabledLayers.drainageNodes) {
      result.push(new ScatterplotLayer({
        id: 'drainage-nodes',
        data: simState.nodes,
        pickable: true,
        opacity: 0.9,
        stroked: true,
        filled: true,
        radiusMinPixels: 6,
        radiusMaxPixels: 18,
        lineWidthMinPixels: 2,
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: (d) => {
          const c = STATUS_COLORS_RGB[d.status] || [100, 100, 100];
          return d.utilPct > 100 ? [239, 68, 68, 230] : [...c, 200];
        },
        getLineColor: (d) => (d.tier === 'C' ? [255, 200, 50, 200] : [255, 255, 255, 180]),
        getRadius: (d) => {
          if (d.type === 'outfall') return 14;
          if (d.type === 'storage') return 12;
          if (d.utilPct > 100) return 11;
          return 8;
        },
        onClick: (info) => { if (info.object && onNodeClick) onNodeClick(info.object); },
      }));
    }

    if (enabledLayers.criticalNodes) {
      const nearCapacity = simState.nodes.filter((n) => n.utilPct > 90);
      if (nearCapacity.length > 0) {
        result.push(new ScatterplotLayer({
          id: 'critical-pulse',
          data: nearCapacity,
          pickable: false,
          stroked: true,
          filled: false,
          radiusMinPixels: 16,
          radiusMaxPixels: 28,
          lineWidthMinPixels: 2,
          getPosition: (d) => [d.lng, d.lat],
          getLineColor: [239, 68, 68, 120],
          getRadius: 18,
        }));
      }
    }

    if (enabledLayers.roads) {
      result.push(new PathLayer({
        id: 'roads',
        data: simState.roads,
        pickable: true,
        widthMinPixels: 4,
        widthMaxPixels: 10,
        getPath: (d) => d.path,
        getColor: (d) => {
          if (!enabledLayers.floodRisk) return [180, 180, 180, 120];
          return [...(RISK_COLORS_RGB[d.risk] || [100, 100, 100]), 220];
        },
        getWidth: (d) => (d.risk === 'CRITICAL' ? 8 : d.risk === 'HIGH' ? 7 : 5),
        onClick: (info) => { if (info.object && onRoadClick) onRoadClick(info.object); },
      }));
    }

    if (routePath && routePath.length > 1) {
      result.push(
        new PathLayer({
          id: 'route-path',
          data: [{ path: routePath.map((p) => [p.lng, p.lat]) }],
          pickable: false,
          widthMinPixels: 5,
          widthMaxPixels: 8,
          getPath: (d) => d.path,
          getColor: [0, 200, 255, 220],
          getWidth: 6,
        }),
        new ScatterplotLayer({
          id: 'route-markers',
          data: [
            { ...routePath[0], color: [16, 185, 129] },
            { ...routePath[routePath.length - 1], color: [239, 68, 68] },
          ],
          pickable: false,
          filled: true,
          stroked: true,
          radiusMinPixels: 10,
          getPosition: (d) => [d.lng, d.lat],
          getFillColor: (d) => d.color,
          getLineColor: [255, 255, 255, 220],
          lineWidthMinPixels: 2,
        }),
      );
    }

    const selMarkers = [];
    if (routingOrigin) selMarkers.push({ lng: routingOrigin.lng, lat: routingOrigin.lat, color: [16, 185, 129] });
    if (routingDestination) selMarkers.push({ lng: routingDestination.lng, lat: routingDestination.lat, color: [239, 68, 68] });
    if (selMarkers.length > 0) {
      result.push(new ScatterplotLayer({
        id: 'routing-selection-markers',
        data: selMarkers,
        pickable: false,
        filled: true,
        stroked: true,
        radiusMinPixels: 8,
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: (d) => d.color,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
      }));
    }

    return result;
  }, [simState, enabledLayers, routePath, routingOrigin, routingDestination, onNodeClick, onRoadClick]);

  // ── Initialize MapLibre + standalone Deck ────────────────────────────────
  useEffect(() => {
    if (activeProvider !== 'maplibre') return;
    if (!mapContainerRef.current || !wrapperRef.current) return;

    // Cleanup prior instances
    if (maplibreRef.current) { maplibreRef.current.remove(); maplibreRef.current = null; }
    if (deckRef.current) { deckRef.current.finalize(); deckRef.current = null; }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPLIBRE_STYLE,
      center: [CHENNAI_TNAGAR_CENTER.lng, CHENNAI_TNAGAR_CENTER.lat],
      zoom: 15.6,
      pitch: 52,
      bearing: -15,
      maxPitch: 85,
      attributionControl: false,
    });
    maplibreRef.current = map;

    // Create a dedicated canvas for Deck.gl layered on top of MapLibre
    const deckCanvas = document.createElement('canvas');
    deckCanvas.style.position = 'absolute';
    deckCanvas.style.inset = '0';
    deckCanvas.style.width = '100%';
    deckCanvas.style.height = '100%';
    deckCanvas.style.pointerEvents = 'none'; // MapLibre handles panning, Deck is visual only
    wrapperRef.current.appendChild(deckCanvas);

    // Size canvas properly
    const wrapper = wrapperRef.current;
    const resizeCanvas = () => {
      deckCanvas.width = wrapper.offsetWidth * window.devicePixelRatio;
      deckCanvas.height = wrapper.offsetHeight * window.devicePixelRatio;
      deckCanvas.style.width = wrapper.offsetWidth + 'px';
      deckCanvas.style.height = wrapper.offsetHeight + 'px';
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(wrapper);

    const deck = new Deck({
      canvas: deckCanvas,
      width: wrapper.offsetWidth,
      height: wrapper.offsetHeight,
      viewState: {
        longitude: CHENNAI_TNAGAR_CENTER.lng,
        latitude: CHENNAI_TNAGAR_CENTER.lat,
        zoom: 15.6,
        pitch: 52,
        bearing: -15,
      },
      controller: false, // MapLibre controls the viewport
      useDevicePixels: true,
      layers: buildLayers(),
    });
    deckRef.current = deck;

    // Sync Deck viewport with MapLibre
    const syncViewport = () => {
      const center = map.getCenter();
      const vs = {
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
      deck.setProps({ viewState: vs });
      setViewState(vs);
    };

    map.on('move', syncViewport);
    map.on('zoom', syncViewport);
    map.on('pitch', syncViewport);
    map.on('rotate', syncViewport);

    // Handle click for routing
    map.on('click', (e) => {
      if (onMapClick) onMapClick([e.lngLat.lng, e.lngLat.lat]);
    });

    // Handle hover on MapLibre canvas for tooltip (forward to Deck picking)
    const mlCanvas = map.getCanvas();
    const onMouseMove = (e) => {
      const rect = mlCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const picked = deck.pickObject({ x, y, radius: 4 });
      if (picked && picked.object) {
        const html = buildTooltipHtml(picked.object);
        if (html) { setTooltip({ x: e.clientX, y: e.clientY, html }); return; }
      }
      setTooltip(null);
    };
    const onMouseLeave = () => setTooltip(null);

    mlCanvas.addEventListener('mousemove', onMouseMove);
    mlCanvas.addEventListener('mouseleave', onMouseLeave);

    // Handle click picking on Deck layers (node/road click)
    const onMapClick2 = (e) => {
      const rect = mlCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const picked = deck.pickObject({ x, y, radius: 6 });
      if (picked && picked.object) {
        const obj = picked.object;
        if (obj.type && obj.id && !obj.source && onNodeClick) { onNodeClick(obj); return; }
        if (obj.path && obj.name && onRoadClick) { onRoadClick(obj); return; }
      }
    };
    mlCanvas.addEventListener('click', onMapClick2);

    return () => {
      ro.disconnect();
      mlCanvas.removeEventListener('mousemove', onMouseMove);
      mlCanvas.removeEventListener('mouseleave', onMouseLeave);
      mlCanvas.removeEventListener('click', onMapClick2);
      if (deckRef.current) { deckRef.current.finalize(); deckRef.current = null; }
      if (maplibreRef.current) { maplibreRef.current.remove(); maplibreRef.current = null; }
      if (wrapperRef.current && wrapperRef.current.contains(deckCanvas)) {
        wrapperRef.current.removeChild(deckCanvas);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider]);

  // ── Initialize Google Maps ────────────────────────────────────────────────
  useEffect(() => {
    if (activeProvider !== 'google-loading') return;
    let alive = true;
    loadGoogleMapsApi(GOOGLE_MAPS_API_KEY)
      .then((mapsApi) => {
        if (!alive || !mapContainerRef.current) return;
        const gmap = new mapsApi.Map(mapContainerRef.current, {
          ...INITIAL_MAP_OPTIONS,
          ...(GOOGLE_MAPS_MAP_ID ? { mapId: GOOGLE_MAPS_MAP_ID } : {}),
        });
        googleMapRef.current = gmap;
        const overlay = new GoogleMapsOverlay({
          getTooltip: ({ object }) => {
            if (!object) { setTooltip(null); return null; }
            const html = buildTooltipHtml(object);
            return html ? { html, style: { backgroundColor: 'rgba(10,14,26,0.94)', color: '#f1f5f9', padding: '10px 12px', borderRadius: '6px', fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.12)' } } : null;
          },
          layers: buildLayers(),
        });
        overlay.setMap(gmap);
        googleDeckRef.current = overlay;
        if (onMapClick) {
          gmap.addListener('click', (e) => onMapClick([e.latLng.lng(), e.latLng.lat()]));
        }
        setActiveProvider('google');
      })
      .catch(() => {
        if (alive) {
          console.warn('[FloodTwin] Google Maps unavailable — using MapLibre satellite.');
          setActiveProvider('maplibre');
        }
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider]);

  // ── Sync layers on simulation state change ────────────────────────────────
  useEffect(() => {
    const layers = buildLayers();
    if (deckRef.current) {
      deckRef.current.setProps({ layers });
    }
    if (googleDeckRef.current) {
      googleDeckRef.current.setProps({ layers });
    }
  }, [buildLayers]);

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#0a0e1a', overflow: 'hidden' }}
    >
      {/* Map provider target */}
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* React-rendered tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 14,
            backgroundColor: 'rgba(10,14,26,0.94)',
            color: '#f1f5f9',
            padding: '10px 12px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            border: '1px solid rgba(255,255,255,0.12)',
            maxWidth: '240px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            zIndex: 50,
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}

      {/* Provider badge */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        color: '#f1f5f9',
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 10,
        pointerEvents: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}>
        <MapPin size={12} style={{ color: '#ef4444' }} />
        <span>
          {activeProvider === 'google'
            ? 'Google 3D Satellite · T. Nagar, Chennai'
            : activeProvider === 'maplibre'
            ? '3D Satellite Map (Esri/MapLibre) · T. Nagar, Chennai'
            : 'Loading map…'}
        </span>
      </div>

      {/* Attribution */}
      {activeProvider === 'maplibre' && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.65rem',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          © Esri, Maxar, Earthstar Geographics
        </div>
      )}
    </div>
  );
}
