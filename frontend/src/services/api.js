/**
 * API Service for FloodTwin
 * Communicates with the FastAPI backend service (http://localhost:8000)
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
        return await response.json();
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
