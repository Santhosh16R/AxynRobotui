/**
 * Robot Axyn Concierge - Ultra-Cute & Expressive Robot Face Engine
 * Features:
 * - Adorable OLED eyes with sparkling catchlights and pupil tracking
 * - Rosy glowing blush cheeks with happy reaction triggers
 * - Random playful idle antics (curious tilts, winks, happy squints, surprise)
 * - Interactive poke/petting reactions (click to giggle & blush)
 * - Speech-synchronized viseme mouth shapes
 */

class RobotFace {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('robotFace');
    this.leftEye = document.getElementById('leftEye');
    this.rightEye = document.getElementById('rightEye');
    this.leftPupil = document.getElementById('leftPupil');
    this.rightPupil = document.getElementById('rightPupil');
    this.leftIrisDial = document.getElementById('leftIrisDial');
    this.rightIrisDial = document.getElementById('rightIrisDial');
    this.mouth = document.getElementById('robotMouth');
    this.mouthPath = document.getElementById('mouthPath');
    this.blushLeft = document.getElementById('blushLeft');
    this.blushRight = document.getElementById('blushRight');

    this.expression = 'idle'; // 'idle' | 'happy' | 'listening' | 'speaking' | 'curious' | 'surprised' | 'wink' | 'alert' | 'sleeping'
    this.isPetted = false;
    this.blinkTimer = null;
    this.randomBehaviorTimer = null;
    this.speakingInterval = null;

    // Continuous Eyeball Rotation & Gaze Physics
    this.lastUserInteraction = 0;
    this.randomEyeTimer = null;
    this.eyeRollTimer = null;
    this.isRollingEyes = false;
    this.spinAngle = 0;
    this.pupilScale = 1.0;
    this.targetPupilScale = 1.0;
    this.pupilRotationDeg = 0;
    this.targetPupilRotationDeg = 0;

    // Eye Tracking Interpolation
    this.lookX = 0;
    this.lookY = 0;
    this.targetLookX = 0;
    this.targetLookY = 0;
    this.eyeTiltDeg = 0;
    this.targetEyeTiltDeg = 0;

