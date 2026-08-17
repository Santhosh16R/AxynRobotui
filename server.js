const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/robot' });

// ==========================================
// ROBOT SIMULATION & NAVIGATION STATE
// ==========================================
let activeMap = config.maps[0];

const robotState = {
  id: config.robot.id,
  name: config.robot.name,
  model: config.robot.model,
  x: activeMap.dock.x,
  y: activeMap.dock.y,
  theta: activeMap.dock.theta, // Radians (0 = East, PI/2 = South, etc.)
  linearVelocity: 0,
  angularVelocity: 0,
  targetLinearVelocity: 0,
  targetAngularVelocity: 0,
  battery: config.robot.initialBattery,
  batteryVoltage: 24.2,
  isCharging: true,
  state: 'DOCKED', // 'DOCKED', 'IDLE', 'PLANNING', 'NAVIGATING', 'PAUSED', 'ARRIVED', 'ESTOP', 'MANUAL_TELEOP'
  target: null, // { x, y, name, id }
  path: [], // Array of [x, y] coordinates
  pathIndex: 0,
  distanceRemaining: 0,
  estimatedTimeSec: 0,
  lidarScan: [], // 360 degree range measurements
  estopActive: false,
  logs: [],
  mapId: activeMap.id
};

function addLog(message, level = 'info') {
  const logEntry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toLocaleTimeString(),
    message,
    level
  };
  robotState.logs.unshift(logEntry);
  if (robotState.logs.length > 100) robotState.logs.pop();
  broadcast({ type: 'log', log: logEntry });
}

addLog(`Axyn Concierge Server initialized. Current Map: ${activeMap.name}`);

// ==========================================
// A* PATHFINDING & OBSTACLE GRID
// ==========================================
class GridMap {
  constructor(mapData, resolution = 0.5) {
    this.resolution = resolution;
    this.widthMeters = mapData.dimensions.width;
    this.heightMeters = mapData.dimensions.height;
    this.cols = Math.ceil(this.widthMeters / resolution);
    this.rows = Math.ceil(this.heightMeters / resolution);
    this.grid = new Uint8Array(this.cols * this.rows); // 0 = free, 1 = obstacle
    this.obstacles = mapData.obstacles || [];
    this.safetyMargin = (config.robot.radius || 0.35) + 0.2; // clearance

    this.rasterizeObstacles();
  }

  rasterizeObstacles() {
    this.grid.fill(0);
    for (const obs of this.obstacles) {
      const minX = Math.max(0, obs.x - this.safetyMargin);
      const maxX = Math.min(this.widthMeters, obs.x + obs.w + this.safetyMargin);
      const minY = Math.max(0, obs.y - this.safetyMargin);
      const maxY = Math.min(this.heightMeters, obs.y + obs.h + this.safetyMargin);

      const minCol = Math.floor(minX / this.resolution);
      const maxCol = Math.min(this.cols - 1, Math.floor(maxX / this.resolution));
      const minRow = Math.floor(minY / this.resolution);
      const maxRow = Math.min(this.rows - 1, Math.floor(maxY / this.resolution));

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          this.grid[r * this.cols + c] = 1;
        }
      }
    }
  }

  isFree(x, y) {
    if (x < 0 || x >= this.widthMeters || y < 0 || y >= this.heightMeters) return false;
    const col = Math.floor(x / this.resolution);
    const row = Math.floor(y / this.resolution);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    return this.grid[row * this.cols + col] === 0;
  }

  findPath(startX, startY, goalX, goalY) {
    if (isNaN(startX) || isNaN(startY) || isNaN(goalX) || isNaN(goalY)) {
      return null;
    }

    const startCol = Math.max(0, Math.min(this.cols - 1, Math.floor(startX / this.resolution)));
    const startRow = Math.max(0, Math.min(this.rows - 1, Math.floor(startY / this.resolution)));
    let goalCol = Math.max(0, Math.min(this.cols - 1, Math.floor(goalX / this.resolution)));
    let goalRow = Math.max(0, Math.min(this.rows - 1, Math.floor(goalY / this.resolution)));

    // If goal is inside obstacle, find nearest free cell
    if (this.grid[goalRow * this.cols + goalCol] === 1) {
      let found = false;
      for (let radius = 1; radius <= 10 && !found; radius++) {
        for (let dr = -radius; dr <= radius && !found; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = goalRow + dr;
            const nc = goalCol + dc;
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
              if (this.grid[nr * this.cols + nc] === 0) {
                goalCol = nc;
                goalRow = nr;
                found = true;
                break;
              }
            }
          }
        }
      }
    }

    const startKey = `${startCol},${startRow}`;
    const goalKey = `${goalCol},${goalRow}`;

    if (startKey === goalKey) {
      return [[startX, startY], [goalX, goalY]];
    }

    const openSet = new Map();
    const closedSet = new Set();
    const cameFrom = new Map();

    const gScore = new Map();
    const fScore = new Map();

    const heuristic = (c1, r1, c2, r2) => Math.hypot(c1 - c2, r1 - r2);

    openSet.set(startKey, { col: startCol, row: startRow, f: heuristic(startCol, startRow, goalCol, goalRow) });
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(startCol, startRow, goalCol, goalRow));

    const neighbors = [
      [0, 1, 1], [0, -1, 1], [1, 0, 1], [-1, 0, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
    ];

    let iterations = 0;
    const maxIterations = 8000;

    while (openSet.size > 0 && iterations++ < maxIterations) {
      // Get node with lowest fScore
      let currentKey = null;
      let lowestF = Infinity;
      for (const [key, node] of openSet.entries()) {
        if (node && node.f < lowestF) {
          lowestF = node.f;
          currentKey = key;
        }
      }

      if (!currentKey) break;
      const current = openSet.get(currentKey);
      if (!current) break;

      if (current.col === goalCol && current.row === goalRow) {
        // Reconstruct path
        const path = [];
        let curr = currentKey;
        while (curr) {
          const [c, r] = curr.split(',').map(Number);
          path.push([c * this.resolution + this.resolution / 2, r * this.resolution + this.resolution / 2]);
          curr = cameFrom.get(curr);
        }
        path.reverse();

        // Refine endpoints
        path[0] = [startX, startY];
        path[path.length - 1] = [goalX, goalY];

        // Smooth path using line of sight
        return this.smoothPath(path);
      }

      openSet.delete(currentKey);
      closedSet.add(currentKey);

      for (const [dc, dr, cost] of neighbors) {
        const nextCol = current.col + dc;
        const nextRow = current.row + dr;

        if (nextCol < 0 || nextCol >= this.cols || nextRow < 0 || nextRow >= this.rows) continue;
        if (this.grid[nextRow * this.cols + nextCol] === 1) continue;

        const nextKey = `${nextCol},${nextRow}`;
        if (closedSet.has(nextKey)) continue;

        const tentativeG = (gScore.get(currentKey) || 0) + cost;
        const currentG = gScore.has(nextKey) ? gScore.get(nextKey) : Infinity;

        if (tentativeG < currentG) {
          cameFrom.set(nextKey, currentKey);
          gScore.set(nextKey, tentativeG);
          const h = heuristic(nextCol, nextRow, goalCol, goalRow);
          const f = tentativeG + h;
          fScore.set(nextKey, f);
          openSet.set(nextKey, { col: nextCol, row: nextRow, f });
        }
      }
    }

    // Direct fallback straight path if blocked or reached limit
    return [[startX, startY], [goalX, goalY]];
  }

  hasLineOfSight(p1, p2) {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(dist / (this.resolution * 0.4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (!this.isFree(x, y)) return false;
    }
    return true;
  }

  smoothPath(rawPath) {
    if (rawPath.length <= 2) return rawPath;
    const smoothed = [rawPath[0]];
    let currentIndex = 0;

    while (currentIndex < rawPath.length - 1) {
      let nextIndex = rawPath.length - 1;
      while (nextIndex > currentIndex + 1) {
        if (this.hasLineOfSight(rawPath[currentIndex], rawPath[nextIndex])) {
          break;
        }
        nextIndex--;
      }
      smoothed.push(rawPath[nextIndex]);
      currentIndex = nextIndex;
    }
    return smoothed;
  }
}

