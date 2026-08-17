/**
 * Robot Axyn Concierge - Telemetry and State Management
 */

class RobotManager {
  constructor(app) {
    this.app = app;
    this.dom = {
      statusCapsule: document.getElementById('statusCapsule'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      posCoords: document.getElementById('posCoords'),
      posHeading: document.getElementById('posHeading'),
      batteryCapsule: document.getElementById('batteryCapsule'),
      batteryBar: document.getElementById('batteryBar'),
      batteryText: document.getElementById('batteryText'),
      batteryVoltage: document.getElementById('batteryVoltage'),
      btnEstop: document.getElementById('btnEstop'),
      estopLabel: document.getElementById('estopLabel'),
      navDrawer: document.getElementById('navDrawer'),
      navTargetName: document.getElementById('navTargetName'),
      navDistance: document.getElementById('navDistance'),
      navEta: document.getElementById('navEta'),
      navSpeed: document.getElementById('navSpeed'),
      navProgressFill: document.getElementById('navProgressFill'),
      btnNavPause: document.getElementById('btnNavPause'),
      pauseLabel: document.getElementById('pauseLabel'),
      btnNavCancel: document.getElementById('btnNavCancel')
    };

    this.initialDistance = 0;
    this.initDrawerEvents();
  }

  updateTelemetry(robot) {
    // 1. Status capsule
    const state = robot.state || 'IDLE';
    this.dom.statusText.textContent = state;

    this.dom.statusCapsule.className = 'status-capsule ' + state.toLowerCase();

    // 2. Position Coordinates & Heading
    this.dom.posCoords.textContent = `X: ${robot.x.toFixed(1)}m, Y: ${robot.y.toFixed(1)}m`;
    const headingDeg = Math.round((robot.theta * 180) / Math.PI);
    this.dom.posHeading.textContent = `θ: ${headingDeg}°`;

    // 3. Battery System
    const bat = Math.round(robot.battery);
    this.dom.batteryBar.style.width = `${bat}%`;
    this.dom.batteryText.textContent = `${bat}%`;
    this.dom.batteryVoltage.textContent = `${robot.batteryVoltage.toFixed(1)}V`;

    this.dom.batteryCapsule.classList.toggle('charging', Boolean(robot.isCharging));

    if (bat < 20) {
      this.dom.batteryBar.style.background = 'var(--accent-danger)';
    } else if (bat < 40) {
      this.dom.batteryBar.style.background = 'var(--accent-amber)';
    } else {
      this.dom.batteryBar.style.background = robot.isCharging ? 'var(--accent-cyan)' : 'var(--accent-emerald)';
    }

    // 4. E-STOP Indicator
    if (robot.estopActive) {
      this.dom.btnEstop.classList.add('active');
      this.dom.estopLabel.textContent = 'STOPPED';
    } else {
      this.dom.btnEstop.classList.remove('active');
      this.dom.estopLabel.textContent = 'E-STOP';
    }

    // 5. Active Navigation Drawer HUD
    if (robot.state === 'NAVIGATING' || robot.state === 'PLANNING' || robot.state === 'PAUSED') {
      this.dom.navDrawer.classList.add('visible');
      this.dom.navTargetName.textContent = robot.target ? robot.target.name : 'Target Waypoint';
      this.dom.navDistance.textContent = `${robot.distanceRemaining.toFixed(1)} m`;
      this.dom.navEta.textContent = `${robot.estimatedTimeSec} s`;
      this.dom.navSpeed.textContent = `${robot.linearVelocity.toFixed(1)} m/s`;

      if (robot.state === 'PAUSED') {
        this.dom.pauseLabel.textContent = 'Resume';
      } else {
        this.dom.pauseLabel.textContent = 'Pause';
      }

      // Track distance progress
      if (this.initialDistance <= 0 || robot.state === 'PLANNING') {
        this.initialDistance = Math.max(1, robot.distanceRemaining);
      }
      const progress = Math.max(0, Math.min(100, (1 - robot.distanceRemaining / this.initialDistance) * 100));
      this.dom.navProgressFill.style.width = `${progress}%`;
    } else {
      this.dom.navDrawer.classList.remove('visible');
      this.initialDistance = 0;
    }

    // 6. Sync Robotic Face Emotion & Expression
    if (this.app.face && this.app.face.expression !== 'speaking' && this.app.face.expression !== 'listening') {
      if (robot.estopActive) {
        this.app.face.setExpression('alert');
      } else if (robot.isCharging || robot.state === 'DOCKED') {
        this.app.face.setExpression('sleeping');
      } else if (robot.state === 'NAVIGATING') {
        this.app.face.setExpression('happy');
      } else {
        this.app.face.setExpression('idle');
      }
    }
  }

  initDrawerEvents() {
    this.dom.btnNavPause.addEventListener('click', () => {
      this.app.sendWebSocketCommand({ action: 'pause' });
    });

    this.dom.btnNavCancel.addEventListener('click', () => {
      this.app.sendWebSocketCommand({ action: 'cancel' });
    });
  }
}