    this.initFace();
    this.initInteractivePetting();
    this.startNaturalBehaviors();
    this.startRandomEyeWandering();
    this.startPeriodicEyeRolling();
  }

  initFace() {
    if (!this.container) return;

    // Track mouse position over the screen so eyes follow with smooth curiosity & rotation
    window.addEventListener('mousemove', (e) => {
      this.lastUserInteraction = Date.now();
      if (this.isPetted || this.isRollingEyes) return;

      const rect = this.container.getBoundingClientRect();
      const faceCenterX = rect.left + rect.width / 2;
      const faceCenterY = rect.top + rect.height / 2;

      const dx = (e.clientX - faceCenterX) / (window.innerWidth / 2);
      const dy = (e.clientY - faceCenterY) / (window.innerHeight / 2);

      const isFullscreen = this.container.classList.contains('face-fullscreen-mode') || document.querySelector('.main-layout.map-minimized');
      const maxTravelX = isFullscreen ? 36 : 24;
      const maxTravelY = isFullscreen ? 24 : 16;

      this.targetLookX = Math.max(-maxTravelX, Math.min(maxTravelX, dx * maxTravelX));
      this.targetLookY = Math.max(-maxTravelY, Math.min(maxTravelY, dy * maxTravelY));
      this.targetEyeTiltDeg = dx * 5.0;

      // Calculate 3D eyeball rotation angle towards look point
      const angleRad = Math.atan2(this.targetLookY, this.targetLookX);
      this.targetPupilRotationDeg = (angleRad * 180 / Math.PI);
    });

    // Touch support for eye tracking on mobile/kiosk
    window.addEventListener('touchmove', (e) => {
      this.lastUserInteraction = Date.now();
      if (!e.touches[0] || this.isPetted || this.isRollingEyes) return;
      const touch = e.touches[0];
      const rect = this.container.getBoundingClientRect();
      const faceCenterX = rect.left + rect.width / 2;
      const faceCenterY = rect.top + rect.height / 2;

      const dx = (touch.clientX - faceCenterX) / (window.innerWidth / 2);
      const dy = (touch.clientY - faceCenterY) / (window.innerHeight / 2);

      const isFullscreen = this.container.classList.contains('face-fullscreen-mode') || document.querySelector('.main-layout.map-minimized');
      const maxTravelX = isFullscreen ? 36 : 24;
      const maxTravelY = isFullscreen ? 24 : 16;

      this.targetLookX = Math.max(-maxTravelX, Math.min(maxTravelX, dx * maxTravelX));
      this.targetLookY = Math.max(-maxTravelY, Math.min(maxTravelY, dy * maxTravelY));
      this.targetEyeTiltDeg = dx * 5.0;

      const angleRad = Math.atan2(this.targetLookY, this.targetLookX);
      this.targetPupilRotationDeg = (angleRad * 180 / Math.PI);
    }, { passive: true });

    // Smooth 60 FPS Render loop for Eyeball Rotation, Pupils, and 3D Spherical Lighting
    const animateFace = () => {
      // 1. Continuous organic rotation spin for iris dials & star highlights
      this.spinAngle = (this.spinAngle + 1.2) % 360;

      // 2. Natural organic micro-tremor (simulating living saccades)
      const microTremorX = Math.sin(Date.now() * 0.003) * 0.4;
      const microTremorY = Math.cos(Date.now() * 0.0025) * 0.3;

      this.lookX += (this.targetLookX + microTremorX - this.lookX) * 0.15;
      this.lookY += (this.targetLookY + microTremorY - this.lookY) * 0.15;
      this.eyeTiltDeg += (this.targetEyeTiltDeg - this.eyeTiltDeg) * 0.10;
      this.pupilScale += (this.targetPupilScale - this.pupilScale) * 0.10;
      this.pupilRotationDeg += (this.targetPupilRotationDeg - this.pupilRotationDeg) * 0.12;

      // 3. Rotate & Translate Pupils (Eyeballs)
      if (this.leftPupil && this.rightPupil) {
        const pupilTransform = `translate(${this.lookX.toFixed(2)}px, ${this.lookY.toFixed(2)}px) rotate(${this.pupilRotationDeg.toFixed(1)}deg) scale(${this.pupilScale.toFixed(2)})`;
        this.leftPupil.style.transform = pupilTransform;
        this.rightPupil.style.transform = pupilTransform;
      }

      // 4. Continuously Rotate Iris Dials
      if (this.leftIrisDial && this.rightIrisDial) {
        const irisTransform = `rotate(${this.spinAngle.toFixed(1)}deg)`;
        this.leftIrisDial.style.transform = irisTransform;
        this.rightIrisDial.style.transform = irisTransform;
      }

      // 5. Rotate 3D Light Shading on Eyeball Sockets
      if (this.leftEye && this.rightEye) {
        const lightShiftX = 35 + (this.lookX * 0.85);
        const lightShiftY = 35 + (this.lookY * 0.85);
        const eyeBg = `radial-gradient(circle at ${lightShiftX.toFixed(1)}% ${lightShiftY.toFixed(1)}%, #00e5ff 0%, #0284c7 65%, #030712 100%)`;
        this.leftEye.style.background = eyeBg;
        this.rightEye.style.background = eyeBg;
      }

      // 6. Head / Eyebrow Angle Tilt
      const eyesWrapper = this.container.querySelector('.robot-eyes-wrapper');
      if (eyesWrapper) {
        eyesWrapper.style.transform = `rotate(${this.eyeTiltDeg.toFixed(2)}deg)`;
      }

      requestAnimationFrame(animateFace);
    };
    requestAnimationFrame(animateFace);
  }

  // ==========================================
  // CONTINUOUS RANDOM EYE SACCADES & 360° ROTATIONS
  // ==========================================
  startRandomEyeWandering() {
    const doRandomEyeSaccade = () => {
      const timeSinceInteraction = Date.now() - this.lastUserInteraction;
      const isFullscreen = this.container && (this.container.classList.contains('face-fullscreen-mode') || document.querySelector('.main-layout.map-minimized'));
      const maxRangeX = isFullscreen ? 32 : 18;
      const maxRangeY = isFullscreen ? 20 : 12;

      if (timeSinceInteraction > 1200 && !this.isPetted && !this.isRollingEyes && this.expression !== 'sleeping') {
        const patterns = [
          // 1. Curious Look Upper Left (Daydream / thinking)
          { x: -maxRangeX * 0.8, y: -maxRangeY * 0.7, tilt: 6, rot: -135, scale: 1.05, duration: 1400 },
          // 2. Direct Engaging Center Look
          { x: 0, y: 0, tilt: 0, rot: 0, scale: 1.0, duration: 1600 },
          // 3. Look Upper Right (Curious observation)
          { x: maxRangeX * 0.85, y: -maxRangeY * 0.65, tilt: -6, rot: -45, scale: 1.08, duration: 1500 },
          // 4. Wide Left Scan (Scanning room corridor)
          { x: -maxRangeX * 0.95, y: 0, tilt: 3, rot: 180, scale: 1.0, duration: 1200 },
          // 5. Wide Right Scan
          { x: maxRangeX * 0.95, y: 0, tilt: -3, rot: 0, scale: 1.0, duration: 1200 },
          // 6. Look Down (Reading / checking floor)
          { x: 0, y: maxRangeY * 0.75, tilt: 0, rot: 90, scale: 0.95, duration: 1300 },
          // 7. Diagonal Glance Down-Right
          { x: maxRangeX * 0.7, y: maxRangeY * 0.6, tilt: -4, rot: 45, scale: 0.98, duration: 1100 },
          // 8. Diagonal Glance Down-Left
          { x: -maxRangeX * 0.7, y: maxRangeY * 0.6, tilt: 4, rot: 135, scale: 0.98, duration: 1100 }
        ];

        const nextGaze = patterns[Math.floor(Math.random() * patterns.length)];

        // Occasional micro-blink when shifting gaze
        if (Math.random() < 0.35) {
          this.blink();
        }

        this.targetLookX = nextGaze.x;
        this.targetLookY = nextGaze.y;
        this.targetEyeTiltDeg = nextGaze.tilt;
        this.targetPupilRotationDeg = nextGaze.rot;
        this.targetPupilScale = nextGaze.scale;

        const nextInterval = nextGaze.duration + Math.random() * 800;
        this.randomEyeTimer = setTimeout(doRandomEyeSaccade, nextInterval);
      } else {
        this.randomEyeTimer = setTimeout(doRandomEyeSaccade, 800);
      }
    };

    this.randomEyeTimer = setTimeout(doRandomEyeSaccade, 1000);
  }

  // ==========================================
  // FULL 360-DEGREE CIRCULAR EYE ROLLS
  // ==========================================
  startPeriodicEyeRolling() {
    const scheduleNextRoll = () => {
      // Perform a smooth 360° eye roll every 7-14 seconds
      const delay = 7000 + Math.random() * 7000;
      this.eyeRollTimer = setTimeout(() => {
        const timeSinceInteraction = Date.now() - this.lastUserInteraction;
        if (timeSinceInteraction > 1500 && !this.isPetted && !this.isRollingEyes && this.expression === 'idle') {
          const clockwise = Math.random() > 0.5;
          this.performFullCircularEyeRoll(clockwise);
        }
        scheduleNextRoll();
      }, delay);
    };
    scheduleNextRoll();
  }

  performFullCircularEyeRoll(clockwise = true) {
    this.isRollingEyes = true;
    const isFullscreen = this.container && (this.container.classList.contains('face-fullscreen-mode') || document.querySelector('.main-layout.map-minimized'));
    const radiusX = isFullscreen ? 26 : 16;
    const radiusY = isFullscreen ? 18 : 11;
    const startTime = Date.now();
    const rollDuration = 1200; // 1.2s smooth full 360-degree rotation

    const rollStep = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / rollDuration);

      // Angle from 0 to 2*PI (clockwise or counter-clockwise)
      const angle = (clockwise ? 1 : -1) * progress * Math.PI * 2 - (Math.PI / 2);

      this.targetLookX = Math.cos(angle) * radiusX;
      this.targetLookY = Math.sin(angle) * radiusY;
      this.targetPupilRotationDeg = (angle * 180 / Math.PI) + 90;
      this.targetEyeTiltDeg = Math.cos(angle) * 6;

      if (progress < 1) {
        requestAnimationFrame(rollStep);
      } else {
        // Return to center smoothly
        this.targetLookX = 0;
        this.targetLookY = 0;
        this.targetPupilRotationDeg = 0;
        this.targetEyeTiltDeg = 0;
        setTimeout(() => {
          this.isRollingEyes = false;
        }, 300);
      }
    };

    requestAnimationFrame(rollStep);
  }

  // ==========================================
  // INTERACTIVE PETTING & POKING
  // ==========================================
  initInteractivePetting() {
    if (!this.container) return;

    this.container.addEventListener('click', () => {
      this.triggerHappyGiggle();
    });
  }

  triggerHappyGiggle() {
    this.isPetted = true;
    this.setExpression('happy');

    // Play cute synthesized happy chime
    if (this.app.voice) {
      this.app.voice.playChime('success');
    }

    this.targetEyeTiltDeg = (Math.random() > 0.5 ? 6 : -6);
    this.targetLookX = 0;
    this.targetLookY = -4;

    // Squeeze eyes in adorable smile `(^^)`
    if (this.container) {
      this.container.classList.add('expr-happy');
    }

    setTimeout(() => {
      this.isPetted = false;
      this.targetEyeTiltDeg = 0;
      this.setExpression('idle');
    }, 1400);
  }

  // ==========================================
  // EXPRESSIONS & EMOTIONS
  // ==========================================
  setExpression(expr) {
    if (this.isPetted && expr !== 'happy') return;
    this.expression = expr;

    if (!this.container) return;

    this.container.classList.remove(
      'expr-idle',
      'expr-happy',
      'expr-listening',
      'expr-speaking',
      'expr-curious',
      'expr-surprised',
      'expr-alert',
      'expr-sleeping'
    );
    this.container.classList.add(`expr-${expr}`);

    // Update mouth viseme / curve
    if (expr === 'speaking') {
      this.startSpeakingMouthAnimation();
    } else {
      this.stopSpeakingMouthAnimation();
      this.setMouthShape(expr);
    }
  }

  setMouthShape(shape) {
    if (!this.mouthPath) return;

    switch (shape) {
      case 'idle':
        // Cute resting smile curve
        this.mouthPath.setAttribute('d', 'M 25 24 Q 50 36 75 24');
        break;
      case 'happy':
        // Big radiant cute smile (^o^)
        this.mouthPath.setAttribute('d', 'M 18 18 Q 50 50 82 18');
        break;
      case 'curious':
        // Adorable small curved 'o' / cat mouth
        this.mouthPath.setAttribute('d', 'M 35 25 Q 50 38 65 25');
        break;
      case 'surprised':
        // Tiny surprised round mouth :o
        this.mouthPath.setAttribute('d', 'M 36 20 Q 50 36 64 20 Q 50 42 36 20');
        break;
      case 'listening':
        // Focused glowing listening line
        this.mouthPath.setAttribute('d', 'M 25 26 Q 50 26 75 26');
        break;
      case 'alert':
        // Straight emergency alert line
        this.mouthPath.setAttribute('d', 'M 22 28 L 78 28');
        break;
      case 'sleeping':
        // Soft sleepy smile curve
        this.mouthPath.setAttribute('d', 'M 30 26 Q 50 33 70 26');
        break;
      default:
        this.mouthPath.setAttribute('d', 'M 25 24 Q 50 36 75 24');
        break;
    }
  }

  startSpeakingMouthAnimation() {
    this.stopSpeakingMouthAnimation();

    const mouthShapes = [
      'M 18 18 Q 50 48 82 18', // Big open smile
      'M 26 16 Q 50 40 74 16', // Medium open
      'M 32 20 Q 50 42 68 20', // Cute small o
      'M 22 24 Q 50 35 78 24', // Wide smile
      'M 28 20 Q 50 36 72 20', // Talking viseme
      'M 30 26 Q 50 30 70 26'  // Soft closed
    ];

    let step = 0;
    this.speakingInterval = setInterval(() => {
      if (this.expression !== 'speaking') {
        this.stopSpeakingMouthAnimation();
        return;
      }
      const shape = mouthShapes[step % mouthShapes.length];
      if (this.mouthPath) {
        this.mouthPath.setAttribute('d', shape);
      }
      step++;
    }, 100);
  }

  stopSpeakingMouthAnimation() {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    this.setMouthShape(this.expression);
  }

  // ==========================================
  // NATURAL & RANDOM CUTE ANTICS
  // ==========================================
  blink() {
    if (this.expression === 'sleeping') return;
    if (!this.container) return;

    this.container.classList.add('blinking');
    setTimeout(() => {
      if (this.container) this.container.classList.remove('blinking');
    }, 280);
  }

  doubleBlink() {
    this.blink();
    setTimeout(() => this.blink(), 380);
  }

  wink(side = 'left') {
    if (this.expression === 'sleeping') return;
    const eye = side === 'left' ? this.leftEye : this.rightEye;
    if (!eye) return;

    const topEyelid = eye.querySelector('.eyelid-top');
    const bottomEyelid = eye.querySelector('.eyelid-bottom');
    if (topEyelid && bottomEyelid) {
      topEyelid.style.height = '58%';
      bottomEyelid.style.height = '48%';
      setTimeout(() => {
        topEyelid.style.height = '';
        bottomEyelid.style.height = '';
      }, 420);
    }
  }

  startNaturalBehaviors() {
    // 1. Natural Blinking Loop
    const scheduleNextBlink = () => {
      const delay = 2200 + Math.random() * 3200;
      this.blinkTimer = setTimeout(() => {
        if (Math.random() < 0.25) {
          this.doubleBlink();
        } else {
          this.blink();
        }
        scheduleNextBlink();
      }, delay);
    };
    scheduleNextBlink();

    // 2. Random Cute Antics Loop
    const scheduleRandomAntic = () => {
      const delay = 3500 + Math.random() * 4500;
      this.randomBehaviorTimer = setTimeout(() => {
        if (this.expression === 'idle' && !this.isPetted) {
          this.performRandomCuteAntic();
        }
        scheduleRandomAntic();
      }, delay);
    };
    scheduleRandomAntic();
  }

  performRandomCuteAntic() {
    const choice = Math.floor(Math.random() * 6);

    switch (choice) {
      case 0:
        // Curious Puppy Tilt & Look Up
        this.targetEyeTiltDeg = (Math.random() > 0.5 ? 7 : -7);
        this.targetLookY = -6;
        this.targetLookX = (Math.random() - 0.5) * 12;
        this.setMouthShape('curious');
        setTimeout(() => {
          this.targetEyeTiltDeg = 0;
          this.targetLookX = 0;
          this.targetLookY = 0;
          this.setMouthShape('idle');
        }, 1200);
        break;

      case 1:
        // Playful Wink with Left or Right Eye
        const winkSide = Math.random() > 0.5 ? 'left' : 'right';
        this.wink(winkSide);
        this.targetEyeTiltDeg = winkSide === 'left' ? 4 : -4;
        setTimeout(() => {
          this.targetEyeTiltDeg = 0;
        }, 600);
        break;

      case 2:
        // Happy Eye Squeeze `(^^)`
        if (this.container) {
          this.container.classList.add('expr-happy');
          this.setMouthShape('happy');
          setTimeout(() => {
            if (this.container && this.expression === 'idle') {
              this.container.classList.remove('expr-happy');
              this.setMouthShape('idle');
            }
          }, 1000);
        }
        break;

      case 3:
        // Curious Corner Glance
        this.targetLookX = (Math.random() > 0.5 ? 12 : -12);
        this.targetLookY = (Math.random() - 0.5) * 8;
        setTimeout(() => {
          this.targetLookX = 0;
          this.targetLookY = 0;
        }, 900);
        break;

      case 4:
        // Playful Surprise Look `(O.O)`
        this.setMouthShape('surprised');
        this.targetLookY = -5;
        setTimeout(() => {
          this.setMouthShape('idle');
          this.targetLookY = 0;
        }, 1100);
        break;

      case 5:
        // Fluttery Double Blink with Tilt
        this.targetEyeTiltDeg = 5;
        this.doubleBlink();
        setTimeout(() => {
          this.targetEyeTiltDeg = 0;
        }, 700);
        break;
    }
  }
}