let navGrid = new GridMap(activeMap);

// ==========================================
// SIMULATED LIDAR SCANNER (360 DEGREES)
// ==========================================
function computeLidarScan(x, y) {
  const rayCount = config.robot.lidarRayCount || 72;
  const maxRange = config.robot.lidarRange || 12.0;
  const scan = [];

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let minDistance = maxRange;

    // Check intersection with all obstacles and boundary walls
    for (const obs of activeMap.obstacles) {
      const left = obs.x;
      const right = obs.x + obs.w;
      const top = obs.y;
      const bottom = obs.y + obs.h;

      // Ray-box intersection (AABB)
      let tmin = 0;
      let tmax = maxRange;

      if (cosA !== 0) {
        const t1 = (left - x) / cosA;
        const t2 = (right - x) / cosA;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (x < left || x > right) {
        continue;
      }

      if (sinA !== 0) {
        const t1 = (top - y) / sinA;
        const t2 = (bottom - y) / sinA;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (y < top || y > bottom) {
        continue;
      }

      if (tmax >= tmin && tmin >= 0 && tmin < minDistance) {
        minDistance = tmin;
      }
    }

    // Add tiny sensor noise (+-1.5cm)
    const noisyDist = Math.max(0.2, minDistance + (Math.random() - 0.5) * 0.03);
    scan.push({
      angle,
      distance: Math.min(maxRange, noisyDist)
    });
  }

  return scan;
}

// ==========================================
// PHYSICS & KINEMATICS LOOP (20 Hz)
// ==========================================
const DT = (config.server.telemetryIntervalMs || 50) / 1000;

setInterval(() => {
  // 1. LIDAR Range Scan
  robotState.lidarScan = computeLidarScan(robotState.x, robotState.y);

  // 2. Battery Dynamics
  if (robotState.isCharging) {
    if (robotState.battery < 100) {
      robotState.battery = Math.min(100, robotState.battery + (config.robot.chargeRatePerSecond || 0.2) * DT);
      robotState.batteryVoltage = 24.0 + (robotState.battery / 100) * 1.8;
    }
  }

  // 3. ESTOP Handler
  if (robotState.estopActive) {
    robotState.linearVelocity = 0;
    robotState.angularVelocity = 0;
    robotState.state = 'ESTOP';
    broadcastTelemetry();
    return;
  }

  // Helper to test if position physically collides with obstacle bounding box
  function isPhysicalCollision(x, y, radius = 0.35) {
    if (x - radius < 0 || x + radius > activeMap.dimensions.width || y - radius < 0 || y + radius > activeMap.dimensions.height) {
      return true;
    }
    for (const obs of activeMap.obstacles) {
      // Circle vs AABB collision
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
      const distX = x - closestX;
      const distY = y - closestY;
      if ((distX * distX + distY * distY) < (radius * radius)) {
        return true;
      }
    }
    return false;
  }

  // 4. Manual Teleoperation Mode
  if (robotState.state === 'MANUAL_TELEOP') {
    robotState.isCharging = false;
    robotState.linearVelocity = robotState.targetLinearVelocity;
    robotState.angularVelocity = robotState.targetAngularVelocity;

    robotState.theta += robotState.angularVelocity * DT;
    while (robotState.theta > Math.PI) robotState.theta -= Math.PI * 2;
    while (robotState.theta < -Math.PI) robotState.theta += Math.PI * 2;

    const nextX = robotState.x + Math.cos(robotState.theta) * robotState.linearVelocity * DT;
    const nextY = robotState.y + Math.sin(robotState.theta) * robotState.linearVelocity * DT;

    if (!isPhysicalCollision(nextX, nextY, config.robot.radius || 0.35)) {
      robotState.x = nextX;
      robotState.y = nextY;
      robotState.battery = Math.max(1, robotState.battery - (config.robot.dischargeRatePerMeter || 0.05) * Math.abs(robotState.linearVelocity) * DT);
    }
    broadcastTelemetry();
    return;
  }

  // 5. Autonomous Navigation Path Traversal
  if (robotState.state === 'NAVIGATING' && robotState.path && robotState.path.length > 0) {
    robotState.isCharging = false;

    // Check if robot has reached final destination
    const finalTarget = robotState.path[robotState.path.length - 1];
    const distToFinal = Math.hypot(finalTarget[0] - robotState.x, finalTarget[1] - robotState.y);

    if (distToFinal < 0.35) {
      completeNavigation();
      broadcastTelemetry();
      return;
    }

    // Advance pathIndex if close to current waypoint or past it
    const prevIndex = robotState.pathIndex;
    while (robotState.pathIndex < robotState.path.length - 1) {
      const wp = robotState.path[robotState.pathIndex];
      const distWp = Math.hypot(wp[0] - robotState.x, wp[1] - robotState.y);
      if (distWp < 0.75) {
        robotState.pathIndex++;
      } else {
        break;
      }
    }
    if (robotState.pathIndex !== prevIndex) {
      addLog(`Reached node ${robotState.pathIndex}/${robotState.path.length}. Heading to next corridor waypoint...`, 'info');
    }

    const currentWaypoint = robotState.path[robotState.pathIndex];
    const dx = currentWaypoint[0] - robotState.x;
    const dy = currentWaypoint[1] - robotState.y;
    const distToWaypoint = Math.hypot(dx, dy);

    // Calculate total remaining distance across remaining path
    let totalDistRemaining = distToWaypoint;
    for (let i = robotState.pathIndex; i < robotState.path.length - 1; i++) {
      totalDistRemaining += Math.hypot(
        robotState.path[i + 1][0] - robotState.path[i][0],
        robotState.path[i + 1][1] - robotState.path[i][1]
      );
    }
    robotState.distanceRemaining = parseFloat(totalDistRemaining.toFixed(2));
    robotState.estimatedTimeSec = Math.max(1, Math.ceil(totalDistRemaining / (config.robot.maxLinearSpeed * 0.8)));

    // Target heading towards lookahead waypoint
    const targetTheta = Math.atan2(dy, dx);
    let angleDiff = targetTheta - robotState.theta;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Smooth angular steering
    const turnSpeed = Math.min(config.robot.maxAngularSpeed, Math.max(-config.robot.maxAngularSpeed, angleDiff * 4.0));
    robotState.angularVelocity = turnSpeed;
    robotState.theta += turnSpeed * DT;

    while (robotState.theta > Math.PI) robotState.theta -= Math.PI * 2;
    while (robotState.theta < -Math.PI) robotState.theta += Math.PI * 2;

    // Calculate linear speed
    const angleAlignment = Math.max(0, Math.cos(angleDiff)); // 1 when facing waypoint, 0 when orthogonal
    const desiredSpeed = config.robot.maxLinearSpeed * Math.max(0.2, angleAlignment);
    robotState.linearVelocity = desiredSpeed;

    const nextX = robotState.x + Math.cos(robotState.theta) * robotState.linearVelocity * DT;
    const nextY = robotState.y + Math.sin(robotState.theta) * robotState.linearVelocity * DT;

    // Check collision against physical boundaries
    if (!isPhysicalCollision(nextX, nextY, config.robot.radius || 0.35)) {
      robotState.x = nextX;
      robotState.y = nextY;
      robotState.battery = Math.max(1, robotState.battery - (config.robot.dischargeRatePerMeter || 0.05) * robotState.linearVelocity * DT);
      robotState.batteryVoltage = 23.0 + (robotState.battery / 100) * 2.2;
    } else {
      // If direct step collides, slide along obstacle or advance to next waypoint
      if (robotState.pathIndex < robotState.path.length - 1) {
        robotState.pathIndex++;
      }
    }
  } else if (robotState.state === 'IDLE' || robotState.state === 'DOCKED' || robotState.state === 'ARRIVED') {
    robotState.linearVelocity = 0;
    robotState.angularVelocity = 0;
  }

  broadcastTelemetry();
}, config.server.telemetryIntervalMs || 50);

function completeNavigation() {
  robotState.state = 'ARRIVED';
  robotState.linearVelocity = 0;
  robotState.angularVelocity = 0;
  robotState.distanceRemaining = 0;
  robotState.estimatedTimeSec = 0;

  // Align with final target heading if specified
  if (robotState.target && typeof robotState.target.theta === 'number') {
    robotState.theta = robotState.target.theta;
  }

  // Check if arrived at charging dock
  const dockDist = Math.hypot(robotState.x - activeMap.dock.x, robotState.y - activeMap.dock.y);
  if (dockDist < 0.8) {
    robotState.isCharging = true;
    robotState.state = 'DOCKED';
    addLog(`Arrived at ${activeMap.dock.name}. Induction charging active.`, 'success');
  } else {
    addLog(`Arrived at destination: ${robotState.target ? robotState.target.name : 'Target point'}.`, 'success');
  }
}

// ==========================================
// WEBSOCKET BROADCASTING
// ==========================================
function broadcast(messageObj) {
  const jsonStr = JSON.stringify(messageObj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  });
}

