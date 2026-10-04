/**
 * Client-side deterministic simulation engine.
 * Mirrors backend hydraulic logic for instant UI updates without a network round-trip.
 * Contains the synthetic Chennai T. Nagar pilot catchment (demo data).
 */

const VEHICLE_THRESHOLDS = { pedestrian: 15, car: 25, bus: 40, ambulance: 35 };
const VEHICLE_SPEEDS = { pedestrian: 5, car: 30, bus: 25, ambulance: 45 };

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

class SimulationEngine {
  constructor() {
    this.state = {
      scenario: 'baseline',
      timeMin: 0,
      dataMode: 'DEMO',
      nodes: [],
      edges: [],
      roads: [],
      nowcast: {},
      alerts: [],
      criticalNodes: [],
    };
    this.nodeMap = {};
    this.roadMap = {};
    this.roadGraph = {};
    this._routeSequence = 0;
    this._initChennaiCatchment();
  }

  _initChennaiCatchment() {
    const nodesRaw = [
      ["J101","inlet",13.0382,80.2340,8.2,8.2,6.5,120,"A"],
      ["J102","inlet",13.0390,80.2355,7.8,7.8,6.2,110,"A"],
      ["J103","manhole",13.0398,80.2348,7.5,7.5,5.8,150,"A"],
      ["J104","junction",13.0405,80.2340,7.0,7.0,5.2,130,"A"],
      ["J105","junction",13.0412,80.2355,6.8,6.8,5.0,140,"B"],
      ["J106","manhole",13.0420,80.2342,6.5,6.5,4.8,160,"A"],
      ["J107","inlet",13.0375,80.2365,8.5,8.5,6.8,100,"B"],
      ["J108","junction",13.0388,80.2372,7.6,7.6,5.9,130,"B"],
      ["J109","manhole",13.0402,80.2368,7.2,7.2,5.5,145,"A"],
      ["J110","junction",13.0415,80.2375,6.6,6.6,4.9,155,"B"],
      ["J111","inlet",13.0425,80.2360,6.3,6.3,4.5,170,"A"],
      ["J112","storage",13.0430,80.2348,6.0,6.0,4.0,300,"A"],
      ["J113","junction",13.0435,80.2365,5.8,5.8,3.8,200,"B"],
      ["J114","manhole",13.0440,80.2355,5.5,5.5,3.5,250,"C"],
      ["J115","outfall",13.0448,80.2345,5.0,5.0,3.0,500,"A"],
    ];

    this.state.nodes = nodesRaw.map(([id,type,lat,lng,elev,rim,inv,cap,tier]) => ({
      id, type, lat, lng, elevation: elev, rim, invert: inv,
      capacity: cap, flow: 0, utilPct: 0, head: 0, depth: 0,
      surfaceExchange: 0, ttc: null, status: 'NORMAL', cause: null,
      tier, blockage: 0, downstreamImpact: 0,
    }));
    this.state.nodes.forEach(n => { this.nodeMap[n.id] = n; });

    const edgesRaw = [
      ["P01","pipe","J101","J103",85,600,0.4,0.013,120,"A"],
      ["P02","pipe","J102","J103",70,500,0.5,0.013,110,"A"],
      ["P03","pipe","J103","J104",90,750,0.3,0.013,150,"A"],
      ["P04","pipe","J104","J106",80,600,0.4,0.013,130,"A"],
      ["P05","pipe","J105","J106",75,700,0.35,0.013,140,"B"],
      ["P06","pipe","J106","J112",65,900,0.3,0.013,200,"A"],
      ["P07","pipe","J107","J108",95,500,0.5,0.013,100,"B"],
      ["P08","pipe","J108","J109",80,600,0.4,0.013,130,"B"],
      ["P09","pipe","J109","J110",70,700,0.35,0.013,145,"A"],
      ["P10","pipe","J110","J113",85,800,0.3,0.013,155,"B"],
      ["P11","culvert","J105","J110",90,500,0.25,0.015,100,"B"],
      ["P12","pipe","J111","J112",60,800,0.35,0.013,170,"A"],
      ["P13","pipe","J112","J114",75,1000,0.3,0.013,250,"A"],
      ["P14","pipe","J113","J114",65,900,0.3,0.013,200,"B"],
      ["E15","pipe","J114","J115",90,1200,0.25,0.013,350,"A"],
    ];

    this.state.edges = edgesRaw.map(([id,type,src,tgt,len,dia,slope,rough,cap,tier]) => ({
      id, type, source: src, target: tgt, length: len,
      diameter: dia, slope, roughness: rough, capacity: cap,
      flow: 0, utilPct: 0, velocity: 0, status: 'NORMAL', tier,
    }));

    const roadsRaw = [
      ["R01","Thyagaraya Rd - Seg A",[[80.2340,13.0382],[80.2348,13.0398]],"J101",8.2,80],
      ["R02","Thyagaraya Rd - Seg B",[[80.2348,13.0398],[80.2340,13.0405]],"J103",7.5,85],
      ["R03","Panagal Park Rd",[[80.2355,13.0390],[80.2348,13.0398]],"J102",7.8,75],
      ["R04","Usman Rd - Seg A",[[80.2340,13.0405],[80.2342,13.0420]],"J104",7.0,90],
      ["R05","Usman Rd - Seg B",[[80.2342,13.0420],[80.2348,13.0430]],"J106",6.5,85],
      ["R06","Bazullah Rd",[[80.2355,13.0405],[80.2355,13.0412]],"J105",6.8,70],
      ["R07","South Mada St",[[80.2365,13.0375],[80.2372,13.0388]],"J107",8.5,65],
      ["R08","Habibullah Rd",[[80.2372,13.0388],[80.2368,13.0402]],"J108",7.6,80],
      ["R09","North Usman Rd",[[80.2368,13.0402],[80.2375,13.0415]],"J109",7.2,85],
      ["R10","GN Chetty Rd",[[80.2375,13.0415],[80.2360,13.0425]],"J110",6.6,75],
      ["R11","Natesan St",[[80.2360,13.0425],[80.2348,13.0430]],"J111",6.3,70],
      ["R12","Canal Bank Rd",[[80.2348,13.0430],[80.2345,13.0448]],"J112",6.0,60],
    ];

    this.state.roads = roadsRaw.map(([id,name,path,nodeId,elev,imperv]) => ({
      id, name, path, nodeId, elevation: elev, imperviousness: imperv,
      depthCm: 0, depthLower: 0, depthUpper: 0, velocity: 0,
      prob10: 0, prob20: 0, prob30: 0, prob50: 0,
      ttf: null, drainUtilPct: 0, causeSummary: null,
      causeBreakdown: { rainfall: 0, terrain: 0, drainage: 0, imperviousness: 0, blockage: 0 },
      risk: 'SAFE', tier: 'B',
    }));
    this.state.roads.forEach(r => { this.roadMap[r.id] = r; });

    // Build road adjacency graph
    this.roadGraph = {};
    this.state.roads.forEach(r => {
      const s = r.path[0].join(',');
      const e = r.path[r.path.length-1].join(',');
      const d = haversine(r.path[0][1], r.path[0][0], r.path[r.path.length-1][1], r.path[r.path.length-1][0]);
      if (!this.roadGraph[s]) this.roadGraph[s] = [];
      if (!this.roadGraph[e]) this.roadGraph[e] = [];
      this.roadGraph[s].push({ to: e, dist: d, segId: r.id, coords: r.path[r.path.length-1] });
      this.roadGraph[e].push({ to: s, dist: d, segId: r.id, coords: r.path[0] });
    });
  }

