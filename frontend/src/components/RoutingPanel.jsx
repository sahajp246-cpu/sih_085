import React, { useState } from 'react';
import { Navigation, AlertTriangle, Truck, User, Bus, AlertCircle } from 'lucide-react';
import { RISK_COLORS_HEX } from '../config/riskColors';

const VEHICLE_OPTIONS = [
  { id: 'pedestrian', label: 'Pedestrian', Icon: User },
  { id: 'car', label: 'Car', Icon: Truck },
  { id: 'bus', label: 'Bus', Icon: Bus },
  { id: 'ambulance', label: 'Ambulance', Icon: AlertCircle },
];

export default function RoutingPanel({ onComputeRoute, onClear, routeResult, origin, destination }) {
  const [vehicle, setVehicle] = useState('ambulance');

  const handleFindRoute = () => {
    if (origin && destination) {
      onComputeRoute(vehicle);
    }
  };

  const selectedVehicle = VEHICLE_OPTIONS.find((v) => v.id === vehicle);
  const VIcon = selectedVehicle?.Icon || Truck;

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        <Navigation size={14} />
        Flood-Safe Routing
        <span className="demo-badge">DEMO</span>
      </h3>

      <div className="routing-controls">
        <p className="routing-instructions">
          <strong>Interactive Mode:</strong> Click on the map to select your Origin and Destination.
        </p>

        <div className="routing-waypoints">
          <div className={`routing-waypoint ${origin ? 'routing-waypoint--set' : ''}`}>
            <div className="routing-waypoint-label origin">ORIGIN</div>
            <div className="routing-waypoint-value">{origin ? 'Selected' : 'Tap on map…'}</div>
          </div>
          <div className={`routing-waypoint ${destination ? 'routing-waypoint--set routing-waypoint--dest' : ''}`}>
            <div className="routing-waypoint-label destination">DESTINATION</div>
            <div className="routing-waypoint-value">{destination ? 'Selected' : 'Tap on map…'}</div>
          </div>
        </div>

        <label className="control-label">Vehicle Type</label>
        <div className="vehicle-selector">
          {VEHICLE_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`vehicle-btn ${vehicle === id ? 'active' : ''}`}
              onClick={() => setVehicle(id)}
              title={label}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="routing-actions">
          <button
            className="simulate-btn routing-find-btn"
            onClick={handleFindRoute}
            disabled={!origin || !destination}
          >
            <Navigation size={14} />
            FIND ROUTE
          </button>
          <button className="simulate-btn routing-clear-btn" onClick={onClear}>
            CLEAR
          </button>
        </div>
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
              <span className="stat-value" style={{ color: RISK_COLORS_HEX[routeResult.risk] }}>
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
              {routeResult.reasons.map((reason, i) => (
                <div key={i} className="avoided-reason">{reason}</div>
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