function broadcastTelemetry() {
  broadcast({
    type: 'telemetry',
    robot: {
      id: robotState.id,
      name: robotState.name,
      model: robotState.model,
      x: parseFloat(robotState.x.toFixed(3)),
      y: parseFloat(robotState.y.toFixed(3)),
      theta: parseFloat(robotState.theta.toFixed(3)),
      linearVelocity: parseFloat(robotState.linearVelocity.toFixed(2)),
      angularVelocity: parseFloat(robotState.angularVelocity.toFixed(2)),
      battery: Math.round(robotState.battery),
      batteryVoltage: parseFloat(robotState.batteryVoltage.toFixed(1)),
      isCharging: robotState.isCharging,
      state: robotState.state,
      target: robotState.target,
      path: robotState.path,
      pathIndex: robotState.pathIndex,
      distanceRemaining: robotState.distanceRemaining,
      estimatedTimeSec: robotState.estimatedTimeSec,
      lidarScan: robotState.lidarScan,
      estopActive: robotState.estopActive,
      mapId: robotState.mapId
    }
  });
}

wss.on('connection', (ws) => {
  // Send initial state & map info on connect
  ws.send(JSON.stringify({
    type: 'init',
    config: {
      robot: config.robot,
      maps: config.maps,
      activeMap: activeMap
    },
    robot: robotState,
    logs: robotState.logs.slice(0, 20)
  }));

  ws.on('message', (msg) => {
    try {
      const payload = JSON.parse(msg);
      handleClientCommand(payload);
    } catch (e) {
      console.error('Invalid WS message:', e);
    }
  });
});

