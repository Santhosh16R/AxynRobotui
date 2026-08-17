/**
 * Robot Axyn Concierge - Virtual Joystick and Manual Teleoperation Controller
 */

class TeleoperationController {
  constructor(app) {
    this.app = app;
    this.base = document.getElementById('joystickBase');
    this.stick = document.getElementById('joystickStick');
    this.speedSlider = document.getElementById('speedSlider');
    this.speedValue = document.getElementById('speedValue');

    this.domDpad = {
      up: document.getElementById('btnDpadUp'),
      down: document.getElementById('btnDpadDown'),
      left: document.getElementById('btnDpadLeft'),
      right: document.getElementById('btnDpadRight'),
      stop: document.getElementById('btnDpadStop')
    };

    this.active = false;
    this.maxRadius = 60; // Pixels
    this.linearSpeedScale = 1.0;
    this.linearVel = 0;
    this.angularVel = 0;
    this.teleopInterval = null;

    this.initJoystick();
    this.initDpad();
    this.initKeyboard();
  }

  initJoystick() {
    const onStart = (e) => {
      e.preventDefault();
      this.active = true;
      this.startTeleopStream();
      this.handlePointerMove(e);
    };

    const onMove = (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.handlePointerMove(e);
    };

    const onEnd = () => {
      if (!this.active) return;
      this.active = false;
      this.stick.style.transform = 'translate(0px, 0px)';
      this.linearVel = 0;
      this.angularVel = 0;
      this.sendVelocity(0, 0);
      this.stopTeleopStream();
    };

    // Touch events
    this.base.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    // Mouse events
    this.base.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    // Speed Slider
    this.speedSlider.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      this.linearSpeedScale = pct / 100;
      const maxSpd = (1.2 * this.linearSpeedScale).toFixed(1);
      this.speedValue.textContent = `${pct}% (${maxSpd} m/s)`;
    });
  }

  handlePointerMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = this.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > this.maxRadius) {
      dx = (dx / dist) * this.maxRadius;
      dy = (dy / dist) * this.maxRadius;
    }

    this.stick.style.transform = `translate(${dx}px, ${dy}px)`;

    // Normalized velocities [-1, 1]
    const normX = dx / this.maxRadius; // Angular (turn)
    const normY = -dy / this.maxRadius; // Linear (forward/back)

    const deadzone = 0.15;
    const linearRaw = Math.abs(normY) > deadzone ? normY : 0;
    const angularRaw = Math.abs(normX) > deadzone ? -normX : 0;

    const maxLin = 1.2 * this.linearSpeedScale;
    const maxAng = 1.5;

    this.linearVel = linearRaw * maxLin;
    this.angularVel = angularRaw * maxAng;
  }

  startTeleopStream() {
    if (this.teleopInterval) clearInterval(this.teleopInterval);
    this.teleopInterval = setInterval(() => {
      this.sendVelocity(this.linearVel, this.angularVel);
    }, 60);
  }

  stopTeleopStream() {
    if (this.teleopInterval) {
      clearInterval(this.teleopInterval);
      this.teleopInterval = null;
    }
  }

  sendVelocity(linear, angular) {
    this.app.sendWebSocketCommand({
      action: 'teleop',
      linear: parseFloat(linear.toFixed(2)),
      angular: parseFloat(angular.toFixed(2))
    });
  }

  initDpad() {
    const bindBtn = (btn, lin, ang) => {
      const start = (e) => {
        e.preventDefault();
        this.linearVel = lin * 1.2 * this.linearSpeedScale;
        this.angularVel = ang * 1.5;
        this.startTeleopStream();
      };
      const stop = (e) => {
        e.preventDefault();
        this.linearVel = 0;
        this.angularVel = 0;
        this.sendVelocity(0, 0);
        this.stopTeleopStream();
      };

      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', stop);
      btn.addEventListener('mouseleave', stop);
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', stop);
    };

    bindBtn(this.domDpad.up, 1.0, 0);
    bindBtn(this.domDpad.down, -1.0, 0);
    bindBtn(this.domDpad.left, 0, 1.0);
    bindBtn(this.domDpad.right, 0, -1.0);

    this.domDpad.stop.addEventListener('click', () => {
      this.sendVelocity(0, 0);
    });
  }

  initKeyboard() {
    const keysDown = new Set();

    window.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(key)) {
        e.preventDefault();
        keysDown.add(key);
        this.updateKeyboardVel(keysDown);
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (keysDown.has(key)) {
        keysDown.delete(key);
        this.updateKeyboardVel(keysDown);
      }
    });
  }

  updateKeyboardVel(keys) {
    let lin = 0;
    let ang = 0;

    if (keys.has('w') || keys.has('arrowup')) lin += 1.0;
    if (keys.has('s') || keys.has('arrowdown')) lin -= 1.0;
    if (keys.has('a') || keys.has('arrowleft')) ang += 1.0;
    if (keys.has('d') || keys.has('arrowright')) ang -= 1.0;

    if (keys.has(' ')) {
      lin = 0;
      ang = 0;
    }

    this.linearVel = lin * 1.2 * this.linearSpeedScale;
    this.angularVel = ang * 1.5;

    if (lin !== 0 || ang !== 0) {
      this.startTeleopStream();
    } else {
      this.sendVelocity(0, 0);
      this.stopTeleopStream();
    }
  }
}
