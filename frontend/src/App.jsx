import React, { useState, useEffect, useCallback } from 'react';
import { engine } from './simulation/engine';
import { checkBackendHealth, fetchSimulationStep } from './services/api';
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
  CloudRain, Waves, Navigation, AlertTriangle, Radio,
} from 'lucide-react';

const TABS = [
  { id: 'rainfall', label: 'Rainfall', icon: CloudRain },
  { id: 'drainage', label: 'Drainage', icon: Waves },
  { id: 'whatif', label: 'What-If', icon: AlertTriangle },
  { id: 'routing', label: 'Routing', icon: Navigation },
  { id: 'alerts', label: 'Alerts', icon: Radio },
];

const TIMELINE_MARKS = [0, 30, 60, 90, 120, 150, 180];
const TIMELINE_MAX_MINUTES = 180;
const TIMELINE_STEP_MINUTES = 5;
const PLAYBACK_INTERVAL_MS = 600;

const DEFAULT_LAYERS = {
  roads: true,
  floodRisk: true,
  floodDepth: true,
  rainfall: true,
  drainage: true,
  drainageNodes: true,
  criticalNodes: true,
};

function App() {
  const [scenario, setScenario] = useState('heavy_rain');
  const [timeMin, setTimeMin] = useState(0);
  const [blockages, setBlockages] = useState({});
  const [simState, setSimState] = useState(() => engine.runStep('heavy_rain', 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBackendLive, setIsBackendLive] = useState(false);

  // Check backend connectivity on mount
  useEffect(() => {
    checkBackendHealth().then((connected) => {
      setIsBackendLive(connected);
    });
  }, []);

  // Panel / UI state
  const [activeTab, setActiveTab] = useState('rainfall');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [detailType, setDetailType] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [whatIfComparison, setWhatIfComparison] = useState(null);
  const [routeResult, setRouteResult] = useState(null);
  const [routePath, setRoutePath] = useState(null);
  const [routingOrigin, setRoutingOrigin] = useState(null);
  const [routingDestination, setRoutingDestination] = useState(null);
  const [enabledLayers, setEnabledLayers] = useState(DEFAULT_LAYERS);

  // Re-run simulation whenever scenario, time, or blockages change
  useEffect(() => {
    let isSubscribed = true;
    fetchSimulationStep(scenario, timeMin, blockages).then((newState) => {
      if (isSubscribed && newState) {
        setSimState(newState);
      }
    }).catch((err) => {
      console.error('Simulation step failed:', err);
    });

    return () => { isSubscribed = false; };
  }, [scenario, timeMin, blockages]);

  // Auto-advance timeline during playback
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimeMin((t) => {
        if (t >= TIMELINE_MAX_MINUTES) { setIsPlaying(false); return t; }
        return t + TIMELINE_STEP_MINUTES;
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleScenarioChange = useCallback((e) => {
    setScenario(e.target.value);
    setTimeMin(0);
    setIsPlaying(false);
    setBlockages({});
    setWhatIfComparison(null);
    setRouteResult(null);
    setRoutePath(null);
  }, []);

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
    try {
      const result = engine.runWhatIf(nodeId, blockagePct);
      setWhatIfComparison(result);
      setSimState({ ...engine.state });
      setBlockages({ [nodeId]: blockagePct });
    } catch (err) {
      console.error('What-If simulation failed:', err);
    }
  }, []);

  const handleComputeRoute = useCallback((vehicle) => {
    if (!routingOrigin || !routingDestination) return;
    try {
      const result = engine.computeRoute(
        routingOrigin.lat, routingOrigin.lng,
        routingDestination.lat, routingDestination.lng,
        vehicle,
      );
      setRouteResult(result);
      setRoutePath(result.path || null);
    } catch (err) {
      console.error('Route computation failed:', err);
    }
  }, [routingOrigin, routingDestination]);

  const handleClearRoute = useCallback(() => {
    setRoutingOrigin(null);
    setRoutingDestination(null);
    setRouteResult(null);
    setRoutePath(null);
  }, []);

  const handleMapClick = useCallback((coordinate) => {
    if (activeTab !== 'routing') return;
    const [lng, lat] = coordinate;
    if (!routingOrigin) {
      setRoutingOrigin({ lat, lng });
    } else if (!routingDestination) {
      setRoutingDestination({ lat, lng });
    }
  }, [activeTab, routingOrigin, routingDestination]);

  const handleLayerToggle = useCallback((key) => {
    setEnabledLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleTimelineChange = useCallback((e) => {
    setTimeMin(parseInt(e.target.value, 10));
    setIsPlaying(false);
  }, []);

  const handleReset = useCallback(() => {
    setTimeMin(0);
    setIsPlaying(false);
  }, []);

  // Derived KPI values for the summary strip
  const maxDepth = Math.max(0, ...simState.roads.map((r) => r.depthCm));
  const criticalRoadCount = simState.roads.filter((r) => r.risk === 'CRITICAL').length;
  const highRoadCount = simState.roads.filter((r) => r.risk === 'HIGH').length;
  const stressedNodeCount = simState.nodes.filter((n) => n.utilPct > 75).length;
  const alertCount = simState.alerts?.length ?? 0;
  const currentRainfallMmh = simState.nowcast?.current ?? 0;

  return (
    <>
      {/* ── Top Bar ── */}
      <header className="header" id="top-bar">
        <div className="header-left">
          <h1 className="brand">
            <span className="brand-icon">◆</span>
            FLOODTWIN
          </h1>
          <span className="header-badge pilot-badge">Chennai Pilot · T. Nagar</span>
          {isBackendLive ? (
            <span className="header-badge api-connected">
              <span className="status-dot green" />
              API CONNECTED
            </span>
          ) : (
            <span className="header-badge engine-standalone">
              <span className="status-dot cyan" />
              STANDALONE ENGINE
            </span>
          )}
        </div>
        <div className="header-right">
          <select
            id="scenario-select"
            value={scenario}
            onChange={handleScenarioChange}
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
            onMapClick={handleMapClick}
            routePath={routePath}
            routingOrigin={routingOrigin}
            routingDestination={routingDestination}
          />

          <div className="map-overlay-tl">
            <LayerControl layers={enabledLayers} onToggle={handleLayerToggle} />
          </div>

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
        <div className={`side-panel left-panel ${isLeftPanelOpen ? 'open' : 'collapsed'}`}>
          <button
            className="panel-toggle"
            onClick={() => setIsLeftPanelOpen((open) => !open)}
            aria-label={isLeftPanelOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {isLeftPanelOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          {isLeftPanelOpen && (
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
                  <span className={`kpi-value ${criticalRoadCount > 0 ? 'risk-CRITICAL' : 'risk-SAFE'}`}>
                    {criticalRoadCount}
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">Rainfall</span>
                  <span className={`kpi-value ${currentRainfallMmh > 60 ? 'risk-CRITICAL' : currentRainfallMmh > 25 ? 'risk-CAUTION' : 'risk-SAFE'}`}>
                    {currentRainfallMmh.toFixed(0)}<small>mm/h</small>
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">Stressed Nodes</span>
                  <span className={`kpi-value ${stressedNodeCount > 3 ? 'risk-HIGH' : stressedNodeCount > 0 ? 'risk-CAUTION' : 'risk-SAFE'}`}>
                    {stressedNodeCount}
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
                    comparison={whatIfComparison}
                  />
                )}
                {activeTab === 'routing' && (
                  <RoutingPanel
                    onComputeRoute={handleComputeRoute}
                    onClear={handleClearRoute}
                    routeResult={routeResult}
                    origin={routingOrigin}
                    destination={routingDestination}
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
              <span className={`timeline-kpi ${criticalRoadCount > 0 ? 'risk-CRITICAL' : ''}`}>
                {criticalRoadCount} Critical
              </span>
              <span className={`timeline-kpi ${highRoadCount > 0 ? 'risk-HIGH' : ''}`}>
                {highRoadCount} High
              </span>
              <span className="timeline-kpi">
                {currentRainfallMmh.toFixed(0)} mm/h
              </span>
            </div>
          </div>
          <div className="timeline-controls">
            <button id="btn-reset" onClick={handleReset} title="Reset" className="timeline-btn">
              <SkipBack size={14} />
            </button>
            <button
              id="btn-play"
              onClick={() => setIsPlaying((p) => !p)}
              className="timeline-btn play-btn"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>
            <div className="timeline-slider-container">
              <input
                id="timeline-slider"
                type="range"
                min="0"
                max={TIMELINE_MAX_MINUTES}
                step={TIMELINE_STEP_MINUTES}
                value={timeMin}
                onChange={handleTimelineChange}
                className="timeline-slider"
              />
              <div className="timeline-ticks">
                {TIMELINE_MARKS.map((t) => (
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
