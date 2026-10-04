import { Waves, TrendingDown, Clock } from 'lucide-react';
import { TIER_LABELS } from '../config/riskColors';

export default function DrainagePanel({ nodes, criticalNodes, onNodeClick }) {
  const critical = nodes
    .filter(n => criticalNodes.includes(n.id))
    .sort((a, b) => b.utilPct - a.utilPct);

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        <Waves size={14} />
        Critical Drainage Nodes
        <span className="count-badge">{critical.length}</span>
      </h3>

      {critical.length === 0 && (
        <div className="empty-state">All drainage nodes operating normally</div>
      )}

      <div className="node-list">
        {critical.map(node => (
          <button
            key={node.id}
            className={`node-card node-${node.status.toLowerCase()}`}
            onClick={() => onNodeClick(node)}
          >
            <div className="node-header">
              <span className="node-id">{node.id}</span>
              <span className={`node-status status-${node.status.toLowerCase()}`}>
                {node.status}
              </span>
            </div>
            <div className="node-stats">
              <div>
                <TrendingDown size={11} />
                <span>{node.utilPct.toFixed(0)}%</span>
              </div>
              {node.ttc != null && (
                <div>
                  <Clock size={11} />
                  <span>{node.ttc === 0 ? 'NOW' : `${node.ttc}m`}</span>
                </div>
              )}
              <div className={`tier tier-${node.tier.toLowerCase()}`}>
                Tier {node.tier}
              </div>
            </div>
            {node.cause && (
              <div className="node-cause">{node.cause}</div>
            )}
            <div className="node-detail-hint">
              {node.type} · {node.downstreamImpact} downstream · Flow: {node.flow.toFixed(0)}/{node.capacity} L/s
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
