import React, { useState } from 'react';
import { Navigation, Shield, AlertTriangle, Truck, Footprints, Bus, Siren } from 'lucide-react';

const VEHICLE_ICONS = {
  pedestrian: Footprints,
  car: Truck,
  bus: Bus,
  ambulance: Siren,
};

const RISK_COLORS = { SAFE: '#10b981', CAUTION: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' };

// Predefined origin/destination pairs for the Chennai pilot catchment
const PRESETS = [
  { label: 'Thyagaraya Rd → Canal Bank', oLat: 13.0382, oLng: 80.2340, dLat: 13.0448, dLng: 80.2345 },
  { label: 'South Mada → Usman Rd', oLat: 13.0375, oLng: 80.2365, dLat: 13.0420, dLng: 80.2342 },
  { label: 'Panagal Park → Natesan St', oLat: 13.0390, oLng: 80.2355, dLat: 13.0425, dLng: 80.2360 },
];

export default function RoutingPanel({ onComputeRoute, routeResult }) {
  const [vehicle, setVehicle] = useState('ambulance');
  const [preset, setPreset] = useState(0);

  const handleRoute = () => {
    const p = PRESETS[preset];
    onComputeRoute(p.oLat, p.oLng, p.dLat, p.dLng, vehicle);
  };

  const VIcon = VEHICLE_ICONS[vehicle] || Truck;

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        <Navigation size={14} />
        Flood-Safe Routing
        <span className="demo-badge">DEMO</span>
      </h3>

      <div className="routing-controls">
        <label className="control-label">
          Route
          <select value={preset} onChange={e => setPreset(parseInt(e.target.value))}>
            {PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="control-label">Vehicle Type</label>
        <div className="vehicle-selector">
          {Object.keys(VEHICLE_ICONS).map(v => {
            const Icon = VEHICLE_ICONS[v];
            return (
              <button
                key={v}
                className={`vehicle-btn ${vehicle === v ? 'active' : ''}`}
                onClick={() => setVehicle(v)}
                title={v}
              >
                <Icon size={16} />
                <span>{v}</span>
              </button>
            );
          })}
        </div>

        <button className="simulate-btn" onClick={handleRoute}>
          <Navigation size={14} />
          FIND SAFE ROUTE
        </button>
      </div>

      {routeResult && (
        <div className="route-result">
          <div className="route-header">
            <VIcon size={16} />
            <span>{routeResult.vehicle}</span>
            <span className={`route-safety ${routeResult.safe ? 'safe' : 'unsafe'}`}>
              {routeResult.safe ? 'ROUTE SAFE' : 'ROUTE COMPROMISED'}
            </span>
          </div>

          <div className="route-stats">
            <div>
              <span className="stat-label">Distance</span>
              <span className="stat-value">{routeResult.distance.toFixed(2)} km</span>
            </div>
            <div>
              <span className="stat-label">ETA</span>
              <span className="stat-value">{routeResult.eta.toFixed(0)} min</span>
            </div>
            <div>
              <span className="stat-label">Safety</span>
              <span className="stat-value" style={{ color: RISK_COLORS[routeResult.risk] }}>
                {routeResult.safety.toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="stat-label">Risk</span>
              <span className={`stat-value risk-${routeResult.risk}`}>{routeResult.risk}</span>
            </div>
          </div>

          {routeResult.avoided?.length > 0 && (
            <div className="avoided-section">
              <h4><AlertTriangle size={12} /> Avoided Segments ({routeResult.avoided.length})</h4>
              {routeResult.reasons.map((r, i) => (
                <div key={i} className="avoided-reason">{r}</div>
              ))}
            </div>
          )}

          {routeResult.path?.length === 0 && (
            <div className="no-route">
              <AlertTriangle size={16} />
              No safe route available — all paths contain unsafe segments
            </div>
          )}
        </div>
      )}
    </div>
  );
}
