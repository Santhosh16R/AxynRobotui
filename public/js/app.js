/**
 * Robot Axyn Concierge - Main Application Controller
 */

class AxynApp {
  constructor() {
    this.ws = null;
    this.wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/robot`;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;

    // App State
    this.config = { robot: {}, maps: [] };
    this.activeMap = null;
    this.robotState = {
      x: 0,
      y: 0,
      theta: 0,
      linearVelocity: 0,
      angularVelocity: 0,
      battery: 100,
      batteryVoltage: 24.0,
      isCharging: false,
      state: 'CONNECTING',
      target: null,
      path: [],
      distanceRemaining: 0,
      estimatedTimeSec: 0,
      lidarScan: [],
      estopActive: false
    };

    // Sub-systems
    this.face = new RobotFace(this);
    this.openaiRealtime = new OpenAIRealtimeClient(this);
    this.voice = new VoiceAssistant(this);
    this.map = new MapEngine(this);
    this.robot = new RobotManager(this);
    this.teleop = new TeleoperationController(this);

    // DOM Elements
    this.dom = {
      mapSelect: document.getElementById('mapSelect'),
      btnDock: document.getElementById('btnDock'),
      btnEstop: document.getElementById('btnEstop'),
      poisList: document.getElementById('poisList'),
      logsStream: document.getElementById('logsStream'),
      btnClearLogs: document.getElementById('btnClearLogs'),
      // Layout & Mode Toggles
      mainLayout: document.getElementById('mainLayout'),
      btnToggleFullscreenFace: document.getElementById('btnToggleFullscreenFace'),
      fullscreenBtnText: document.getElementById('fullscreenBtnText'),
      btnMinimizeMap: document.getElementById('btnMinimizeMap'),
      btnFloatingExpandMap: document.getElementById('btnFloatingExpandMap'),

      // Modals
      addPoiModal: document.getElementById('addPoiModal'),
      btnClosePoiModal: document.getElementById('btnClosePoiModal'),
      btnCancelPoi: document.getElementById('btnCancelPoi'),
      btnOpenAddPoiModal: document.getElementById('btnOpenAddPoiModal'),
      addPoiForm: document.getElementById('addPoiForm'),
      poiName: document.getElementById('poiName'),
      poiCategory: document.getElementById('poiCategory'),
      poiColor: document.getElementById('poiColor'),
      poiX: document.getElementById('poiX'),
      poiY: document.getElementById('poiY'),
      poiDescription: document.getElementById('poiDescription'),

      // Floating System Logs Console
      floatingLogsWidget: document.getElementById('floatingLogsWidget'),
      logsWidgetHeader: document.getElementById('logsWidgetHeader'),
      btnToggleMinimizeLogs: document.getElementById('btnToggleMinimizeLogs'),
      btnFloatingClearLogs: document.getElementById('btnFloatingClearLogs'),
      floatingLogsStream: document.getElementById('floatingLogsStream'),
      floatingLogCount: document.getElementById('floatingLogCount'),
      minBtnText: document.getElementById('minBtnText'),
      minimizeIcon: document.getElementById('minimizeIcon'),

      // Avatar Switcher Elements
      btnViewFace: document.getElementById('btnViewFace'),
      btnViewOrb: document.getElementById('btnViewOrb'),
      robotFace: document.getElementById('robotFace'),
      voiceOrbWrapper: document.getElementById('voiceOrbWrapper'),

      // OpenAI Realtime Settings Elements
      openaiSettingsModal: document.getElementById('openaiSettingsModal'),
      btnCloseOpenAiModal: document.getElementById('btnCloseOpenAiModal'),
      btnCancelOpenAiSettings: document.getElementById('btnCancelOpenAiSettings'),
      openaiSettingsForm: document.getElementById('openaiSettingsForm'),
      openaiApiKey: document.getElementById('openaiApiKey'),
      openaiVoiceSelect: document.getElementById('openaiVoiceSelect'),
      btnOpenAiSettings: document.getElementById('btnOpenAiSettings'),

      // Unified Settings & Map Editor DOM
      btnOpenSettings: document.getElementById('btnOpenSettings'),
      settingsModal: document.getElementById('settingsModal'),
      btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
      btnCancelSettings: document.getElementById('btnCancelSettings'),
      btnLaunchCanvasEditor: document.getElementById('btnLaunchCanvasEditor'),
      mapPropertiesForm: document.getElementById('mapPropertiesForm'),
      editMapName: document.getElementById('editMapName'),
      editMapId: document.getElementById('editMapId'),
      editMapWidth: document.getElementById('editMapWidth'),
      editMapHeight: document.getElementById('editMapHeight'),
      editDockName: document.getElementById('editDockName'),
      editDockX: document.getElementById('editDockX'),
      editDockY: document.getElementById('editDockY'),
      editorPoisTbody: document.getElementById('editorPoisTbody'),
      editorWallsTbody: document.getElementById('editorWallsTbody'),
      editorPoiCount: document.getElementById('editorPoiCount'),
      editorWallCount: document.getElementById('editorWallCount'),
      btnEditorAddPoi: document.getElementById('btnEditorAddPoi'),
      btnEditorAddWallModal: document.getElementById('btnEditorAddWallModal'),
      addWallModal: document.getElementById('addWallModal'),
      btnCloseWallModal: document.getElementById('btnCloseWallModal'),
      btnCancelWallModal: document.getElementById('btnCancelWallModal'),
      addWallForm: document.getElementById('addWallForm'),
      btnExportMapJson: document.getElementById('btnExportMapJson'),
      inputImportMapJson: document.getElementById('inputImportMapJson'),
      btnTriggerImportMapJson: document.getElementById('btnTriggerImportMapJson'),
      btnResetMapDefault: document.getElementById('btnResetMapDefault'),
      voiceSettingsForm: document.getElementById('voiceSettingsForm'),
      openaiApiKeySettings: document.getElementById('openaiApiKeySettings'),
      openaiVoiceSelectSettings: document.getElementById('openaiVoiceSelectSettings'),
      facilityKnowledgeBase: document.getElementById('facilityKnowledgeBase'),
      robotKinematicsForm: document.getElementById('robotKinematicsForm'),
      robotMaxSpeed: document.getElementById('robotMaxSpeed'),
      robotMaxTurn: document.getElementById('robotMaxTurn'),
      robotSafetyRadius: document.getElementById('robotSafetyRadius'),
      robotAcceleration: document.getElementById('robotAcceleration'),

      toastContainer: document.getElementById('toastContainer')
    };

    this.totalLogsCount = 0;
    this.isLogsMinimized = false;
    this.isMapMinimized = false;

    this.initWebSocket();
    this.initTabs();
    this.initHeaderControls();
    this.initLayoutControls();
    this.initPoiModals();
    this.initFloatingLogs();
    this.initOpenAiSettingsModal();
    this.initAvatarToggle();
    this.initSettingsModal();
  }

  initAvatarToggle() {
    if (!this.dom.btnViewFace || !this.dom.btnViewOrb) return;

    this.dom.btnViewFace.addEventListener('click', () => {
      this.dom.btnViewFace.classList.add('active');
      this.dom.btnViewOrb.classList.remove('active');
      if (this.dom.robotFace) this.dom.robotFace.style.display = 'flex';
      if (this.dom.voiceOrbWrapper) this.dom.voiceOrbWrapper.style.display = 'none';
      this.showToast('Switched to Robotic Face Display', 'info');
    });

    this.dom.btnViewOrb.addEventListener('click', () => {
      this.dom.btnViewOrb.classList.add('active');
      this.dom.btnViewFace.classList.remove('active');
      if (this.dom.robotFace) this.dom.robotFace.style.display = 'none';
      if (this.dom.voiceOrbWrapper) this.dom.voiceOrbWrapper.style.display = 'flex';
      this.showToast('Switched to Voice Orb Visualizer', 'info');
    });
  }

  // ==========================================
  // WEBSOCKET TELEMETRY CLIENT
  // ==========================================
  initWebSocket() {
    console.log(`Connecting to WebSocket: ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket Connected to Axyn Robot Server');
      this.reconnectAttempts = 0;
      this.showToast('Connected to Axyn Robot Server', 'success');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    this.ws.onclose = () => {
      console.warn('WebSocket connection lost. Reconnecting...');
      this.robotState.state = 'DISCONNECTED';
      this.robot.updateTelemetry(this.robotState);
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(5000, 1000 * this.reconnectAttempts);
      setTimeout(() => this.initWebSocket(), delay);
    }
  }

