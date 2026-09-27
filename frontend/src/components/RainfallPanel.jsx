import React from 'react';
import { CloudRain, TrendingUp, Eye, BarChart3 } from 'lucide-react';

export default function RainfallPanel({ nowcast }) {
  if (!nowcast || !nowcast.current && nowcast.current !== 0) return null;

  const intensityClass = nowcast.current > 60 ? 'risk-CRITICAL'
    : nowcast.current > 30 ? 'risk-HIGH'
    : nowcast.current > 10 ? 'risk-CAUTION'
    : 'risk-SAFE';

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        <CloudRain size={14} />
        Rainfall Nowcast
        <span className="demo-badge">DEMO</span>
      </h3>

      <div className="stat-row">
        <div className="stat-mini">
          <span className="stat-label">Current</span>
          <span className={`stat-value ${intensityClass}`}>{nowcast.current.toFixed(1)} mm/h</span>
        </div>
        <div className="stat-mini">
          <span className="stat-label">Forecast +30m</span>
          <span className="stat-value">{nowcast.forecast.toFixed(1)} mm/h</span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-mini">
          <span className="stat-label">Cumulative</span>
          <span className="stat-value">{nowcast.cumulative.toFixed(1)} mm</span>
        </div>
        <div className="stat-mini">
          <span className="stat-label">Peak</span>
          <span className="stat-value">{nowcast.peak.toFixed(0)} mm/h</span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-mini">
          <span className="stat-label">P(&gt;30mm/h)</span>
          <span className={`stat-value ${nowcast.probHeavy > 50 ? 'risk-HIGH' : ''}`}>
            {nowcast.probHeavy.toFixed(0)}%
          </span>
        </div>
        <div className="stat-mini">
          <span className="stat-label">P(&gt;60mm/h)</span>
          <span className={`stat-value ${nowcast.probExtreme > 30 ? 'risk-CRITICAL' : ''}`}>
            {nowcast.probExtreme.toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="confidence-row">
        <Eye size={12} />
        <span>Confidence: {nowcast.confidence.toFixed(0)}%</span>
        <div className="confidence-bar">
          <div className="confidence-fill" style={{ width: `${nowcast.confidence}%` }} />
        </div>
      </div>

      {/* Mini sparkline */}
      {nowcast.timeline && nowcast.timeline.length > 0 && (
        <div className="sparkline-container">
          <span className="stat-label" style={{ marginBottom: 4, display: 'block' }}>
            <BarChart3 size={11} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            0–3h Intensity Profile
          </span>
          <div className="sparkline">
            {nowcast.timeline.map((v, i) => (
              <div key={i} className="spark-bar" style={{
                height: `${Math.max(2, (v / Math.max(...nowcast.timeline, 1)) * 100)}%`,
                background: i * 5 <= nowcast.leadTime
                  ? (v > 60 ? 'var(--risk-critical)' : v > 30 ? 'var(--risk-high)' : 'var(--accent-cyan)')
                  : 'rgba(255,255,255,0.15)',
              }} title={`T+${i*5}m: ${v} mm/h`} />
            ))}
          </div>
        </div>
      )}

      <div className="method-label">
        {nowcast.method}
      </div>
    </div>
  );
}
