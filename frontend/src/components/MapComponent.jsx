import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PathLayer, ScatterplotLayer, PolygonLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  CHENNAI_TNAGAR_CENTER,
  INITIAL_MAP_OPTIONS,
} from '../config/mapConfig';
import { RISK_COLORS_RGB, STATUS_COLORS_RGB, TIER_LABELS } from '../config/riskColors';
import { MapPin, Info, RefreshCw } from 'lucide-react';

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

const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-api-script';

function loadGoogleMapsApi(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=visualization,places,maps3d&v=beta`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Google Maps API network error. Check connection or key restriction.'));
    document.head.appendChild(script);
  });
}

// ── Tooltip style shared by both modes ──
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(10,14,26,0.94)',
  color: '#f1f5f9',
  padding: '10px 12px',
  borderRadius: '6px',
  fontSize: '0.82rem',
  border: '1px solid rgba(255,255,255,0.12)',
  maxWidth: '240px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
};

// ── Standalone initial viewState matching Chennai T. Nagar ──
const STANDALONE_VIEW_STATE = {
  longitude: CHENNAI_TNAGAR_CENTER.lng,
  latitude: CHENNAI_TNAGAR_CENTER.lat,
  zoom: 15.5,
  pitch: 55,
  bearing: -15,
  minZoom: 10,
  maxZoom: 20,
};

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
  const mapContainerRef = useRef(null);
  const googleMapRef = useRef(null);
  const overlayRef = useRef(null);
  const clickListenerRef = useRef(null);

  // Determine initial mode: use Google Maps if key present, else standalone
  const useGoogleMaps = Boolean(GOOGLE_MAPS_API_KEY);
  const [loadState, setLoadState] = useState(useGoogleMaps ? 'loading' : 'standalone');

  // Handle Google Maps authentication failures
  useEffect(() => {
    if (!useGoogleMaps) return;
    window.gm_authFailure = () => {
      console.error('[Google Maps Auth] Invalid or unauthorized VITE_GOOGLE_MAPS_API_KEY');
      setLoadState('standalone'); // fallback to standalone on auth failure
    };
    return () => {
      window.gm_authFailure = null;
    };
  }, [useGoogleMaps]);

  // Initialise Google Maps 3D Satellite API automatically from environment variable
  useEffect(() => {
    if (!useGoogleMaps) return;

    let isSubscribed = true;
    setLoadState('loading');

    loadGoogleMapsApi(GOOGLE_MAPS_API_KEY)
      .then((mapsApi) => {
        if (!isSubscribed || !mapContainerRef.current) return;

        const mapOptions = {
          ...INITIAL_MAP_OPTIONS,
          ...(GOOGLE_MAPS_MAP_ID ? { mapId: GOOGLE_MAPS_MAP_ID } : {}),
        };

        // Create official Google Maps 3D Satellite / Hybrid instance for Chennai
        const map = new mapsApi.Map(mapContainerRef.current, mapOptions);
        googleMapRef.current = map;

        // Create deck.gl Google Maps overlay for analytical layers
        const overlay = new GoogleMapsOverlay({
          getTooltip: ({ object }) => {
            const html = buildTooltipHtml(object);
            return html ? { html, style: TOOLTIP_STYLE } : null;
          },
        });
        overlay.setMap(map);
        overlayRef.current = overlay;

        setLoadState('ready');
      })
      .catch((err) => {
        if (!isSubscribed) return;
        console.error('[FloodTwin Map Load Error]', err);
        setLoadState('standalone'); // fallback to standalone on error
      });

    return () => {
      isSubscribed = false;
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
      googleMapRef.current = null;
    };
  }, [useGoogleMaps]);

  // Handle map click events for routing origin/destination selection (Google Maps mode)
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || loadState !== 'ready') return;

    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    if (onMapClick) {
      clickListenerRef.current = map.addListener('click', (e) => {
        onMapClick([e.latLng.lng(), e.latLng.lat()]);
      });
    }

    return () => {
      if (clickListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [onMapClick, loadState]);

  // ── Build deck.gl simulation layers (shared by both modes) ──
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
          [65, 182, 196, 60],
          [127, 205, 187, 100],
          [199, 233, 180, 120],
          [255, 255, 204, 140],
          [255, 237, 160, 180],
          [254, 178, 76, 200],
          [253, 141, 60, 220],
          [240, 59, 32, 240],
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
      const nearCapacityNodes = simState.nodes.filter((n) => n.utilPct > 90);
      if (nearCapacityNodes.length > 0) {
        result.push(new ScatterplotLayer({
          id: 'critical-pulse',
          data: nearCapacityNodes,
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

    const selectionMarkers = [];
    if (routingOrigin) selectionMarkers.push({ lng: routingOrigin.lng, lat: routingOrigin.lat, color: [16, 185, 129] });
    if (routingDestination) selectionMarkers.push({ lng: routingDestination.lng, lat: routingDestination.lat, color: [239, 68, 68] });

    if (selectionMarkers.length > 0) {
      result.push(new ScatterplotLayer({
        id: 'routing-selection-markers',
        data: selectionMarkers,
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

  // Update deck.gl overlay layers when simulation state changes (Google Maps mode)
  useEffect(() => {
    if (overlayRef.current && loadState === 'ready') {
      overlayRef.current.setProps({ layers: buildLayers() });
    }
  }, [buildLayers, loadState]);

  // ── Build standalone layers (Carto Dark Matter basemap + simulation layers) ──
  const standaloneLayers = useMemo(() => {
    if (loadState !== 'standalone') return [];

    const basemap = new TileLayer({
      id: 'carto-dark-basemap',
      data: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const {
          boundingBox: [
            [west, south],
            [east, north],
          ],
        } = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    return [basemap, ...buildLayers()];
  }, [loadState, buildLayers]);

  // ── Handle standalone map click for routing ──
  const handleStandaloneClick = useCallback(
    (info) => {
      if (onMapClick && info.coordinate) {
        onMapClick(info.coordinate);
      }
    },
    [onMapClick],
  );

  // ── Standalone tooltip handler ──
  const standaloneTooltip = useCallback(({ object }) => {
    const html = buildTooltipHtml(object);
    return html ? { html, style: TOOLTIP_STYLE } : null;
  }, []);

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100%', backgroundColor: '#0a0e1a' }}>

      {/* ── MODE A: Standalone Deck.GL + Carto Dark basemap (no API key needed) ── */}
      {loadState === 'standalone' && (
        <DeckGL
          initialViewState={STANDALONE_VIEW_STATE}
          controller={{ dragRotate: true, touchRotate: true, keyboard: true }}
          layers={standaloneLayers}
          onClick={handleStandaloneClick}
          getTooltip={standaloneTooltip}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {/* ── MODE B: Google Maps 3D Satellite base layer ── */}
      {(loadState === 'loading' || loadState === 'ready') && (
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        />
      )}

      {/* Loading state indicator (Google Maps mode) */}
      {loadState === 'loading' && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          color: '#38bdf8',
          padding: '8px 16px',
          borderRadius: '24px',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 20,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <RefreshCw size={14} style={{ animation: 'spin 1.5s linear infinite' }} />
          <span>Initializing Google 3D Satellite Map (T. Nagar, Chennai)…</span>
        </div>
      )}

      {/* ── Location badge ── */}
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
          {loadState === 'ready'
            ? 'Google 3D Satellite Map · T. Nagar, Chennai'
            : 'Interactive Map · T. Nagar, Chennai'}
        </span>
      </div>
    </div>
  );
}