  sendWebSocketCommand(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.showToast('Not connected to robot server', 'error');
    }
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'init':
        this.config = msg.config;
        this.activeMap = msg.config.activeMap;
        this.robotState = Object.assign(this.robotState, msg.robot);
        this.populateMapDropdown(msg.config.maps);
        this.renderPoisList();
        this.map.resetView();
        this.robot.updateTelemetry(this.robotState);
        if (msg.logs) {
          msg.logs.reverse().forEach(log => this.appendLog(log));
        }
        break;

      case 'telemetry':
        this.robotState = Object.assign(this.robotState, msg.robot);
        this.robot.updateTelemetry(this.robotState);
        break;

      case 'map_changed':
        this.activeMap = msg.activeMap;
        this.robotState = Object.assign(this.robotState, msg.robot);
        this.dom.mapSelect.value = this.activeMap.id;
        this.renderPoisList();
        this.map.resetView();
        this.robot.updateTelemetry(this.robotState);
        this.showToast(`Switched map to ${this.activeMap.name}`, 'info');
        break;

      case 'poi_updated':
        if (this.activeMap) {
          this.activeMap.pois = msg.pois;
          this.renderPoisList();
        }
        break;

      case 'log':
        this.appendLog(msg.log);
        break;
    }
  }

  // ==========================================
  // NAVIGATION ACTIONS
  // ==========================================
  navigateTo(target) {
    if (this.robotState.estopActive) {
      this.showToast('Cannot navigate: Emergency Stop (E-STOP) is engaged!', 'error');
      return;
    }

    this.sendWebSocketCommand({
      action: 'navigate',
      target: {
        id: target.id || 'custom-target',
        name: target.name || 'Waypoint',
        x: target.x,
        y: target.y,
        theta: target.theta
      }
    });

    this.showToast(`Navigating to ${target.name || 'target point'}...`, 'info');
  }

  triggerEstop() {
    this.sendWebSocketCommand({ action: 'estop' });
  }

  // ==========================================
  // HEADER CONTROLS
  // ==========================================
  initHeaderControls() {
    // Floorplan Map Switcher
    this.dom.mapSelect.addEventListener('change', (e) => {
      const mapId = e.target.value;
      this.sendWebSocketCommand({ action: 'selectMap', mapId });
    });

    // Return to Dock
    this.dom.btnDock.addEventListener('click', () => {
      this.sendWebSocketCommand({ action: 'dock' });
      this.voice.respond('Returning to autonomous charging dock.', 'navigating');
    });

    // Emergency Stop
    this.dom.btnEstop.addEventListener('click', () => {
      this.triggerEstop();
      if (!this.robotState.estopActive) {
        this.voice.respond('Emergency stop engaged immediately!', 'estop');
      } else {
        this.voice.respond('Emergency stop released.', 'success');
      }
    });
  }

  populateMapDropdown(maps) {
    this.dom.mapSelect.innerHTML = '';
    maps.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (this.activeMap && this.activeMap.id === m.id) {
        opt.selected = true;
      }
      this.dom.mapSelect.appendChild(opt);
    });
  }

  // ==========================================
  // LAYOUT CONTROLS & FULLSCREEN FACE MODE
  // ==========================================
  initLayoutControls() {
    // 1. Minimize Map Button (in map header)
    if (this.dom.btnMinimizeMap) {
      this.dom.btnMinimizeMap.addEventListener('click', () => {
        this.setMapMinimized(true);
      });
    }

    // 2. Floating Expand Map Button (shown on fullscreen face)
    if (this.dom.btnFloatingExpandMap) {
      this.dom.btnFloatingExpandMap.addEventListener('click', () => {
        this.setMapMinimized(false);
      });
    }

    // 3. Header Fullscreen / Split Toggle Button
    if (this.dom.btnToggleFullscreenFace) {
      this.dom.btnToggleFullscreenFace.addEventListener('click', () => {
        const willMinimize = !this.isMapMinimized;
        this.setMapMinimized(willMinimize);

        // Also enter native browser fullscreen if entering full face mode
        if (willMinimize && !document.fullscreenElement) {
          try {
            document.documentElement.requestFullscreen().catch(() => {});
          } catch (e) {}
        }
      });
    }

    // Keyboard shortcut F or F11 listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    });
  }

  setMapMinimized(minimized) {
    this.isMapMinimized = Boolean(minimized);

    if (this.isMapMinimized) {
      if (this.dom.mainLayout) this.dom.mainLayout.classList.add('map-minimized');
      if (this.dom.robotFace) this.dom.robotFace.classList.add('face-fullscreen-mode');
      if (this.dom.btnFloatingExpandMap) this.dom.btnFloatingExpandMap.style.display = 'flex';
      if (this.dom.fullscreenBtnText) this.dom.fullscreenBtnText.textContent = 'Split View';
      this.showToast('Full-screen Robot Face Mode Active', 'info');
    } else {
      if (this.dom.mainLayout) this.dom.mainLayout.classList.remove('map-minimized');
      if (this.dom.robotFace) this.dom.robotFace.classList.remove('face-fullscreen-mode');
      if (this.dom.btnFloatingExpandMap) this.dom.btnFloatingExpandMap.style.display = 'none';
      if (this.dom.fullscreenBtnText) this.dom.fullscreenBtnText.textContent = 'Full Face';
      this.showToast('Restored Split Navigation & Map View', 'info');

      // Allow CSS animation transition to finish before recalculating vector canvas matrix
      setTimeout(() => {
        if (this.map) {
          this.map.initCanvasSize();
          this.map.resetView();
        }
      }, 460);
    }
  }

  // ==========================================
  // TABS & NAVIGATION
  // ==========================================
  initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const pane = document.getElementById(targetTab);
        if (pane) pane.classList.add('active');

        // If switching back to Map tab, ensure canvas recalculates size
        if (targetTab === 'tab-map' && this.map) {
          setTimeout(() => {
            this.map.initCanvasSize();
            this.map.resetView();
          }, 50);
        }
      });
    });

    // Clear logs
    if (this.dom.btnClearLogs) {
      this.dom.btnClearLogs.addEventListener('click', () => {
        if (this.dom.logsStream) this.dom.logsStream.innerHTML = '';
        this.showToast('Audit logs cleared', 'info');
      });
    }
  }

  // ==========================================
  // POIS / DESTINATIONS DIRECTORY
  // ==========================================
  renderPoisList() {
    if (!this.activeMap || !this.activeMap.pois) return;
    this.dom.poisList.innerHTML = '';

    this.activeMap.pois.forEach(poi => {
      const card = document.createElement('div');
      card.className = 'poi-card';
      if (this.robotState.target && this.robotState.target.id === poi.id) {
        card.classList.add('active-target');
      }

      // Distance calculation from current robot position
      const dist = Math.hypot(poi.x - this.robotState.x, poi.y - this.robotState.y).toFixed(1);

      card.innerHTML = `
        <div class="poi-left">
          <div class="poi-icon-box" style="color: ${poi.color || '#00e5ff'}; background: ${poi.color ? poi.color + '22' : 'rgba(0, 229, 255, 0.1)'}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          <div class="poi-details">
            <span class="poi-name">${poi.name}</span>
            <span class="poi-category">${poi.category || 'Location'} • (${poi.x.toFixed(1)}m, ${poi.y.toFixed(1)}m)</span>
          </div>
        </div>
        <div class="poi-right">
          <span class="poi-dist-badge">${dist} m</span>
          <button class="btn-go-poi" title="Navigate here">Navigate</button>
        </div>
      `;

      card.querySelector('.btn-go-poi').addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigateTo(poi);
        this.voice.respond(`Navigating to ${poi.name}.`, 'navigating');
      });

      card.addEventListener('click', () => {
        this.map.panX = this.map.width / 2 - poi.x * this.map.meterToPx * this.map.zoom;
        this.map.panY = this.map.height / 2 - poi.y * this.map.meterToPx * this.map.zoom;
      });

      this.dom.poisList.appendChild(card);
    });
  }

  // ==========================================
  // POI CREATION MODAL
  // ==========================================
  initPoiModals() {
    this.dom.btnOpenAddPoiModal.addEventListener('click', () => {
      this.openAddPoiModal(
        parseFloat((this.activeMap.dimensions.width / 2).toFixed(1)),
        parseFloat((this.activeMap.dimensions.height / 2).toFixed(1))
      );
    });

    const closeModal = () => {
      this.dom.addPoiModal.style.display = 'none';
    };

    this.dom.btnClosePoiModal.addEventListener('click', closeModal);
    this.dom.btnCancelPoi.addEventListener('click', closeModal);

    this.dom.addPoiForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const poiData = {
        name: this.dom.poiName.value.trim(),
        category: this.dom.poiCategory.value,
        color: this.dom.poiColor.value,
        x: parseFloat(this.dom.poiX.value),
        y: parseFloat(this.dom.poiY.value),
        description: this.dom.poiDescription.value.trim()
      };

      this.sendWebSocketCommand({
        action: 'addPoi',
        poi: poiData
      });

      closeModal();
      this.showToast(`Created destination "${poiData.name}"`, 'success');
    });
  }

  openAddPoiModal(x, y) {
    this.dom.poiName.value = '';
    this.dom.poiDescription.value = '';
    this.dom.poiX.value = x;
    this.dom.poiY.value = y;
    this.dom.addPoiModal.style.display = 'flex';
    this.dom.poiName.focus();
  }

  // ==========================================
  // FLOATING LOGS CONSOLE (MINIMIZABLE)
  // ==========================================
  initFloatingLogs() {
    if (!this.dom.floatingLogsWidget) return;

    // Toggle minimize on button click
    this.dom.btnToggleMinimizeLogs.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimizeLogs();
    });

    // Toggle minimize on header click (except when clicking clear)
    this.dom.logsWidgetHeader.addEventListener('click', (e) => {
      if (e.target.closest('#btnFloatingClearLogs')) return;
      this.toggleMinimizeLogs();
    });

    // Clear floating logs
    this.dom.btnFloatingClearLogs.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dom.floatingLogsStream.innerHTML = '';
      this.dom.logsStream.innerHTML = '';
      this.totalLogsCount = 0;
      this.dom.floatingLogCount.textContent = '0';
      this.showToast('Console logs cleared', 'info');
    });
  }

  toggleMinimizeLogs() {
    this.isLogsMinimized = !this.isLogsMinimized;
    this.dom.floatingLogsWidget.classList.toggle('minimized', this.isLogsMinimized);
    if (this.dom.minBtnText) {
      this.dom.minBtnText.textContent = this.isLogsMinimized ? 'Expand' : 'Minimize';
    }
  }

  // ==========================================
  // LOGS & TOASTS
  // ==========================================
  appendLog(log) {
    this.totalLogsCount++;
    if (this.dom.floatingLogCount) {
      this.dom.floatingLogCount.textContent = this.totalLogsCount;
    }

    // 1. Append to sidebar tab stream
    if (this.dom.logsStream) {
      const entry = document.createElement('div');
      entry.className = `log-entry ${log.level || 'info'}`;
      entry.innerHTML = `
        <span class="log-time">[${log.timestamp}]</span>
        <span class="log-msg">${log.message}</span>
      `;
      this.dom.logsStream.insertBefore(entry, this.dom.logsStream.firstChild);

      if (this.dom.logsStream.children.length > 100) {
        this.dom.logsStream.removeChild(this.dom.logsStream.lastChild);
      }
    }

    // 2. Append to floating logs HUD stream
    if (this.dom.floatingLogsStream) {
      const row = document.createElement('div');
      row.className = `floating-log-row ${log.level || 'info'}`;
      row.innerHTML = `
        <span class="fl-time">[${log.timestamp}]</span>
        <span class="fl-msg">${log.message}</span>
      `;
      this.dom.floatingLogsStream.appendChild(row);

      // Auto-scroll to bottom of log stream
      const body = this.dom.floatingLogsWidget.querySelector('.logs-widget-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }

      if (this.dom.floatingLogsStream.children.length > 80) {
        this.dom.floatingLogsStream.removeChild(this.dom.floatingLogsStream.firstChild);
      }
    }
  }

  // ==========================================
  // OPENAI REALTIME SETTINGS & STATE
  // ==========================================
  initOpenAiSettingsModal() {
    if (!this.dom.openaiSettingsModal) return;

    if (this.dom.btnOpenAiSettings) {
      this.dom.btnOpenAiSettings.addEventListener('click', () => {
        this.openOpenAiSettingsModal();
      });
    }

    const closeModal = () => {
      this.dom.openaiSettingsModal.style.display = 'none';
    };

    if (this.dom.btnCloseOpenAiModal) {
      this.dom.btnCloseOpenAiModal.addEventListener('click', closeModal);
    }
    if (this.dom.btnCancelOpenAiSettings) {
      this.dom.btnCancelOpenAiSettings.addEventListener('click', closeModal);
    }

    if (this.dom.openaiSettingsForm) {
      this.dom.openaiSettingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = this.dom.openaiApiKey.value.trim();
        const voice = this.dom.openaiVoiceSelect.value;

        if (this.openaiRealtime) {
          this.openaiRealtime.setApiKey(key);
          this.openaiRealtime.setVoice(voice);
        }

        closeModal();
        this.showToast('✨ OpenAI Realtime Voice settings saved', 'success');
      });
    }
  }

  openOpenAiSettingsModal() {
    if (!this.dom.openaiSettingsModal) return;
    if (this.openaiRealtime) {
      this.dom.openaiApiKey.value = this.openaiRealtime.apiKey || '';
      this.dom.openaiVoiceSelect.value = this.openaiRealtime.voice || 'alloy';
    }
    this.dom.openaiSettingsModal.style.display = 'flex';
    this.dom.openaiApiKey.focus();
  }

  updateRealtimeUiState(state) {
    // state: 'connecting' | 'connected' | 'disconnected'
    const btnToggle = this.dom.btnVoiceToggle || document.getElementById('btnVoiceToggle');
    const stateTitle = document.getElementById('voiceStateTitle');
    const stateSubtitle = document.getElementById('voiceStateSubtitle');

    if (state === 'connecting') {
      if (stateTitle) stateTitle.textContent = 'Connecting WebRTC...';
      if (stateSubtitle) stateSubtitle.textContent = 'Establishing secure real-time channel with OpenAI GPT-4o';
    } else if (state === 'connected') {
      if (btnToggle) btnToggle.classList.add('active');
      if (stateTitle) stateTitle.textContent = 'GPT-4o Realtime Active';
      if (stateSubtitle) stateSubtitle.textContent = 'Speak naturally! Say "Take me to Reception" or ask questions';
    } else if (state === 'disconnected') {
      if (btnToggle) btnToggle.classList.remove('active');
      if (stateTitle) stateTitle.textContent = 'OpenAI Realtime Voice';
      if (stateSubtitle) stateSubtitle.textContent = 'Tap microphone to start real-time session';
    }
  }

  // ==========================================
  // UNIFIED SETTINGS & MAP CUSTOMIZER MODAL
  // ==========================================
  initSettingsModal() {
    if (!this.dom.settingsModal) return;

    // Open Settings Modal
    if (this.dom.btnOpenSettings) {
      this.dom.btnOpenSettings.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }

    const closeSettings = () => {
      this.dom.settingsModal.style.display = 'none';
    };

    if (this.dom.btnCloseSettingsModal) {
      this.dom.btnCloseSettingsModal.addEventListener('click', closeSettings);
    }
    if (this.dom.btnCancelSettings) {
      this.dom.btnCancelSettings.addEventListener('click', closeSettings);
    }

    // Settings Segmented Tabs
    const tabBtns = this.dom.settingsModal.querySelectorAll('.settings-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const panes = this.dom.settingsModal.querySelectorAll('.settings-pane');
        panes.forEach(pane => {
          pane.classList.toggle('active', pane.id === targetTab);
        });
      });
    });

    // Launch Interactive Canvas Editor from Settings
    if (this.dom.btnLaunchCanvasEditor) {
      this.dom.btnLaunchCanvasEditor.addEventListener('click', () => {
        closeSettings();
        if (this.map) {
          this.map.enterEditorMode();
        }
      });
    }

    // Map Properties Form Submit
    if (this.dom.mapPropertiesForm) {
      this.dom.mapPropertiesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.activeMap) return;

        this.activeMap.name = this.dom.editMapName.value.trim() || this.activeMap.name;
        this.activeMap.dimensions.width = parseFloat(this.dom.editMapWidth.value) || 50;
        this.activeMap.dimensions.height = parseFloat(this.dom.editMapHeight.value) || 35;
        this.activeMap.dock.name = this.dom.editDockName.value.trim() || 'Charging Dock';
        this.activeMap.dock.x = parseFloat(this.dom.editDockX.value) || 5.0;
        this.activeMap.dock.y = parseFloat(this.dom.editDockY.value) || 5.0;

        this.saveMapToServer();
      });
    }

    // Add Destination from Settings
    if (this.dom.btnEditorAddPoi) {
      this.dom.btnEditorAddPoi.addEventListener('click', () => {
        closeSettings();
        this.openAddPoiModal(8.0, 8.0);
      });
    }

    // Add Wall Barrier Modal
    if (this.dom.btnEditorAddWallModal) {
      this.dom.btnEditorAddWallModal.addEventListener('click', () => {
        if (this.dom.addWallModal) {
          this.dom.addWallModal.style.display = 'flex';
          const wallX = document.getElementById('wallX');
          const wallY = document.getElementById('wallY');
          if (wallX && wallY) {
            wallX.value = 10.0;
            wallY.value = 10.0;
          }
        }
      });
    }

    const closeWallModal = () => {
      if (this.dom.addWallModal) this.dom.addWallModal.style.display = 'none';
    };
    if (this.dom.btnCloseWallModal) this.dom.btnCloseWallModal.addEventListener('click', closeWallModal);
    if (this.dom.btnCancelWallModal) this.dom.btnCancelWallModal.addEventListener('click', closeWallModal);

    if (this.dom.addWallForm) {
      this.dom.addWallForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.activeMap) return;
        if (!this.activeMap.obstacles) this.activeMap.obstacles = [];

        const label = document.getElementById('wallLabel').value.trim() || 'Custom Wall';
        const x = parseFloat(document.getElementById('wallX').value) || 0;
        const y = parseFloat(document.getElementById('wallY').value) || 0;
        const w = parseFloat(document.getElementById('wallW').value) || 5;
        const h = parseFloat(document.getElementById('wallH').value) || 1;

        this.activeMap.obstacles.push({ x, y, w, h, type: 'wall', label });
        closeWallModal();
        this.showToast(`Added custom wall: ${label}`, 'success');
        this.updateSettingsEditorTables();
      });
    }

    // Voice Settings in Main Settings
    if (this.dom.voiceSettingsForm) {
      this.dom.voiceSettingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = this.dom.openaiApiKeySettings ? this.dom.openaiApiKeySettings.value.trim() : '';
        const voice = this.dom.openaiVoiceSelectSettings ? this.dom.openaiVoiceSelectSettings.value : 'alloy';
        const kb = this.dom.facilityKnowledgeBase ? this.dom.facilityKnowledgeBase.value.trim() : '';

        if (this.openaiRealtime) {
          this.openaiRealtime.setApiKey(key);
          this.openaiRealtime.setVoice(voice);
        }
        localStorage.setItem('axyn_knowledge_base', kb);

        if (this.activeMap) {
          this.activeMap.knowledgeBase = kb;
          this.saveMapToServer();
        }

        closeSettings();
        this.showToast('✨ Voice AI & Knowledge Base updated', 'success');
      });
    }

    // Robot Kinematics Form
    if (this.dom.robotKinematicsForm) {
      this.dom.robotKinematicsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          maxLinearSpeed: parseFloat(this.dom.robotMaxSpeed.value),
          maxAngularSpeed: parseFloat(this.dom.robotMaxTurn.value),
          radius: parseFloat(this.dom.robotSafetyRadius.value),
          acceleration: parseFloat(this.dom.robotAcceleration.value)
        };

        try {
          const res = await fetch('/api/robot/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const resData = await res.json();
          if (resData.success) {
            this.showToast('Robot kinematics parameters updated', 'success');
            closeSettings();
          }
        } catch (err) {
          this.showToast('Failed to update kinematics: ' + err.message, 'error');
        }
      });
    }

    // Export Map JSON
    if (this.dom.btnExportMapJson) {
      this.dom.btnExportMapJson.addEventListener('click', () => {
        this.exportMapJson();
      });
    }

    // Import Map JSON
    if (this.dom.btnTriggerImportMapJson && this.dom.inputImportMapJson) {
      this.dom.btnTriggerImportMapJson.addEventListener('click', () => {
        this.dom.inputImportMapJson.click();
      });

      this.dom.inputImportMapJson.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const importedMap = JSON.parse(ev.target.result);
            if (!importedMap.id || !importedMap.dimensions) {
              throw new Error('Invalid map schema. Missing "id" or "dimensions".');
            }
            this.activeMap = importedMap;
            this.saveMapToServer();
            this.populateSettingsFields();
            this.showToast(`Successfully imported map: ${importedMap.name}`, 'success');
          } catch (err) {
            this.showToast(`Import failed: ${err.message}`, 'error');
          }
        };
        reader.readAsText(file);
      });
    }

    // Reset Map Default
    if (this.dom.btnResetMapDefault) {
      this.dom.btnResetMapDefault.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset this floorplan back to default dimensions and walls?')) {
          this.resetMapDefault();
        }
      });
    }
  }

  openSettingsModal() {
    if (!this.dom.settingsModal) return;
    this.populateSettingsFields();
    this.dom.settingsModal.style.display = 'flex';
  }

  populateSettingsFields() {
    if (!this.activeMap) return;

    if (this.dom.editMapName) this.dom.editMapName.value = this.activeMap.name || '';
    if (this.dom.editMapId) this.dom.editMapId.value = this.activeMap.id || '';
    if (this.dom.editMapWidth) this.dom.editMapWidth.value = this.activeMap.dimensions.width;
    if (this.dom.editMapHeight) this.dom.editMapHeight.value = this.activeMap.dimensions.height;

    if (this.activeMap.dock) {
      if (this.dom.editDockName) this.dom.editDockName.value = this.activeMap.dock.name || 'Charging Dock';
      if (this.dom.editDockX) this.dom.editDockX.value = this.activeMap.dock.x;
      if (this.dom.editDockY) this.dom.editDockY.value = this.activeMap.dock.y;
    }

    if (this.openaiRealtime) {
      if (this.dom.openaiApiKeySettings) this.dom.openaiApiKeySettings.value = this.openaiRealtime.apiKey || '';
      if (this.dom.openaiVoiceSelectSettings) this.dom.openaiVoiceSelectSettings.value = this.openaiRealtime.voice || 'alloy';
    }

    if (this.dom.facilityKnowledgeBase) {
      this.dom.facilityKnowledgeBase.value = (this.activeMap && this.activeMap.knowledgeBase) || localStorage.getItem('axyn_knowledge_base') || '';
    }

    this.updateSettingsEditorTables();
  }

  updateSettingsEditorTables() {
    if (!this.activeMap) return;

    // 1. POIs Table
    const pois = this.activeMap.pois || [];
    if (this.dom.editorPoiCount) this.dom.editorPoiCount.textContent = pois.length;
    if (this.dom.editorPoisTbody) {
      this.dom.editorPoisTbody.innerHTML = '';
      pois.forEach((poi, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${poi.name}</strong></td>
          <td><span class="poi-category-badge">${poi.category || 'Point'}</span></td>
          <td>(${poi.x.toFixed(1)}m, ${poi.y.toFixed(1)}m)</td>
          <td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${poi.color || '#00e5ff'};"></span></td>
          <td>
            <button class="table-action-btn btn-del" data-poi-idx="${index}">Delete</button>
          </td>
        `;

        tr.querySelector('.btn-del').addEventListener('click', () => {
          this.activeMap.pois.splice(index, 1);
          this.showToast(`Deleted ${poi.name}`, 'info');
          this.renderPoisList();
          this.updateSettingsEditorTables();
        });

        this.dom.editorPoisTbody.appendChild(tr);
      });
    }

    // 2. Walls / Obstacles Table
    const obs = this.activeMap.obstacles || [];
    if (this.dom.editorWallCount) this.dom.editorWallCount.textContent = obs.length;
    if (this.dom.editorWallsTbody) {
      this.dom.editorWallsTbody.innerHTML = '';
      obs.forEach((wall, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${wall.label || 'Wall Segment'}</td>
          <td>${wall.type || 'wall'}</td>
          <td>X:${wall.x.toFixed(1)}, Y:${wall.y.toFixed(1)}, W:${wall.w.toFixed(1)}, H:${wall.h.toFixed(1)}</td>
          <td>
            <button class="table-action-btn btn-del" data-wall-idx="${index}">Delete</button>
          </td>
        `;

        tr.querySelector('.btn-del').addEventListener('click', () => {
          this.activeMap.obstacles.splice(index, 1);
          this.showToast(`Deleted ${wall.label || 'Wall'}`, 'info');
          this.updateSettingsEditorTables();
        });

        this.dom.editorWallsTbody.appendChild(tr);
      });
    }
  }

  async saveMapToServer() {
    if (!this.activeMap) return;

    try {
      const res = await fetch('/api/maps/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.activeMap)
      });
      const data = await res.json();
      if (data.success) {
        this.activeMap = data.activeMap;
        if (this.map) this.map.resetView();
        this.renderPoisList();
        this.showToast(`💾 Custom Map "${this.activeMap.name}" saved successfully!`, 'success');
      } else {
        this.showToast(`Error saving map: ${data.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Failed to save map: ${err.message}`, 'error');
    }
  }

  exportMapJson() {
    if (!this.activeMap) return;
    const jsonStr = JSON.stringify(this.activeMap, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.activeMap.id || 'floorplan'}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('📥 Floorplan exported to JSON file', 'success');
  }

  async resetMapDefault() {
    if (!this.config || !this.config.maps || this.config.maps.length === 0) return;
    const defaultTemplate = this.config.maps[0];
    if (!defaultTemplate) return;

    this.activeMap = JSON.parse(JSON.stringify(defaultTemplate));
    await this.saveMapToServer();
    this.populateSettingsFields();
    this.showToast('↺ Floorplan reset to default layout', 'info');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Start Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AxynApp();
});
