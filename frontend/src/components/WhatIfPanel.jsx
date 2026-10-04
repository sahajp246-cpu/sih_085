import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

export default function WhatIfPanel({ nodes, onSimulate, comparison }) {
  const [selectedNode, setSelectedNode] = useState('J104');
  const [blockage, setBlockage] = useState(0);

  const handleSimulate = () => {
    onSimulate(selectedNode, blockage);
  };

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        <AlertTriangle size={14} />
        What-If Blockage Simulator
        <span className="demo-badge">DEMO</span>
      </h3>

      <div className="whatif-controls">
        <label className="control-label">
          Select Drainage Node
          <select value={selectedNode} onChange={(e) => setSelectedNode(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} ({n.type}) — {n.utilPct.toFixed(0)}%
              </option>
            ))}
          </select>
        </label>

        <label className="control-label">
          Blockage: <strong>{blockage}%</strong>
          <input
            type="range" min="0" max="100" step="10"
            value={blockage}
            onChange={(e) => setBlockage(parseInt(e.target.value, 10))}
          />
          <div className="range-labels">
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </label>

        <button className="simulate-btn" onClick={handleSimulate}>
          <RefreshCw size={14} />
          SIMULATE
        </button>
      </div>

      {comparison && (
        <div className="whatif-result">
          <h4>Impact: {comparison.nodeId} @ {comparison.blockagePct}% blockage</h4>

          <div className="before-after">
            <div className="ba-column">
              <span className="ba-label">BEFORE</span>
              <div className="ba-stat">
                <span>Depth</span>
                <span>{comparison.beforeDepth.toFixed(1)} cm</span>
              </div>
              <div className="ba-stat">
                <span>Utilisation</span>
                <span>{comparison.beforeUtil.toFixed(0)}%</span>
              </div>
              <div className="ba-stat">
                <span>Risk</span>
                <span className={`risk-${comparison.beforeRisk}`}>{comparison.beforeRisk}</span>
              </div>
              <div className="ba-stat">
                <span>TTF</span>
                <span>{comparison.beforeTTF != null ? `${comparison.beforeTTF}m` : '—'}</span>
              </div>
            </div>

            <div className="ba-arrow"><ArrowRight size={20} /></div>

            <div className="ba-column">
              <span className="ba-label ba-after">AFTER</span>
              <div className="ba-stat">
                <span>Depth</span>
                <span className={comparison.afterDepth > comparison.beforeDepth ? 'risk-CRITICAL' : ''}>
                  {comparison.afterDepth.toFixed(1)} cm
                </span>
              </div>
              <div className="ba-stat">
                <span>Utilisation</span>
                <span className={comparison.afterUtil > comparison.beforeUtil ? 'risk-CRITICAL' : ''}>
                  {comparison.afterUtil.toFixed(0)}%
                </span>
              </div>
              <div className="ba-stat">
                <span>Risk</span>
                <span className={`risk-${comparison.afterRisk}`}>{comparison.afterRisk}</span>
              </div>
              <div className="ba-stat">
                <span>TTF</span>
                <span className={
                  comparison.afterTTF != null &&
                  (comparison.beforeTTF == null || comparison.afterTTF < comparison.beforeTTF)
                    ? 'risk-CRITICAL' : ''
                }>
                  {comparison.afterTTF != null ? `${comparison.afterTTF}m` : '—'}
                </span>
              </div>
            </div>
          </div>

          {comparison.affectedRoads?.length > 0 && (
            <div className="whatif-affected">
              <div className="whatif-affected-header">
                <AlertTriangle size={14} />
                <strong>{comparison.affectedRoads.length} Surrounding Road(s) Affected</strong>
              </div>
              <div className="whatif-affected-list">
                {comparison.affectedRoads.map((road) => (
                  <div key={road.id} className="whatif-affected-road">
                    <span className="whatif-road-name">{road.name}</span>
                    <span className="whatif-road-depth-change">
                      <span className="whatif-depth-before">{road.beforeDepth.toFixed(1)}cm</span>
                      <ArrowRight size={10} />
                      <span className="risk-CRITICAL whatif-depth-after">{road.afterDepth.toFixed(1)}cm</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