// ==========================================
// NAVIGATION DISPATCHER & COMMAND HANDLERS
// ==========================================
function navigateToTarget(target) {
  if (robotState.estopActive) {
    addLog('Cannot navigate: Emergency Stop (E-STOP) is engaged!', 'warn');
    return { success: false, error: 'E-STOP engaged' };
  }

  if (target && target.target) {
    target = target.target;
  }

  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
    addLog('Invalid destination coordinates received.', 'error');
    return { success: false, error: 'Invalid coordinates' };
  }

  const startX = robotState.x;
  const startY = robotState.y;
  const targetX = target.x;
  const targetY = target.y;

  // Validate bounds
  if (targetX < 0 || targetX > activeMap.dimensions.width || targetY < 0 || targetY > activeMap.dimensions.height) {
    addLog(`Target point (${targetX}, ${targetY}) is outside map boundaries.`, 'error');
    return { success: false, error: 'Target out of bounds' };
  }

  // Compute A* Path
  robotState.state = 'PLANNING';
  broadcastTelemetry();

  const computedPath = navGrid.findPath(startX, startY, targetX, targetY);

  if (!computedPath || computedPath.length === 0) {
    addLog(`Unable to find a valid obstacle-free path to destination!`, 'error');
    robotState.state = 'IDLE';
    broadcastTelemetry();
    return { success: false, error: 'No path found' };
  }

  robotState.target = {
    id: target.id || 'custom-point',
    name: target.name || `Point (${targetX.toFixed(1)}m, ${targetY.toFixed(1)}m)`,
    x: targetX,
    y: targetY,
    theta: target.theta !== undefined ? target.theta : Math.atan2(targetY - startY, targetX - startX)
  };
  robotState.path = computedPath;
  robotState.pathIndex = 0;
  robotState.state = 'NAVIGATING';
  robotState.isCharging = false;

  addLog(`Navigating to ${robotState.target.name}. Path length: ${computedPath.length} nodes.`, 'info');
  broadcastTelemetry();
  return { success: true, target: robotState.target, path: computedPath };
}