  // ── Rainfall ──────────────────────────────────────────
  _computeRainfall(scenario, timeMin) {
    let base = 0, peak = 0;
    if (scenario === 'moderate_rain') { base = 8; peak = 35; }
    else if (scenario === 'heavy_rain') { base = 15; peak = 75; }
    else if (scenario === 'extreme_rain') { base = 25; peak = 130; }

    const sigma = 40, mu = 60;
    const current = peak > 0 ? base + (peak - base) * Math.exp(-0.5 * ((timeMin - mu) / sigma) ** 2) : 0;

    const timeline = [];
    for (let t = 0; t <= 180; t += 5) {
      timeline.push(peak > 0 ? +(base + (peak - base) * Math.exp(-0.5 * ((t - mu) / sigma) ** 2)).toFixed(1) : 0);
    }

    let cumulative = 0;
    for (let t = 0; t <= timeMin; t += 5) {
      if (peak > 0) cumulative += (base + (peak - base) * Math.exp(-0.5 * ((t - mu) / sigma) ** 2)) * (5/60);
    }

    const spread = Math.max(0.15, 0.05 * (timeMin / 30));
    const forecast30 = peak > 0 ? base + (peak - base) * Math.exp(-0.5 * (((timeMin + 30) - mu) / sigma) ** 2) : 0;

    const cells = [];
    [-0.003, 0, 0.003].forEach(latOff => {
      [-0.003, 0, 0.003].forEach(lngOff => {
        const sv = 1 + 0.1 * Math.sin(latOff * 1000) * Math.cos(lngOff * 1000);
        cells.push({
          lat: 13.041 + latOff, lng: 80.235 + lngOff,
          intensity: +(current * sv).toFixed(1),
          lower: +(current * sv * (1-spread)).toFixed(1),
          upper: +(current * sv * (1+spread)).toFixed(1),
          cumulative: +(cumulative * sv).toFixed(1),
        });
      });
    });

    return {
      current: +current.toFixed(1),
      forecast: +forecast30.toFixed(1),
      peak: +peak.toFixed(1),
      cumulative: +cumulative.toFixed(1),
      probHeavy: current > 10 ? +Math.min(95, (current/30)*100).toFixed(1) : 0,
      probExtreme: current > 30 ? +Math.min(95, ((current-30)/60)*100).toFixed(1) : 0,
      leadTime: timeMin,
      confidence: +Math.max(40, 95 - timeMin * 0.3).toFixed(1),
      dataMode: 'DEMO',
      method: 'Optical-flow extrapolation + ML refinement (DEMO)',
      cells, timeline,
    };
  }

