import React, { useState, useEffect, useCallback } from 'react';
import { engine } from './simulation/engine';
import MapComponent from './components/MapComponent';
import RainfallPanel from './components/RainfallPanel';
import DrainagePanel from './components/DrainagePanel';
import DetailPanel from './components/DetailPanel';
import WhatIfPanel from './components/WhatIfPanel';
import RoutingPanel from './components/RoutingPanel';
import AlertsPanel from './components/AlertsPanel';
import LayerControl from './components/LayerControl';
import {
  Activity, Play, Pause, SkipBack, ChevronLeft, ChevronRight,
  CloudRain, Waves, Navigation, AlertTriangle, Settings, Radio
} from 'lucide-react';

const TABS = [
  { id: 'rainfall', label: 'Rainfall', icon: CloudRain },
  { id: 'drainage', label: 'Drainage', icon: Waves },
  { id: 'whatif', label: 'What-If', icon: AlertTriangle },
  { id: 'routing', label: 'Routing', icon: Navigation },
  { id: 'alerts', label: 'Alerts', icon: Radio },
];

function App() {
  const [scenario, setScenario] = useState('heavy_rain');
  const [timeMin, setTimeMin] = useState(0);
  const [blockages, setBlockages] = useState({});
  const [simState, setSimState] = useState(() => engine.runStep('heavy_rain', 0));
  const [isPlaying, setIsPlaying] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState('rainfall');
  const [leftOpen, setLeftOpen] = useState(true);
  const [detailType, setDetailType] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [routeResult, setRouteResult] = useState(null);
  const [routePath, setRoutePath] = useState(null);

  const [enabledLayers, setEnabledLayers] = useState({
    roads: true,
    floodRisk: true,
    floodDepth: true,
    rainfall: true,
    drainage: true,
    drainageNodes: true,
    criticalNodes: true,
  });

  // Run simulation when params change
  useEffect(() => {
    const newState = engine.runStep(scenario, timeMin, blockages);
    setSimState(newState);
  }, [scenario, timeMin, blockages]);

  // Auto-play timeline
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeMin(t => {
          if (t >= 180) { setIsPlaying(false); return t; }
          return t + 5;
        });
      }, 600);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleNodeClick = useCallback((node) => {
    setDetailType('node');
    setDetailData(node);
  }, []);

  const handleRoadClick = useCallback((road) => {
    setDetailType('road');
    setDetailData(road);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailType(null);
    setDetailData(null);
  }, []);

  const handleWhatIf = useCallback((nodeId, blockagePct) => {
    // Save baseline first
    const baseState = engine.runStep(scenario, timeMin, {});
    const beforeRoad = baseState.roads.find(r => r.nodeId === nodeId);
    const beforeNode = baseState.nodes.find(n => n.id === nodeId);

    // Run with blockage
    const newBlockages = { [nodeId]: blockagePct };
    const newState = engine.runStep(scenario, timeMin, newBlockages);
    setSimState(newState);
    setBlockages(newBlockages);

    const afterRoad = newState.roads.find(r => r.nodeId === nodeId);
    const afterNode = newState.nodes.find(n => n.id === nodeId);

    const affectedRoads = newState.roads.filter((r, i) => {
      const br = baseState.roads[i];
      return r.depthCm > (br?.depthCm || 0) + 2;
    }).map(r => r.id);

    setComparison({
      nodeId, blockagePct,
      beforeDepth: beforeRoad?.depthCm || 0,
      afterDepth: afterRoad?.depthCm || 0,
      beforeUtil: beforeNode?.utilPct || 0,
      afterUtil: afterNode?.utilPct || 0,
      beforeRisk: beforeRoad?.risk || 'SAFE',
      afterRisk: afterRoad?.risk || 'SAFE',
      beforeTTF: beforeRoad?.ttf,
      afterTTF: afterRoad?.ttf,
      affectedRoads,
      affectedNodes: newState.nodes.filter(n => n.utilPct > 80).map(n => n.id),
    });
  }, [scenario, timeMin]);

  const handleComputeRoute = useCallback((oLat, oLng, dLat, dLng, vehicle) => {
    const result = engine.computeRoute(oLat, oLng, dLat, dLng, vehicle);
    setRouteResult(result);
    setRoutePath(result.path || null);
  }, []);

  const handleLayerToggle = useCallback((key) => {
    setEnabledLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Computed values
  const maxDepth = Math.max(0, ...simState.roads.map(r => r.depthCm));
  const criticalRoads = simState.roads.filter(r => r.risk === 'CRITICAL').length;
  const highRoads = simState.roads.filter(r => r.risk === 'HIGH').length;
  const stressedNodes = simState.nodes.filter(n => n.utilPct > 75).length;
  const alertCount = simState.alerts?.length || 0;
  const rainfall = simState.nowcast?.current || 0;

  return (
    <>
      {/* ── Top Bar ── */}
      <header className="header" id="top-bar">
        <div className="header-left">
          <h1 className="brand">
            <span className="brand-icon">◆</span>
            FLOODTWIN
          </h1>
          <span className="header-badge sih-badge">SIH26085</span>
          <span className="header-badge pilot-badge">Chennai Pilot · T. Nagar</span>
          <span className="header-badge demo-indicator">
            <span className="demo-dot" />
            DEMO MODE
          </span>
        </div>
        <div className="header-right">
          <select
            id="scenario-select"
            value={scenario}
            onChange={e => { setScenario(e.target.value); setTimeMin(0); setIsPlaying(false); setBlockages({}); setComparison(null); setRouteResult(null); setRoutePath(null); }}
          >
            <option value="baseline">☀ NORMAL (No Rain)</option>
            <option value="moderate_rain">🌦 MODERATE (25 mm/h)</option>
            <option value="heavy_rain">🌧 HEAVY MONSOON (60 mm/h)</option>
            <option value="extreme_rain">⛈ EXTREME BURST (120 mm/h)</option>
          </select>
          <div className="header-status">
            <Activity size={14} />
            <span>T+{timeMin}m</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main className="main-content">
        {/* Map */}
        <div className="map-container" id="map-area">
          <MapComponent
            simState={simState}
            layers={enabledLayers}
            onNodeClick={handleNodeClick}
            onRoadClick={handleRoadClick}
            routePath={routePath}
          />

          {/* Layer control */}
          <div className="map-overlay-tl">
            <LayerControl layers={enabledLayers} onToggle={handleLayerToggle} />
          </div>

          {/* Map legend */}
          <div className="map-legend">
            <div className="legend-title">Road Risk</div>
            <div className="legend-items">
              <span><i style={{ background: '#10b981' }} />SAFE</span>
              <span><i style={{ background: '#f59e0b' }} />CAUTION</span>
              <span><i style={{ background: '#f97316' }} />HIGH</span>
              <span><i style={{ background: '#ef4444' }} />CRITICAL</span>
            </div>
          </div>
        </div>

        {/* ── Left Panel ── */}
        <div className={`side-panel left-panel ${leftOpen ? 'open' : 'collapsed'}`}>
          <button className="panel-toggle" onClick={() => setLeftOpen(!leftOpen)}>
            {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          {leftOpen && (
            <>
              {/* KPI Strip */}
              <div className="kpi-strip" id="kpi-strip">
                <div className="kpi">
                  <span className="kpi-label">Max Depth</span>
                  <span className={`kpi-value ${maxDepth > 30 ? 'risk-CRITICAL' : maxDepth > 10 ? 'risk-CAUTION' : 'risk-SAFE'}`}>
                    {maxDepth.toFixed(1)}<small>cm</small>
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">Critical Roads</span>
                  <span className={`kpi-value ${criticalRoads > 0 ? 'risk-CRITICAL' : 'risk-SAFE'}`}>
                    {criticalRoads}
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">Rainfall</span>
                  <span className={`kpi-value ${rainfall > 60 ? 'risk-CRITICAL' : rainfall > 25 ? 'risk-CAUTION' : 'risk-SAFE'}`}>
                    {rainfall.toFixed(0)}<small>mm/h</small>
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">Stressed Nodes</span>
                  <span className={`kpi-value ${stressedNodes > 3 ? 'risk-HIGH' : stressedNodes > 0 ? 'risk-CAUTION' : 'risk-SAFE'}`}>
                    {stressedNodes}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="tab-strip">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={`tab-btn ${activeTab === id ? 'active' : ''}`}
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon size={13} />
                    <span>{label}</span>
                    {id === 'alerts' && alertCount > 0 && (
                      <span className="tab-badge">{alertCount}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {activeTab === 'rainfall' && (
                  <RainfallPanel nowcast={simState.nowcast} />
                )}
                {activeTab === 'drainage' && (
                  <DrainagePanel
                    nodes={simState.nodes}
                    criticalNodes={simState.criticalNodes}
                    onNodeClick={handleNodeClick}
                  />
                )}
                {activeTab === 'whatif' && (
                  <WhatIfPanel
                    nodes={simState.nodes}
                    onSimulate={handleWhatIf}
                    comparison={comparison}
                  />
                )}
                {activeTab === 'routing' && (
                  <RoutingPanel
                    onComputeRoute={handleComputeRoute}
                    routeResult={routeResult}
                  />
                )}
                {activeTab === 'alerts' && (
                  <AlertsPanel alerts={simState.alerts} />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Detail Panel (right) ── */}
        {detailData && (
          <div className="side-panel right-panel open">
            <DetailPanel
              type={detailType}
              data={detailData}
              onClose={handleCloseDetail}
            />
          </div>
        )}

        {/* ── Bottom Timeline ── */}
        <div className="bottom-timeline" id="timeline">
          <div className="timeline-header">
            <span className="timeline-title">0–3h FORECAST TIMELINE</span>
            <div className="timeline-kpis">
              <span className={`timeline-kpi ${criticalRoads > 0 ? 'risk-CRITICAL' : ''}`}>
                {criticalRoads} Critical
              </span>
              <span className={`timeline-kpi ${highRoads > 0 ? 'risk-HIGH' : ''}`}>
                {highRoads} High
              </span>
              <span className="timeline-kpi">
                {rainfall.toFixed(0)} mm/h
              </span>
            </div>
          </div>
          <div className="timeline-controls">
            <button
              id="btn-reset"
              onClick={() => { setTimeMin(0); setIsPlaying(false); }}
              title="Reset"
              className="timeline-btn"
            >
              <SkipBack size={14} />
            </button>
            <button
              id="btn-play"
              onClick={() => setIsPlaying(!isPlaying)}
              className="timeline-btn play-btn"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>
            <div className="timeline-slider-container">
              <input
                id="timeline-slider"
                type="range"
                min="0" max="180" step="5"
                value={timeMin}
                onChange={e => { setTimeMin(parseInt(e.target.value)); setIsPlaying(false); }}
                className="timeline-slider"
              />
              <div className="timeline-ticks">
                {[0, 30, 60, 90, 120, 150, 180].map(t => (
                  <span key={t} className={`tick ${t <= timeMin ? 'past' : ''}`}>
                    {t === 0 ? 'NOW' : `+${t}m`}
                  </span>
                ))}
              </div>
            </div>
            <div className="timeline-time">
              <strong>T+{timeMin}m</strong>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