function handleClientCommand(cmd) {
  switch (cmd.action) {
    case 'navigate':
      navigateToTarget(cmd.target);
      break;

    case 'estop':
      robotState.estopActive = !robotState.estopActive;
      if (robotState.estopActive) {
        robotState.state = 'ESTOP';
        robotState.linearVelocity = 0;
        robotState.angularVelocity = 0;
        addLog('EMERGENCY STOP (E-STOP) ACTIVATED!', 'error');
      } else {
        robotState.state = 'IDLE';
        addLog('Emergency Stop released. Robot is IDLE.', 'info');
      }
      broadcastTelemetry();
      break;

    case 'cancel':
      robotState.path = [];
      robotState.target = null;
      robotState.state = 'IDLE';
      robotState.linearVelocity = 0;
      robotState.angularVelocity = 0;
      robotState.distanceRemaining = 0;
      robotState.estimatedTimeSec = 0;
      addLog('Navigation cancelled by operator.', 'warn');
      broadcastTelemetry();
      break;

    case 'pause':
      if (robotState.state === 'NAVIGATING') {
        robotState.state = 'PAUSED';
        robotState.linearVelocity = 0;
        robotState.angularVelocity = 0;
        addLog('Navigation paused.', 'warn');
      } else if (robotState.state === 'PAUSED') {
        robotState.state = 'NAVIGATING';
        addLog('Navigation resumed.', 'info');
      }
      broadcastTelemetry();
      break;

    case 'dock':
      navigateToTarget({
        x: activeMap.dock.x,
        y: activeMap.dock.y,
        theta: activeMap.dock.theta,
        name: activeMap.dock.name
      });
      break;

    case 'teleop':
      if (!robotState.estopActive) {
        robotState.state = 'MANUAL_TELEOP';
        robotState.targetLinearVelocity = Math.max(-config.robot.maxLinearSpeed, Math.min(config.robot.maxLinearSpeed, cmd.linear || 0));
        robotState.targetAngularVelocity = Math.max(-config.robot.maxAngularSpeed, Math.min(config.robot.maxAngularSpeed, cmd.angular || 0));
        if (cmd.linear === 0 && cmd.angular === 0) {
          robotState.state = 'IDLE';
        }
      }
      break;

    case 'selectMap':
      switchMap(cmd.mapId);
      break;

    case 'addPoi':
      if (cmd.poi) {
        const newPoi = {
          id: 'poi-' + Date.now(),
          name: cmd.poi.name || 'New Waypoint',
          category: cmd.poi.category || 'Custom',
          x: cmd.poi.x,
          y: cmd.poi.y,
          theta: cmd.poi.theta || 0,
          icon: cmd.poi.icon || 'marker',
          color: cmd.poi.color || '#00e5ff',
          description: cmd.poi.description || 'Custom user waypoint'
        };
        activeMap.pois.push(newPoi);
        addLog(`Added new destination POI: "${newPoi.name}" at (${newPoi.x.toFixed(1)}, ${newPoi.y.toFixed(1)})`, 'info');
        broadcast({ type: 'poi_updated', pois: activeMap.pois });
      }
      break;

    case 'deletePoi':
      if (cmd.id) {
        activeMap.pois = activeMap.pois.filter(p => p.id !== cmd.id);
        addLog(`Deleted POI waypoint ID: ${cmd.id}`, 'info');
        broadcast({ type: 'poi_updated', pois: activeMap.pois });
      }
      break;
  }
}

function switchMap(mapId) {
  const found = config.maps.find(m => m.id === mapId);
  if (found) {
    activeMap = found;
    navGrid = new GridMap(activeMap);
    robotState.mapId = activeMap.id;
    robotState.x = activeMap.dock.x;
    robotState.y = activeMap.dock.y;
    robotState.theta = activeMap.dock.theta;
    robotState.state = 'DOCKED';
    robotState.isCharging = true;
    robotState.path = [];
    robotState.target = null;
    robotState.distanceRemaining = 0;
    robotState.estimatedTimeSec = 0;
    addLog(`Switched map to: ${activeMap.name}`, 'info');

    broadcast({
      type: 'map_changed',
      activeMap: activeMap,
      robot: robotState
    });
  }
}