  // ── Hydraulics ────────────────────────────────────────
  _runHydraulics(rainfall, timeMin, blockages) {
    const tf = Math.min(timeMin / 90, 1);
    const rc = 0.85;

    // Reset
    this.state.nodes.forEach(n => { n.flow = 0; });
    this.state.edges.forEach(e => { e.flow = 0; });

    // Phase 1: inflow
    this.state.nodes.forEach(n => {
      const inflow = rc * (rainfall / 3600) * 5000 * tf;
      const blockage = (blockages[n.id] || 0) / 100;
      n.blockage = blockages[n.id] || 0;
      const effCap = n.capacity * (1 - blockage);
      n.flow = +inflow.toFixed(1);
      n.utilPct = effCap > 0 ? +((inflow / effCap) * 100).toFixed(1) : 200;
    });

    // Phase 2: propagate downstream
    const downstream = {};
    this.state.edges.forEach(e => {
      if (!downstream[e.source]) downstream[e.source] = [];
      downstream[e.source].push(e);
    });

    const sorted = [...this.state.nodes].sort((a, b) => b.elevation - a.elevation);
    sorted.forEach(node => {
      const outs = downstream[node.id] || [];
      if (!outs.length) return;
      outs.forEach(edge => {
        const blockage = (blockages[edge.source] || 0) / 100;
        const effCap = edge.capacity * (1 - blockage * 0.5);
        const pipeFlow = Math.min(node.flow / outs.length, effCap);
        edge.flow = +pipeFlow.toFixed(1);
        edge.utilPct = +((pipeFlow / Math.max(effCap, 1)) * 100).toFixed(1);
        edge.velocity = edge.diameter > 0 ? +(pipeFlow / (Math.PI * (edge.diameter/2000)**2 * 1000)).toFixed(2) : 0;
        edge.status = edge.utilPct > 100 ? 'SURCHARGE' : edge.utilPct > 80 ? 'WARNING' : 'NORMAL';

        const tgt = this.nodeMap[edge.target];
        if (tgt) {
          tgt.flow = +(tgt.flow + pipeFlow).toFixed(1);
          const bTgt = (blockages[tgt.id] || 0) / 100;
          const ecTgt = tgt.capacity * (1 - bTgt);
          tgt.utilPct = ecTgt > 0 ? +((tgt.flow / ecTgt) * 100).toFixed(1) : 200;
        }
      });
    });

    // Phase 3: node status
    this.state.nodes.forEach(node => {
      const blockage = (blockages[node.id] || 0) / 100;
      const effCap = node.capacity * (1 - blockage);
      if (node.utilPct > 120) {
        node.status = 'SURCHARGE';
        node.head = node.invert + (node.utilPct - 100) * 0.02;
        node.surfaceExchange = +(-(node.flow - effCap)).toFixed(1);
        node.depth = +((node.utilPct - 100) * 0.015).toFixed(2);
        node.cause = `Capacity exceeded (${node.utilPct.toFixed(0)}%)` + (node.blockage > 0 ? ` — ${node.blockage}% blocked` : '');
      } else if (node.utilPct > 100) {
        node.status = 'BACKFLOW';
        node.surfaceExchange = +(-(node.flow - effCap) * 0.5).toFixed(1);
        node.depth = +((node.utilPct - 100) * 0.008).toFixed(2);
        node.cause = 'Approaching surcharge';
      } else if (node.utilPct > 75) {
        node.status = 'WARNING';
        node.surfaceExchange = +(node.flow * 0.3).toFixed(1);
        node.depth = 0;
        node.cause = 'High incoming flow';
      } else {
        node.status = 'NORMAL';
        node.surfaceExchange = +(node.flow * 0.8).toFixed(1);
        node.depth = 0;
        node.cause = null;
      }

      // TTCritical
      if (node.utilPct >= 100) node.ttc = 0;
      else if (node.utilPct > 50 && rainfall > 10) {
        const rate = Math.max(node.utilPct / Math.max(timeMin, 5), 0.5);
        node.ttc = Math.max(1, Math.round((100 - node.utilPct) / rate));
      } else node.ttc = null;
    });

    // Count reachable downstream nodes for each node via BFS.
    // O(n * (n + e)) over the network — acceptable for the 15-node pilot catchment.
    this.state.nodes.forEach(node => {
      let count = 0;
      const visited = new Set();
      const queue = [node.id];
      while (queue.length) {
        const curr = queue.shift();
        if (visited.has(curr)) continue;
        visited.add(curr);
        this.state.edges.forEach(e => {
          if (e.source === curr && !visited.has(e.target)) {
            queue.push(e.target);
            count++;
          }
        });
      }
      node.downstreamImpact = count;
    });
  }

