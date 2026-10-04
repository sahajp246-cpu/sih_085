import React from 'react';
import { X, MapPin, Droplets, Clock, AlertTriangle, BarChart3, Waves, Shield, Info } from 'lucide-react';
import { RISK_COLORS_HEX, TIER_LABELS } from '../config/riskColors';

export default function DetailPanel({ type, data, onClose }) {
  if (!data) return null;
  if (type === 'road') return <RoadDetail road={data} onClose={onClose} />;
  if (type === 'node') return <NodeDetail node={data} onClose={onClose} />;
  return null;
}

function RoadDetail({ road, onClose }) {
  const cb = road.causeBreakdown || {};

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div>
          <h3><MapPin size={14} /> {road.name}</h3>
          <span className="detail-id">{road.id}</span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>
      </div>

      <div className={`risk-banner risk-bg-${road.risk.toLowerCase()}`}>
        <Shield size={18} />
        <span>{road.risk}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-stat">
          <Droplets size={14} />
          <div>
            <span className="stat-label">Predicted Depth</span>
            <span className="stat-value" style={{ color: RISK_COLORS_HEX[road.risk] }}>
              {road.depthCm.toFixed(1)} cm
            </span>
            <span className="stat-range">[{road.depthLower.toFixed(1)} – {road.depthUpper.toFixed(1)} cm]</span>
          </div>
        </div>

        {road.ttf != null && (
          <div className="detail-stat">
            <Clock size={14} />
            <div>
              <span className="stat-label">Time-to-Flood</span>
              <span className="stat-value risk-CRITICAL">
                {road.ttf === 0 ? 'FLOODING NOW' : `${road.ttf} min`}
              </span>
            </div>
          </div>
        )}

        <div className="detail-stat">
          <Waves size={14} />
          <div>
            <span className="stat-label">Drainage Utilisation</span>
            <span className={`stat-value ${road.drainUtilPct > 100 ? 'risk-CRITICAL' : ''}`}>
              {road.drainUtilPct.toFixed(0)}%
            </span>
          </div>
        </div>

        {road.velocity > 0 && (
          <div className="detail-stat">
            <BarChart3 size={14} />
            <div>
              <span className="stat-label">Flow Velocity</span>
              <span className="stat-value">{road.velocity.toFixed(2)} m/s</span>
            </div>
          </div>
        )}
      </div>

      <div className="detail-section">
        <h4><AlertTriangle size={12} /> Exceedance Probability</h4>
        <div className="prob-grid">
          {[
            ['&gt; 10 cm', road.prob10],
            ['&gt; 20 cm', road.prob20],
            ['&gt; 30 cm', road.prob30],
            ['&gt; 50 cm', road.prob50],
          ].map(([label, val]) => (
            <div key={label} className="prob-item">
              {/* eslint-disable-next-line react/no-danger */}
              <span dangerouslySetInnerHTML={{ __html: label }} />
              <div className="prob-bar-bg">
                <div
                  className="prob-bar-fill"
                  style={{
                    width: `${val}%`,
                    background: val > 70 ? 'var(--risk-critical)' : val > 40 ? 'var(--risk-high)' : 'var(--accent-cyan)',
                  }}
                />
              </div>
              <span className="prob-val">{val.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {road.causeSummary && (
        <div className="detail-section">
          <h4><Info size={12} /> Cause Analysis</h4>
          <p className="cause-text">{road.causeSummary}</p>
          <div className="cause-breakdown">
            {cb.rainfall > 0 && <CauseBar label="Rainfall" pct={cb.rainfall} color="var(--accent-cyan)" />}
            {cb.drainage > 0 && <CauseBar label="Drainage Constraint" pct={cb.drainage} color="var(--risk-critical)" />}
            {cb.terrain > 0 && <CauseBar label="Terrain" pct={cb.terrain} color="var(--risk-caution)" />}
            {cb.blockage > 0 && <CauseBar label="Blockage" pct={cb.blockage} color="var(--risk-high)" />}
          </div>
        </div>
      )}

      <div className="detail-footer">
        Confidence: Tier {road.tier} — {TIER_LABELS[road.tier] || road.tier}
      </div>
    </div>
  );
}

function NodeDetail({ node, onClose }) {
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div>
          <h3><Waves size={14} /> Node {node.id}</h3>
          <span className="detail-id">{node.type}</span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>
      </div>

      <div className={`risk-banner status-bg-${node.status.toLowerCase()}`}>
        <AlertTriangle size={18} />
        <span>{node.status}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-stat">
          <BarChart3 size={14} />
          <div>
            <span className="stat-label">Utilisation</span>
            <span className={`stat-value ${node.utilPct > 100 ? 'risk-CRITICAL' : node.utilPct > 75 ? 'risk-CAUTION' : 'risk-SAFE'}`}>
              {node.utilPct.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="detail-stat">
          <Droplets size={14} />
          <div>
            <span className="stat-label">Flow / Capacity</span>
            <span className="stat-value">{node.flow.toFixed(0)} / {node.capacity} L/s</span>
          </div>
        </div>

        {node.ttc != null && (
          <div className="detail-stat">
            <Clock size={14} />
            <div>
              <span className="stat-label">Time-to-Critical</span>
              <span className="stat-value risk-CRITICAL">
                {node.ttc === 0 ? 'CRITICAL NOW' : `${node.ttc} min`}
              </span>
            </div>
          </div>
        )}

        <div className="detail-stat">
          <Waves size={14} />
          <div>
            <span className="stat-label">Surface Exchange</span>
            <span className={`stat-value ${node.surfaceExchange < 0 ? 'risk-CRITICAL' : 'risk-SAFE'}`}>
              {node.surfaceExchange > 0 ? '↓' : '↑'} {Math.abs(node.surfaceExchange).toFixed(1)} L/s
            </span>
            <span className="stat-range">
              {node.surfaceExchange < 0 ? 'BACKFLOW to surface' : 'Surface → Drain'}
            </span>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <h4>Hydraulic Properties</h4>
        <div className="props-grid">
          <span>Elevation</span><span>{node.elevation.toFixed(1)} m</span>
          <span>Rim Level</span><span>{node.rim.toFixed(1)} m</span>
          <span>Invert Level</span><span>{node.invert.toFixed(1)} m</span>
          <span>Hydraulic Head</span><span>{(node.head || 0).toFixed(2)} m</span>
          <span>Downstream Impact</span><span>{node.downstreamImpact} nodes</span>
          {node.blockage > 0 && <><span>Blockage</span><span className="risk-CRITICAL">{node.blockage}%</span></>}
        </div>
      </div>

      {node.cause && (
        <div className="detail-section">
          <h4><AlertTriangle size={12} /> Cause</h4>
          <p className="cause-text">{node.cause}</p>
        </div>
      )}

      <div className="detail-footer">
        Confidence: Tier {node.tier} — {TIER_LABELS[node.tier] || node.tier}
      </div>
    </div>
  );
}

function CauseBar({ label, pct, color }) {
  return (
    <div className="cause-bar-row">
      <span className="cause-label">{label}</span>
      <div className="cause-bar-bg">
        <div className="cause-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="cause-pct">{pct.toFixed(0)}%</span>
    </div>
  );
}
