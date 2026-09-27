import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { PathLayer, ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { Map } from 'react-map-gl/maplibre';

const INITIAL_VIEW_STATE = {
  longitude: 80.2355,
  latitude: 13.0410,
  zoom: 15.2,
  pitch: 40,
  bearing: -15,
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const RISK_COLORS = {
  SAFE: [16, 185, 129],
  CAUTION: [245, 158, 11],
  HIGH: [249, 115, 22],
  CRITICAL: [239, 68, 68],
};

const STATUS_COLORS = {
  NORMAL: [16, 185, 129],
  WARNING: [245, 158, 11],
  SURCHARGE: [239, 68, 68],
  BACKFLOW: [249, 115, 22],
};

const TIER_LABELS = { A: 'Verified Municipal', B: 'GIS-Derived', C: 'Estimated' };

export default function MapComponent({ simState, layers: enabledLayers, onNodeClick, onRoadClick, routePath }) {
  const layers = useMemo(() => {
    const result = [];

    // Rainfall heatmap
    if (enabledLayers.rainfall && simState.nowcast?.cells?.length) {
      result.push(new HeatmapLayer({
        id: 'rainfall-heat',
        data: simState.nowcast.cells.filter(c => c.intensity > 0),
        getPosition: d => [d.lng, d.lat],
        getWeight: d => d.intensity,
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

    // Flood depth polygons (simplified flood footprint per road)
    if (enabledLayers.floodDepth) {
      const floodData = simState.roads.filter(r => r.depthCm > 5).map(r => {
        const pts = r.path;
        const offset = 0.0003;
        return {
          polygon: [
            [pts[0][0] - offset, pts[0][1] - offset],
            [pts[0][0] + offset, pts[0][1] - offset],
            [pts[pts.length-1][0] + offset, pts[pts.length-1][1] + offset],
            [pts[pts.length-1][0] - offset, pts[pts.length-1][1] + offset],
          ],
          depth: r.depthCm,
          risk: r.risk,
        };
      });
      result.push(new PolygonLayer({
        id: 'flood-depth',
        data: floodData,
        pickable: false,
        stroked: false,
        filled: true,
        extruded: false,
        getPolygon: d => d.polygon,
        getFillColor: d => {
          const alpha = Math.min(180, 40 + d.depth * 3);
          if (d.risk === 'CRITICAL') return [239, 68, 68, alpha];
          if (d.risk === 'HIGH') return [249, 115, 22, alpha];
          if (d.risk === 'CAUTION') return [245, 158, 11, alpha];
          return [59, 130, 246, alpha * 0.5];
        },
      }));
    }

    // Drainage edges
    if (enabledLayers.drainage) {
      result.push(new PathLayer({
        id: 'drainage-edges',
        data: simState.edges,
        pickable: true,
        widthScale: 1,
        widthMinPixels: 2,
        widthMaxPixels: 5,
        getPath: d => {
          const src = simState.nodes.find(n => n.id === d.source);
          const tgt = simState.nodes.find(n => n.id === d.target);
          if (!src || !tgt) return [[0,0],[0,0]];
          return [[src.lng, src.lat], [tgt.lng, tgt.lat]];
        },
        getColor: d => {
          const c = STATUS_COLORS[d.status] || [100, 100, 100];
          return [...c, d.type === 'culvert' ? 200 : 150];
        },
        getWidth: d => d.utilPct > 100 ? 5 : 3,
        getDashArray: d => d.type === 'culvert' ? [8, 4] : null,
        extensions: [],
      }));
    }

    // Drainage nodes
    if (enabledLayers.drainageNodes) {
      result.push(new ScatterplotLayer({
        id: 'drainage-nodes',
        data: simState.nodes,
        pickable: true,
        opacity: 0.9,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 6,
        radiusMaxPixels: 18,
        lineWidthMinPixels: 2,
        getPosition: d => [d.lng, d.lat],
        getFillColor: d => {
          const c = STATUS_COLORS[d.status] || [100,100,100];
          return d.utilPct > 100 ? [239, 68, 68, 230] : [...c, 200];
        },
        getLineColor: d => d.tier === 'C' ? [255, 200, 50, 200] : [255, 255, 255, 180],
        getRadius: d => {
          if (d.type === 'outfall') return 14;
          if (d.type === 'storage') return 12;
          if (d.utilPct > 100) return 11;
          return 8;
        },
        onClick: (info) => {
          if (info.object && onNodeClick) onNodeClick(info.object);
        },
      }));
    }

    // Critical nodes — pulsing ring
    if (enabledLayers.criticalNodes) {
      const critical = simState.nodes.filter(n => n.utilPct > 90);
      result.push(new ScatterplotLayer({
        id: 'critical-pulse',
        data: critical,
        pickable: false,
        stroked: true,
        filled: false,
        radiusMinPixels: 16,
        radiusMaxPixels: 28,
        lineWidthMinPixels: 2,
        getPosition: d => [d.lng, d.lat],
        getLineColor: [239, 68, 68, 120],
        getRadius: 18,
      }));
    }

    // Roads
    if (enabledLayers.roads) {
      result.push(new PathLayer({
        id: 'roads',
        data: simState.roads,
        pickable: true,
        widthScale: 1,
        widthMinPixels: 4,
        widthMaxPixels: 10,
        getPath: d => d.path,
        getColor: d => {
          if (!enabledLayers.floodRisk) return [180, 180, 180, 120];
          return [...(RISK_COLORS[d.risk] || [100,100,100]), 220];
        },
        getWidth: d => d.risk === 'CRITICAL' ? 8 : d.risk === 'HIGH' ? 7 : 5,
        onClick: (info) => {
          if (info.object && onRoadClick) onRoadClick(info.object);
        },
      }));
    }

    // Route path overlay
    if (routePath && routePath.length > 1) {
      result.push(new PathLayer({
        id: 'route-path',
        data: [{ path: routePath.map(p => [p.lng, p.lat]) }],
        pickable: false,
        widthMinPixels: 5,
        widthMaxPixels: 8,
        getPath: d => d.path,
        getColor: [0, 200, 255, 220],
        getWidth: 6,
      }));
      // Route start/end markers
      result.push(new ScatterplotLayer({
        id: 'route-markers',
        data: [
          { ...routePath[0], color: [16, 185, 129] },
          { ...routePath[routePath.length - 1], color: [239, 68, 68] },
        ],
        pickable: false,
        filled: true,
        stroked: true,
        radiusMinPixels: 10,
        getPosition: d => [d.lng, d.lat],
        getFillColor: d => d.color,
        getLineColor: [255, 255, 255, 220],
        lineWidthMinPixels: 2,
      }));
    }

    return result;
  }, [simState, enabledLayers, routePath]);

  const getTooltip = ({ object }) => {
    if (!object) return null;

    // Road
    if (object.path && object.name) {
      return {
        html: `
          <div style="margin-bottom:6px"><strong>${object.name}</strong> <span style="opacity:0.6">(${object.id})</span></div>
          <div>Risk: <span style="font-weight:700;color:rgb(${(RISK_COLORS[object.risk]||[180,180,180]).join(',')})">${object.risk}</span></div>
          <div>Depth: <strong>${object.depthCm.toFixed(1)} cm</strong> <span style="opacity:0.6">[${object.depthLower.toFixed(1)}–${object.depthUpper.toFixed(1)}]</span></div>
          <div>Drain Util: <strong>${object.drainUtilPct.toFixed(0)}%</strong></div>
          ${object.ttf != null ? `<div>Time-to-flood: <strong>${object.ttf} min</strong></div>` : ''}
          ${object.causeSummary ? `<div style="margin-top:4px;color:#f87171;font-size:0.8rem">${object.causeSummary}</div>` : ''}
          <div style="margin-top:4px;opacity:0.5;font-size:0.75rem">Confidence: Tier ${object.tier} · Click for details</div>
        `
      };
    }

    // Node
    if (object.type && object.id) {
      return {
        html: `
          <div style="margin-bottom:6px"><strong>Node ${object.id}</strong> <span style="opacity:0.6">(${object.type})</span></div>
          <div>Status: <span style="font-weight:700;color:rgb(${(STATUS_COLORS[object.status]||[180,180,180]).join(',')})">${object.status}</span></div>
          <div>Utilisation: <strong>${object.utilPct.toFixed(0)}%</strong></div>
          <div>Flow: ${object.flow.toFixed(0)} L/s · Cap: ${object.capacity} L/s</div>
          ${object.ttc != null ? `<div>Time-to-critical: <strong>${object.ttc} min</strong></div>` : ''}
          <div>Tier: ${TIER_LABELS[object.tier] || object.tier}</div>
          ${object.cause ? `<div style="margin-top:4px;color:#f87171;font-size:0.8rem">${object.cause}</div>` : ''}
          <div style="margin-top:4px;opacity:0.5;font-size:0.75rem">Click for full intelligence</div>
        `
      };
    }

    // Edge
    if (object.source && object.target) {
      return {
        html: `
          <div><strong>Pipe ${object.id}</strong> (${object.type})</div>
          <div>${object.source} → ${object.target}</div>
          <div>Util: ${object.utilPct.toFixed(0)}% · Flow: ${object.flow.toFixed(0)} L/s</div>
          <div>Dia: ${object.diameter}mm · Len: ${object.length}m</div>
        `
      };
    }

    return null;
  };

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      getTooltip={getTooltip}
      style={{ width: '100%', height: '100%' }}
    >
      <Map
        mapStyle={MAP_STYLE}
        attributionControl={false}
      />
    </DeckGL>
  );
}