  // ── Surface-Drainage Coupling ─────────────────────────
  _coupleSurfaceDrainage(rainfall, timeMin) {
    const tf = Math.min(timeMin / 90, 1);
    this.state.roads.forEach(road => {
      const node = this.nodeMap[road.nodeId];
      if (!node) return;

      const surfaceRunoff = (rainfall / 100) * (road.imperviousness / 100) * tf * 8;
      let drainageBackflow = 0;
      if (node.surfaceExchange < 0) {
        drainageBackflow = Math.abs(node.surfaceExchange) * 0.15 * tf;
      }
      const terrainFactor = Math.max(0, (9 - road.elevation) / 3);
      const terrainPonding = surfaceRunoff * terrainFactor * 0.3;

      const total = surfaceRunoff + drainageBackflow + terrainPonding;
      road.depthCm = +total.toFixed(1);
      const spread = 0.2 + 0.1 * (timeMin / 60);
      road.depthLower = +(total * (1 - spread)).toFixed(1);
      road.depthUpper = +(total * (1 + spread)).toFixed(1);

      const slope = Math.max(0.001, (road.elevation - 5) / 500);
      road.velocity = total > 5 ? +(Math.sqrt(slope) * Math.min(total/100, 0.5) * 3).toFixed(2) : 0;

      road.drainUtilPct = +node.utilPct.toFixed(1);

      // Cause breakdown
      const totalCause = Math.max(surfaceRunoff + drainageBackflow + terrainPonding, 0.01);
      road.causeBreakdown = {
        rainfall: +(surfaceRunoff / totalCause * 100).toFixed(1),
        terrain: +(terrainPonding / totalCause * 100).toFixed(1),
        drainage: +(drainageBackflow / totalCause * 100).toFixed(1),
        imperviousness: +(road.imperviousness * 0.3).toFixed(1),
        blockage: +(node.blockage * 0.5).toFixed(1),
      };

      // Cause summary
      const causes = [];
      if (drainageBackflow > surfaceRunoff * 0.5) causes.push('Drainage constraint (surcharge/backflow)');
      if (surfaceRunoff > 5) causes.push('High rainfall intensity');
      if (terrainPonding > 3) causes.push('Low-lying terrain');
      if (node.blockage > 20) causes.push(`Blockage at ${node.id} (${node.blockage}%)`);
      road.causeSummary = causes.length ? causes.join('; ') : null;

      // Risk
      if (total > 30) road.risk = 'CRITICAL';
      else if (total > 20) road.risk = 'HIGH';
      else if (total > 10) road.risk = 'CAUTION';
      else road.risk = 'SAFE';

      // Probabilities
      [['prob10',10],['prob20',20],['prob30',30],['prob50',50]].forEach(([key, th]) => {
        if (total <= 0) { road[key] = 0; return; }
        const z = (total - th) / Math.max(total * spread, 1);
        road[key] = +Math.min(98, Math.max(1, 50 + z * 30)).toFixed(1);
      });

      // TTF
      if (total >= 15) road.ttf = 0;
      else if (rainfall > 10 && total > 3) {
        const rate = total / Math.max(timeMin, 5);
        road.ttf = Math.max(1, Math.round((15 - total) / Math.max(rate, 0.1)));
      } else road.ttf = null;
    });
  }

