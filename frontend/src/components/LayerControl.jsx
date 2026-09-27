import React from 'react';
import { Layers, Eye, EyeOff } from 'lucide-react';

const LAYER_CONFIG = [
  { key: 'roads', label: 'Roads' },
  { key: 'floodRisk', label: 'Flood Risk' },
  { key: 'floodDepth', label: 'Flood Depth' },
  { key: 'rainfall', label: 'Rainfall' },
  { key: 'drainage', label: 'Drainage Network' },
  { key: 'drainageNodes', label: 'Drainage Nodes' },
  { key: 'criticalNodes', label: 'Critical Nodes' },
];

export default function LayerControl({ layers, onToggle }) {
  return (
    <div className="layer-control">
      <div className="layer-header">
        <Layers size={14} />
        <span>Map Layers</span>
      </div>
      <div className="layer-list">
        {LAYER_CONFIG.map(({ key, label }) => (
          <button
            key={key}
            className={`layer-toggle ${layers[key] ? 'active' : ''}`}
            onClick={() => onToggle(key)}
          >
            {layers[key] ? <Eye size={12} /> : <EyeOff size={12} />}
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