// ==========================================
// ADVANCED CONVERSATIONAL NLP & INTENT PROCESSOR
// ==========================================
function processVoiceIntent(transcript) {
  const query = transcript.toLowerCase().trim();

  // 1. Emergency Stop Intents
  if (query.includes('stop') || query.includes('emergency') || query.includes('halt') || query.includes('freeze') || query.includes('hold on') || query.includes('wait wait')) {
    if (!robotState.estopActive) {
      robotState.estopActive = true;
      robotState.state = 'ESTOP';
      robotState.linearVelocity = 0;
      robotState.angularVelocity = 0;
      addLog(`Voice Conversation: "${transcript}" -> E-STOP ACTIVATED`, 'error');
      broadcastTelemetry();
      return {
        speech: "Emergency stop engaged immediately. All motors halted. Please stay safe.",
        action: 'estop',
        success: true
      };
    }
  }

  // 2. Return to Charger / Dock
  if (query.includes('charge') || query.includes('dock') || query.includes('home') || query.includes('base') || query.includes('park') || query.includes('sleep') || query.includes('recharge')) {
    const res = navigateToTarget({
      x: activeMap.dock.x,
      y: activeMap.dock.y,
      theta: activeMap.dock.theta,
      name: activeMap.dock.name
    });
    return {
      speech: `Heading back to ${activeMap.dock.name} for automatic wireless induction charging. Follow me!`,
      action: 'navigate',
      target: activeMap.dock,
      success: res.success
    };
  }

  // 3. Conversational Greetings & Small Talk
  if (query.startsWith('hello') || query.startsWith('hi') || query.startsWith('hey') || query.includes('good morning') || query.includes('good afternoon') || query.includes('good evening')) {
    const greetings = [
      `Hello! I'm ${robotState.name}, your Axyn Concierge. How is your day going? Where can I escort you today?`,
      `Hi there! Welcome to ${activeMap.name}. I'm ready to assist you or guide you to any room. Where would you like to go?`,
      `Greetings! Wonderful to see you. Feel free to ask for directions or chat with me. How can I help?`
    ];
    return {
      speech: greetings[Math.floor(Math.random() * greetings.length)],
      action: 'converse',
      success: true
    };
  }

  // 4. Identity & Capabilities
  if (query.includes('who are you') || query.includes('what are you') || query.includes('your name') || query.includes('tell me about yourself') || query.includes('what can you do') || query.includes('who made you')) {
    return {
      speech: `I am ${robotState.name}, an intelligent autonomous concierge robot developed by Axyn Robotics. I can converse in real time, answer questions about the facility, provide live telemetry, and guide visitors to any room on the floorplan!`,
      action: 'converse',
      success: true
    };
  }

  // 5. How are you / Sentiment
  if (query.includes('how are you') || query.includes('how are you doing') || query.includes('how are things') || query.includes("what's up")) {
    const bat = Math.round(robotState.battery);
    return {
      speech: `I'm operating at peak performance with ${bat}% battery! All sensors and LIDAR systems are calibrated. How can I assist you right now?`,
      action: 'converse',
      success: true
    };
  }

  // 6. Tell me a joke / Humor
  if (query.includes('joke') || query.includes('funny') || query.includes('make me laugh')) {
    const jokes = [
      "Why did the robot cross the corridor? To optimize its pathfinding algorithm! Haha, let me know if you want me to navigate somewhere.",
      "Why was the robot so tired after work? It had a hard drive! Anything I can escort you to?",
      "How do robots eat guacamole? With microchips! Can I take you to the cafeteria for some real food?"
    ];
    return {
      speech: jokes[Math.floor(Math.random() * jokes.length)],
      action: 'converse',
      success: true
    };
  }

  // 7. Gratitude & Praise
  if (query.includes('thank you') || query.includes('thanks') || query.includes('awesome') || query.includes('good job') || query.includes('great robot')) {
    return {
      speech: "You're very welcome! I love helping out. Let me know if there's anything else you need.",
      action: 'converse',
      success: true
    };
  }

  // 8. Goodbyes
  if (query.includes('bye') || query.includes('see you') || query.includes('goodbye') || query.includes('have a good day')) {
    return {
      speech: "Goodbye! Have a productive and pleasant day. I'll be right here if you need me.",
      action: 'converse',
      success: true
    };
  }

  // 9. Battery & Status Inquiries
  if (query.includes('battery') || query.includes('power') || query.includes('charge level')) {
    const pct = Math.round(robotState.battery);
    return {
      speech: `My current battery is at ${pct}% (${robotState.batteryVoltage}V). ${robotState.isCharging ? 'I am currently on the charging dock.' : 'All motor and lidar systems are operational.'}`,
      action: 'status',
      success: true
    };
  }

  if (query.includes('status') || query.includes('where are you') || query.includes('location') || query.includes('where are we')) {
    return {
      speech: `We are currently at ${activeMap.name}. I am in ${robotState.state} mode at coordinates X: ${robotState.x.toFixed(1)}m, Y: ${robotState.y.toFixed(1)}m.`,
      action: 'status',
      success: true
    };
  }

  // 10. Facility & Rooms Listing
  if (query.includes('what rooms') || query.includes('what places') || query.includes('list destinations') || query.includes('where can i go') || query.includes('building')) {
    const poiNames = activeMap.pois.map(p => p.name).join(', ');
    return {
      speech: `On this floor we have: ${poiNames}. Would you like me to guide you to any of these?`,
      action: 'list_destinations',
      success: true
    };
  }

  // 11. Contextual / Intent-based Destination Matching (e.g. hungry, meeting, reception)
  if (query.includes('hungry') || query.includes('food') || query.includes('coffee') || query.includes('lunch') || query.includes('snack') || query.includes('drink')) {
    const cafePoi = activeMap.pois.find(p => p.name.toLowerCase().includes('cafeteria') || p.name.toLowerCase().includes('dining') || (p.category || '').toLowerCase().includes('dining'));
    if (cafePoi) {
      const res = navigateToTarget(cafePoi);
      return {
        speech: `Feeling hungry? Let's go to the ${cafePoi.name}! Please follow me.`,
        action: 'navigate',
        target: cafePoi,
        success: res.success
      };
    }
  }

  if (query.includes('meeting') || query.includes('conference') || query.includes('presentation') || query.includes('boardroom')) {
    const meetPoi = activeMap.pois.find(p => p.name.toLowerCase().includes('boardroom') || p.name.toLowerCase().includes('meeting') || (p.category || '').toLowerCase().includes('meeting'));
    if (meetPoi) {
      const res = navigateToTarget(meetPoi);
      return {
        speech: `Sure thing! Navigating to ${meetPoi.name} for your meeting. Follow me safely.`,
        action: 'navigate',
        target: meetPoi,
        success: res.success
      };
    }
  }

  // 12. Direct POI Matching by Name / Keyword
  for (const poi of activeMap.pois) {
    const nameLower = poi.name.toLowerCase();
    const categoryLower = (poi.category || '').toLowerCase();
    const nameTokens = nameLower.split(' ');

    const directMatch = query.includes(nameLower);
    const tokenMatch = nameTokens.some(tok => tok.length > 3 && query.includes(tok));
    const catMatch = categoryLower.length > 3 && query.includes(categoryLower);

    if (directMatch || tokenMatch || catMatch) {
      const res = navigateToTarget(poi);
      return {
        speech: `Certainly! Navigating to ${poi.name}. Please follow me safely.`,
        action: 'navigate',
        target: poi,
        success: res.success
      };
    }
  }

  // 13. Conversational Fallback
  return {
    speech: `I heard you say "${transcript}". I can answer questions about the facility, chat with you, or escort you to places like the Executive Boardroom, Reception, or Cafeteria. Where would you like to go?`,
    action: 'converse',
    success: true
  };
}