  // ── Alerts ────────────────────────────────────────────
  _generateAlerts(timeMin) {
    const alerts = [];
    let aid = 0;
    this.state.nodes.forEach(n => {
      if (n.status === 'SURCHARGE' || n.status === 'BACKFLOW') {
        aid++;
        alerts.push({
          id: `ALT-${String(aid).padStart(3,'0')}`,
          severity: n.status === 'SURCHARGE' ? 'CRITICAL' : 'WARNING',
          title: `${n.status === 'SURCHARGE' ? 'CRITICAL' : 'WARNING'}: Node ${n.id}`,
          message: `${n.id} (${n.type}) at ${n.utilPct.toFixed(0)}% utilisation. ${n.cause || ''}`,
          time: timeMin, nodeId: n.id, segId: null, active: true,
        });
      }
    });
    this.state.roads.forEach(r => {
      if (r.risk === 'CRITICAL' || r.risk === 'HIGH') {
        aid++;
        const ttf = r.ttf != null && r.ttf > 0 ? ` in ${r.ttf} min` : ' NOW';
        alerts.push({
          id: `ALT-${String(aid).padStart(3,'0')}`,
          severity: r.risk === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          title: `FLOOD ${r.risk === 'CRITICAL' ? 'ALERT' : 'WARNING'}: ${r.name}`,
          message: `Predicted depth ${r.depthCm.toFixed(0)} cm${ttf}. ${r.causeSummary || ''}`,
          time: timeMin, nodeId: null, segId: r.id, active: true,
        });
      }
    });
    return alerts.slice(0, 20);
  }

  // ── Main Step ─────────────────────────────────────────
  runStep(scenario, timeMin, blockages = {}) {
    this.state.scenario = scenario;
    this.state.timeMin = timeMin;

    const nowcast = this._computeRainfall(scenario, timeMin);
    this.state.nowcast = nowcast;

    this._runHydraulics(nowcast.current, timeMin, blockages);
    this._coupleSurfaceDrainage(nowcast.current, timeMin);

    this.state.alerts = this._generateAlerts(timeMin);
    this.state.criticalNodes = this.state.nodes
      .filter(n => n.utilPct > 60)
      .sort((a, b) => b.utilPct - a.utilPct || b.downstreamImpact - a.downstreamImpact)
      .map(n => n.id);

    return { ...this.state };
  }

  // ── What-If ───────────────────────────────────────────
  runWhatIf(nodeId, blockagePct) {
    // 1. Run Baseline (0% blockage) to ensure we always compare against normal
    this.runStep(this.state.scenario, this.state.timeMin, {});
    
    // Capture baseline state
    const beforeRoads = {};
    this.state.roads.forEach(r => {
      beforeRoads[r.id] = { depth: r.depthCm, risk: r.risk, ttf: r.ttf };
    });
    const bNode = this.nodeMap[nodeId];
    const beforeUtil = bNode ? bNode.utilPct : 0;

    // 2. Run with blockage
    const blockages = { [nodeId]: blockagePct };
    this.runStep(this.state.scenario, this.state.timeMin, blockages);

    const aNode = this.nodeMap[nodeId];
    const primaryRoad = this.state.roads.find(r => r.nodeId === nodeId);
    const affected = this.state.roads.filter(r => {
      const prev = beforeRoads[r.id];
      return prev && r.depthCm > prev.depth + 2;
    }).map(r => ({ id: r.id, name: r.name, beforeDepth: beforeRoads[r.id].depth, afterDepth: r.depthCm }));

    return {
      nodeId, blockagePct,
      beforeDepth: beforeRoads[primaryRoad?.id]?.depth || 0,
      afterDepth: primaryRoad?.depthCm || 0,
      beforeUtil, afterUtil: aNode?.utilPct || 0,
      beforeRisk: beforeRoads[primaryRoad?.id]?.risk || 'SAFE',
      afterRisk: primaryRoad?.risk || 'SAFE',
      beforeTTF: beforeRoads[primaryRoad?.id]?.ttf,
      afterTTF: primaryRoad?.ttf,
      affectedRoads: affected,
      affectedNodes: this.state.nodes.filter(n => n.utilPct > 80).map(n => n.id),
    };
  }

