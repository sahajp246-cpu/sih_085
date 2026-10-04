/**
 * API Service for FloodTwin
 * Communicates with the FastAPI backend service (/api)
 * with a seamless fallback to the in-browser simulation engine when offline.
 */

import { engine as localEngine } from '../simulation/engine';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000'
    : '/api');

let isBackendConnected = false;

function normalizeSimulationState(raw) {
  if (!raw) return null;

  // If already in frontend camelCase format, return as is
  if (raw.nodes?.[0]?.id) return raw;

  const nodes = (raw.nodes || []).map((n) => ({
    id: n.node_id || n.id,
    type: n.node_type || n.type,
    lat: n.lat,
    lng: n.lng,
    elevation: n.elevation_m ?? n.elevation ?? 0,
    rim: n.rim_elevation_m ?? n.rim ?? 0,
    invert: n.invert_elevation_m ?? n.invert ?? 0,
    capacity: n.capacity_lps ?? n.capacity ?? 100,
    flow: n.current_flow_lps ?? n.flow ?? 0,
    utilPct: n.utilisation_pct ?? n.utilPct ?? 0,
    head: n.hydraulic_head_m ?? n.head ?? 0,
    depth: n.depth_m ?? n.depth ?? 0,
    surfaceExchange: n.surface_exchange_lps ?? n.surfaceExchange ?? 0,
    ttc: n.time_to_critical_min ?? n.ttc ?? null,
    status: n.status || 'NORMAL',
    cause: n.cause || null,
    tier: n.confidence_tier || n.tier || 'A',
    blockage: n.blockage_pct ?? n.blockage ?? 0,
    downstreamImpact: n.downstream_impact_count ?? n.downstreamImpact ?? 0,
  }));

  const edges = (raw.edges || []).map((e) => ({
    id: e.edge_id || e.id,
    type: e.edge_type || e.type,
    source: e.source_node || e.source,
    target: e.target_node || e.target,
    length: e.length_m ?? e.length ?? 50,
    diameter: e.diameter_mm ?? e.diameter ?? 600,
    slope: e.slope_pct ?? e.slope ?? 0.5,
    roughness: e.roughness_n ?? e.roughness ?? 0.013,
    capacity: e.capacity_lps ?? e.capacity ?? 100,
    flow: e.current_flow_lps ?? e.flow ?? 0,
    utilPct: e.utilisation_pct ?? e.utilPct ?? 0,
    velocity: e.velocity_mps ?? e.velocity ?? 0,
    status: e.status || 'NORMAL',
    tier: e.confidence_tier || e.tier || 'A',
  }));

  const roads = (raw.roads || []).map((r) => ({
    id: r.segment_id || r.id,
    name: r.name,
    path: r.path,
    nodeId: r.associated_node_id || r.nodeId,
    elevation: r.elevation_m ?? r.elevation ?? 0,
    imperviousness: r.imperviousness_pct ?? r.imperviousness ?? 70,
    depthCm: r.depth_cm ?? r.depthCm ?? 0,
    depthLower: r.depth_lower_cm ?? r.depthLower ?? 0,
    depthUpper: r.depth_upper_cm ?? r.depthUpper ?? 0,
    velocity: r.velocity_mps ?? r.velocity ?? 0,
    prob10: r.probability_10cm ?? r.prob10 ?? 0,
    prob20: r.probability_20cm ?? r.prob20 ?? 0,
    prob30: r.probability_30cm ?? r.prob30 ?? 0,
    prob50: r.probability_50cm ?? r.prob50 ?? 0,
    ttf: r.time_to_flood_min ?? r.ttf ?? null,
    drainUtilPct: r.drainage_utilisation_pct ?? r.drainUtilPct ?? 0,
    causeSummary: r.cause_summary ?? r.causeSummary ?? null,
    causeBreakdown: {
      rainfall: r.cause_breakdown?.rainfall_pct ?? r.causeBreakdown?.rainfall ?? 0,
      terrain: r.cause_breakdown?.terrain_pct ?? r.causeBreakdown?.terrain ?? 0,
      drainage: r.cause_breakdown?.drainage_constraint_pct ?? r.causeBreakdown?.drainage ?? 0,
      imperviousness: r.cause_breakdown?.imperviousness_pct ?? r.causeBreakdown?.imperviousness ?? 0,
      blockage: r.cause_breakdown?.blockage_pct ?? r.causeBreakdown?.blockage ?? 0,
    },
    risk: r.risk_level || r.risk || 'SAFE',
    tier: r.confidence_tier || r.tier || 'B',
  }));

  const nc = raw.nowcast || {};
  const nowcast = {
    current: nc.current_intensity_mm_h ?? nc.current ?? 0,
    forecast: nc.forecast_intensity_mm_h ?? nc.forecast ?? 0,
    peak: nc.peak_intensity_mm_h ?? nc.peak ?? 0,
    cumulative: nc.cumulative_mm ?? nc.cumulative ?? 0,
    probHeavy: nc.probability_heavy ?? nc.probHeavy ?? 0,
    probExtreme: nc.probability_extreme ?? nc.probExtreme ?? 0,
    leadTime: nc.lead_time_min ?? nc.leadTime ?? 0,
    confidence: nc.confidence_pct ?? nc.confidence ?? 90,
    method: nc.method || 'Optical-flow extrapolation + ML refinement',
    cells: nc.cells || [],
    timeline: nc.forecast_timeline || nc.timeline || [],
  };

  const alerts = (raw.alerts || []).map((a) => ({
    id: a.alert_id || a.id,
    severity: a.severity || 'INFO',
    title: a.title,
    message: a.message,
    time: a.timestamp_min ?? a.time ?? 0,
    nodeId: a.related_node_id || a.nodeId || null,
    segId: a.related_segment_id || a.segId || null,
  }));

  const criticalNodes = raw.critical_nodes || raw.criticalNodes || [];

  return {
    scenario: raw.scenario || 'heavy_rain',
    timeMin: raw.time_min ?? raw.timeMin ?? 0,
    dataMode: raw.data_mode || raw.dataMode || 'DEMO',
    nodes,
    edges,
    roads,
    nowcast,
    alerts,
    criticalNodes,
  };
}

/**
 * Check backend API health status.
 * @returns {Promise<boolean>}
 */
export async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      isBackendConnected = true;
      return true;
    }
  } catch {
    isBackendConnected = false;
  }
  return false;
}

/**
 * Run a simulation step (uses API endpoint if available, else local engine).
 * @param {string} scenario
 * @param {number} timeMin
 * @param {Object} [blockages]
 * @returns {Promise<Object>}
 */
export async function fetchSimulationStep(scenario, timeMin, blockages = {}) {
  if (isBackendConnected) {
    try {
      const blockageNode = Object.keys(blockages)[0] || '';
      const blockagePct = blockages[blockageNode] || 0;
      const params = new URLSearchParams({
        scenario,
        time_min: timeMin.toString(),
      });

      if (blockageNode && blockagePct > 0) {
        params.append('blockage_node', blockageNode);
        params.append('blockage_pct', blockagePct.toString());
      }

      const response = await fetch(`${API_BASE_URL}/v1/simulation/step?${params.toString()}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const raw = await response.json();
        return normalizeSimulationState(raw);
      }
    } catch {
      isBackendConnected = false;
    }
  }

  // Fallback to client-side engine
  return localEngine.runStep(scenario, timeMin, blockages);
}

/**
 * Helper to query connection status.
 */
export function getBackendConnectionStatus() {
  return isBackendConnected;
}