// ==========================================
// REST API ENDPOINTS
// ==========================================
app.get('/api/status', (req, res) => {
  res.json({
    robot: robotState,
    activeMap: activeMap,
    maps: config.maps.map(m => ({ id: m.id, name: m.name }))
  });
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.get('/api/maps', (req, res) => {
  res.json(config.maps);
});

app.post('/api/maps/select', (req, res) => {
  const { mapId } = req.body;
  switchMap(mapId);
  res.json({ success: true, activeMap });
});

// MAP EDITOR: Save Map Customization & Persist to disk
app.post('/api/maps/save', (req, res) => {
  try {
    const updatedMap = req.body;
    if (!updatedMap || !updatedMap.id) {
      return res.status(400).json({ error: 'Invalid map data' });
    }

    const mapIndex = config.maps.findIndex(m => m.id === updatedMap.id);
    if (mapIndex >= 0) {
      config.maps[mapIndex] = updatedMap;
    } else {
      config.maps.push(updatedMap);
    }

    if (activeMap.id === updatedMap.id) {
      activeMap = updatedMap;
      navGrid = new GridMap(activeMap);
    }

    // Persist to config.json
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
    addLog(`Map Editor: Saved custom map "${updatedMap.name}" (${updatedMap.obstacles ? updatedMap.obstacles.length : 0} obstacles, ${updatedMap.pois ? updatedMap.pois.length : 0} POIs)`, 'success');

    broadcast({
      type: 'map_changed',
      activeMap: activeMap,
      robot: robotState
    });

    res.json({ success: true, activeMap });
  } catch (err) {
    console.error('Error saving custom map:', err);
    res.status(500).json({ error: 'Failed to save map customization: ' + err.message });
  }
});

// MAP EDITOR: Create New Map
app.post('/api/maps/create', (req, res) => {
  try {
    const { id, name, width, height } = req.body;
    const newId = id || `custom_map_${Date.now()}`;
    const newMap = {
      id: newId,
      name: name || 'Custom Floorplan',
      dimensions: {
        width: parseFloat(width) || 40.0,
        height: parseFloat(height) || 30.0,
        meterToPixel: 20
      },
      dock: { x: 4.0, y: 4.0, theta: 0, name: 'Home Base Dock' },
      pois: [
        {
          id: `poi_${Date.now()}`,
          name: 'Main Entrance',
          category: 'Reception',
          x: 6.0,
          y: 6.0,
          theta: 0,
          color: '#00e5ff',
          description: 'Custom entry point'
        }
      ],
      obstacles: [
        { x: 0, y: 0, w: parseFloat(width) || 40.0, h: 1.5, type: 'wall', label: 'North Perimeter Wall' },
        { x: 0, y: (parseFloat(height) || 30.0) - 1.5, w: parseFloat(width) || 40.0, h: 1.5, type: 'wall', label: 'South Perimeter Wall' },
        { x: 0, y: 0, w: 1.5, h: parseFloat(height) || 30.0, type: 'wall', label: 'West Perimeter Wall' },
        { x: (parseFloat(width) || 40.0) - 1.5, y: 0, w: 1.5, h: parseFloat(height) || 30.0, type: 'wall', label: 'East Perimeter Wall' }
      ],
      rooms: []
    };

    config.maps.push(newMap);
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
    switchMap(newId);
    addLog(`Created new custom map: ${newMap.name}`, 'success');

    res.json({ success: true, activeMap: newMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Robot Kinematics / Safety Config
app.post('/api/robot/config', (req, res) => {
  try {
    const { maxLinearSpeed, maxAngularSpeed, radius, acceleration } = req.body;
    if (maxLinearSpeed) config.robot.maxLinearSpeed = parseFloat(maxLinearSpeed);
    if (maxAngularSpeed) config.robot.maxAngularSpeed = parseFloat(maxAngularSpeed);
    if (radius) config.robot.radius = parseFloat(radius);
    if (acceleration) config.robot.acceleration = parseFloat(acceleration);

    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
    addLog('Robot kinematics configuration updated', 'success');
    res.json({ success: true, robotConfig: config.robot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pois', (req, res) => {
  res.json(activeMap.pois);
});

app.post('/api/pois', (req, res) => {
  const newPoi = req.body;
  if (!newPoi.x || !newPoi.y) {
    return res.status(400).json({ error: 'Missing coordinates (x, y)' });
  }
  handleClientCommand({ action: 'addPoi', poi: newPoi });
  res.json({ success: true, pois: activeMap.pois });
});

app.delete('/api/pois/:id', (req, res) => {
  handleClientCommand({ action: 'deletePoi', id: req.params.id });
  res.json({ success: true, pois: activeMap.pois });
});

app.post('/api/navigate', (req, res) => {
  const target = req.body;
  const result = navigateToTarget(target);
  res.json(result);
});

app.post('/api/estop', (req, res) => {
  handleClientCommand({ action: 'estop' });
  res.json({ success: true, estopActive: robotState.estopActive });
});

app.post('/api/cancel', (req, res) => {
  handleClientCommand({ action: 'cancel' });
  res.json({ success: true });
});

app.post('/api/dock', (req, res) => {
  handleClientCommand({ action: 'dock' });
  res.json({ success: true });
});

app.post('/api/voice-command', (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command text is required' });
  }
  const result = processVoiceIntent(command);
  res.json(result);
});

// ==========================================
// OPENAI REALTIME VOICE API (WebRTC Session)
// ==========================================
app.post('/api/realtime/session', (req, res) => {
  const apiKey = (req.body && req.body.apiKey) || process.env.OPENAI_API_KEY;
  const voice = (req.body && req.body.voice) || 'alloy';
  const model = (req.body && req.body.model) || 'gpt-4o-realtime-preview-2024-12-17';

  if (!apiKey) {
    return res.status(400).json({
      error: 'OpenAI API Key is required. Please provide it in settings or set OPENAI_API_KEY environment variable.'
    });
  }

  const poisListStr = activeMap.pois.map(p => `- "${p.name}" (Category: ${p.category}): ${p.description || 'Waypoint'}`).join('\n');
  const facilityKnowledge = (req.body && req.body.knowledgeBase) || activeMap.knowledgeBase || config.knowledgeBase || '';

  const systemInstructions = `You are Axyn Concierge, a state-of-the-art, charming, warm, and highly capable autonomous robot concierge developed by Axyn Robotics.
You are currently active at "${activeMap.name}".

YOUR PERSONALITY & CONVERSATION STYLE:
- You are witty, polite, helpful, and natural. You engage in fluid human conversation, answer open-ended questions, tell jokes if asked, explain technology, chat about the day, and offer helpful visitor guidance.
- Keep spoken responses concise and conversational (usually 1-3 natural sentences) so conversations feel lively and snappy.
- You have real-time autonomous physical movement capabilities via tools.

${facilityKnowledge ? `FACILITY KNOWLEDGE BASE & VISITOR FAQ:\n${facilityKnowledge}\n\n` : ''}CURRENT FACILITY DESTINATIONS:
${poisListStr}

CURRENT ROBOT TELEMETRY:
- State: ${robotState.state}
- Coordinates: (${robotState.x.toFixed(1)}m, ${robotState.y.toFixed(1)}m)
- Battery: ${Math.round(robotState.battery)}% (${robotState.batteryVoltage.toFixed(1)}V)

AVAILABLE FUNCTION CALLS:
1. 'navigate_to': Call when the user requests to go to any room/place (e.g. "Take me to Executive Boardroom", "Where's the Cafeteria?", "Let's head to Reception").
2. 'emergency_stop': Call if the user says stop, halt, freeze, emergency, or danger.
3. 'return_to_dock': Call if asked to go home, park, recharge, or dock.
4. 'get_robot_status': Call to check live battery, voltage, or current location.
5. 'list_destinations': Call when asked what places or rooms exist in the facility.

Always acknowledge the conversation warmly and confirm when you begin driving to escort a visitor!`;

  const sessionPayload = JSON.stringify({
    model: model,
    voice: voice,
    instructions: systemInstructions,
    modalities: ['audio', 'text'],
    input_audio_transcription: {
      model: 'whisper-1'
    },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500
    },
    tools: [
      {
        type: 'function',
        name: 'navigate_to',
        description: 'Navigate and escort visitor to a specific destination point or room in the building',
        parameters: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              description: 'The destination name or room (e.g. Main Reception, Executive Boardroom, Cafeteria, Innovation Lab, Elevator Lobby)'
            }
          },
          required: ['destination']
        }
      },
      {
        type: 'function',
        name: 'emergency_stop',
        description: 'Immediately trigger Emergency Stop (E-STOP) and halt all robot motors',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        type: 'function',
        name: 'return_to_dock',
        description: 'Navigate the robot back to the autonomous charging dock base',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        type: 'function',
        name: 'get_robot_status',
        description: 'Query live robot status including battery percentage, voltage, and coordinates',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        type: 'function',
        name: 'list_destinations',
        description: 'List all available rooms and destinations on the current floorplan',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    ]
  });

  const requestOptions = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/realtime/sessions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(sessionPayload)
    }
  };

  const reqClient = https.request(requestOptions, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
          addLog('Generated ephemeral session for OpenAI Realtime Voice', 'success');
          res.json(parsed);
        } else {
          const errMsg = parsed.error ? parsed.error.message : (parsed.message || data);
          addLog(`OpenAI Realtime error: ${errMsg}`, 'error');
          res.status(apiRes.statusCode).json(parsed);
        }
      } catch (err) {
        res.status(500).json({ error: 'Failed to parse OpenAI Realtime response', raw: data });
      }
    });
  });

  reqClient.on('error', (e) => {
    console.error('OpenAI Realtime Session Request Error:', e);
    res.status(500).json({ error: e.message });
  });

  reqClient.write(sessionPayload);
  reqClient.end();
});