  // ── Routing ───────────────────────────────────────────
  computeRoute(originLat, originLng, destLat, destLng, vehicleType = 'car') {
    const threshold = VEHICLE_THRESHOLDS[vehicleType] || 25;
    const speed = VEHICLE_SPEEDS[vehicleType] || 30;

    const origin = this._nearestNode(originLat, originLng);
    const dest = this._nearestNode(destLat, destLng);
    if (!origin || !dest) {
      return { routeId: 'none', vehicle: vehicleType, path: [], distance: 0, eta: 0, risk: 'CRITICAL', avoided: [], reasons: [], safety: 0, safe: false };
    }

    const roadDepths = {};
    const roadRisks = {};
    this.state.roads.forEach(r => { roadDepths[r.id] = r.depthCm; roadRisks[r.id] = r.risk; });

    const avoided = [];
    const reasons = [];
    const dist = { [origin]: 0 };
    const prev = {};
    const prevSeg = {};
    const visited = new Set();

    // Min-heap (simple array-based)
    const pq = [[0, origin]];

    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === dest) break;

      (this.roadGraph[u] || []).forEach(({ to, dist: baseDist, segId }) => {
        if (visited.has(to)) return;
        const depth = roadDepths[segId] || 0;
        if (depth > threshold) {
          if (!avoided.includes(segId)) {
            avoided.push(segId);
            const road = this.roadMap[segId];
            reasons.push(`${road?.name || segId}: ${depth.toFixed(0)}cm exceeds ${threshold}cm for ${vehicleType}`);
          }
          return;
        }
        let penalty = 1;
        if (depth > threshold * 0.5) penalty = 2;
        else if (depth > threshold * 0.3) penalty = 1.3;
        const cost = baseDist * penalty;
        const newDist = d + cost;
        if (newDist < (dist[to] ?? Infinity)) {
          dist[to] = newDist;
          prev[to] = u;
          prevSeg[to] = segId;
          pq.push([newDist, to]);
        }
      });
    }

    if (!(dest in prev) && origin !== dest) {
      return { routeId: 'fail', vehicle: vehicleType, path: [], distance: 0, eta: 0, risk: 'CRITICAL', avoided, reasons, safety: 0, safe: false };
    }

    const path = [];
    let curr = dest;
    let totalDist = 0;
    let maxRisk = 'SAFE';
    const riskOrder = { SAFE: 0, CAUTION: 1, HIGH: 2, CRITICAL: 3 };

    while (curr) {
      const seg = prevSeg[curr];
      const risk = roadRisks[seg] || 'SAFE';
      const [lng, lat] = curr.split(',').map(Number);
      path.push({ lat, lng, segId: seg, risk });
      if (riskOrder[risk] > riskOrder[maxRisk]) maxRisk = risk;
      const p = prev[curr];
      if (p) {
        const [pLng, pLat] = p.split(',').map(Number);
        totalDist += haversine(lat, lng, pLat, pLng);
      }
      curr = prev[curr];
    }
    path.reverse();

    const eta = speed > 0 ? (totalDist / speed) * 60 : 0;

    this._routeSequence += 1;
    return {
      routeId: `route-${this._routeSequence}`,
      vehicle: vehicleType,
      path,
      distance: +totalDist.toFixed(2),
      eta: +eta.toFixed(1),
      risk: maxRisk,
      avoided,
      reasons,
      safety: +Math.max(0, 100 - avoided.length * 15 - (maxRisk !== 'SAFE' ? 10 : 0)).toFixed(1),
      safe: maxRisk === 'SAFE' || maxRisk === 'CAUTION',
    };
  }

  _nearestNode(lat, lng) {
    let best = null, bestDist = Infinity;
    Object.keys(this.roadGraph).forEach(key => {
      const [kLng, kLat] = key.split(',').map(Number);
      const d = haversine(lat, lng, kLat, kLng);
      if (d < bestDist) { bestDist = d; best = key; }
    });
    return best;
  }
}

export const engine = new SimulationEngine();
