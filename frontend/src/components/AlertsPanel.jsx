import React from 'react';
import { Bell, AlertTriangle, AlertCircle, Info } from 'lucide-react';

const SEVERITY_ICONS = {
  CRITICAL: AlertTriangle,
  WARNING: AlertCircle,
  INFO: Info,
};

export default function AlertsPanel({ alerts }) {
  if (!alerts?.length) {
    return (
      <div className="sub-panel">
        <h3 className="sub-panel-title">
          <Bell size={14} />
          Alerts
        </h3>
        <div className="empty-state">No active alerts</div>
      </div>
    );
  }

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        <Bell size={14} />
        Alerts
        <span className="count-badge alert-count">{alerts.length}</span>
      </h3>
      <div className="alerts-list">
        {alerts.map(alert => {
          const Icon = SEVERITY_ICONS[alert.severity] || Info;
          return (
            <div key={alert.id} className={`alert-item alert-${alert.severity.toLowerCase()}`}>
              <Icon size={14} className="alert-icon" />
              <div className="alert-content">
                <div className="alert-title">{alert.title}</div>
                <div className="alert-message">{alert.message}</div>
                <div className="alert-time">T+{alert.time}m</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