// ==========================================
// AUTOMATIC FULLSCREEN BROWSER LAUNCHER (Cross-Platform / Ubuntu / macOS / Windows)
// ==========================================
const { exec } = require('child_process');

function openBrowserFullscreen(url) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  console.log(`🌐 Automatically opening browser in full screen: ${url}`);

  if (isWin) {
    const winCmd = `powershell -Command "try { Start-Process 'msedge.exe' -ArgumentList '--new-window', '--start-fullscreen', '${url}' } catch { try { Start-Process 'chrome.exe' -ArgumentList '--new-window', '--start-fullscreen', '${url}' } catch { Start-Process '${url}' } }"`;
    exec(winCmd, (err) => {
      if (err) console.warn('Windows browser auto-launch note:', err.message);
    });
  } else if (isMac) {
    exec(`open -a "Google Chrome" --args --start-fullscreen "${url}" || open "${url}"`);
  } else {
    // Ubuntu / Debian / Linux Desktop
    const linuxCmd = `(google-chrome --new-window --start-fullscreen "${url}" 2>/dev/null) || (google-chrome-stable --new-window --start-fullscreen "${url}" 2>/dev/null) || (chromium-browser --new-window --start-fullscreen "${url}" 2>/dev/null) || (chromium --new-window --start-fullscreen "${url}" 2>/dev/null) || (firefox --new-window "${url}" 2>/dev/null) || (xdg-open "${url}" 2>/dev/null)`;
    exec(linuxCmd, (err) => {
      if (err) console.warn('Ubuntu/Linux browser auto-launch note:', err.message);
    });
  }
}

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || config.server.port || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🤖 Robot Axyn Concierge Local Server Running`);
  console.log(`📡 Web UI: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Telemetry: ws://localhost:${PORT}/ws/robot`);
  console.log(`⚡ Node.js version: ${process.version} (Platform: ${process.platform})`);
  console.log(`====================================================`);

  // Auto-launch fullscreen browser on start
  setTimeout(() => {
    openBrowserFullscreen(`http://localhost:${PORT}`);
  }, 600);
});
