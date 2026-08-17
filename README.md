# 🤖 Robot Axyn Concierge

> Local Server & Modern Web Application for Autonomous Robot Navigation, Interactive 2D Vector Mapping, and Voice Concierge Assistance. Built with **Node.js 16+**, HTML5 Canvas, Web Speech API, and WebSockets.

---

## 🌟 Key Features

1. **Interactive Vector Floorplan Engine**:
   - High-performance HTML5 Canvas with smooth Pan, Zoom, and Auto-fit.
   - **Click-to-Navigate**: Tap anywhere on the floorplan to immediately compute obstacle-free A* paths and dispatch the robot.
   - **Waypoint Management**: Create, edit, and categorize custom Points of Interest (POIs) with visual marker pins.
   - **Dynamic LIDAR & Path Visualization**: 360° laser scanning pointcloud rays and animated trajectory light pulses.

2. **Voice Concierge Assistant**:
   - **Speech-to-Text Recognition**: Speak natural commands like *"Take me to Reception"*, *"Executive Boardroom"*, *"Where is the Cafeteria?"*, or *"Return to Dock"*.
   - **Interactive Voice Orb**: Animated visualizer reacting dynamically to idle, listening, and speaking states.
   - **Spoken Audio Feedback (TTS)**: Welcomes visitors, confirms navigation targets, and reports battery & coordinates.
   - **Audio Chimes**: Built-in Web Audio API synthesizers for listening cues, navigation beeps, and arrival fanfares.

3. **Autonomous Navigation & Kinematics Engine**:
   - Collision-free A* grid routing with string-pulling smoothing against architectural walls and pillars.
   - Realistic kinematics: Heading rotation, linear velocity ramping, and safety proximity boundaries.
   - Autonomous induction charging simulation when returning to dock.

4. **Kiosk & Teleoperation Dashboard**:
   - Real-time telemetry: Live coordinates $(x, y, \theta)$, Speedometer, Battery Voltage & Percentage.
   - Floating Navigation Drawer: Real-time Distance Remaining, Estimated Time of Arrival (ETA), Pause/Resume, and Cancel.
   - **Virtual Joystick & D-Pad**: Manual override steering with touch, mouse, or keyboard (W/A/S/D).
   - **Hardware-Level Emergency Stop (E-STOP)**: Immediate motor halt with visual alarm rings.
   - Multi-map switching (Corporate Tech HQ vs. Metropolitan Medical Center).

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 16.0.0+** installed
- Modern Web Browser (Google Chrome, Microsoft Edge, Firefox, or Safari) with microphone permissions enabled for voice recognition.

### Quick Start
```bash
# 1. Install dependencies (Node.js 16+ compatible)
npm install

# 2. Start the local server
npm start
# or
node server.js
```

### Accessing the Web UI
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📡 API & WebSocket Specification

### WebSocket Endpoint
- **URL**: `ws://localhost:3000/ws/robot`
- **Broadcast Telemetry Rate**: 20 Hz (every 50 ms)
- **Message Types**:
  - `init`: Full map definition, robot config, initial position, and recent logs.
  - `telemetry`: High-frequency payload containing `(x, y, theta)`, `linearVelocity`, `angularVelocity`, `battery`, `state`, `path`, `distanceRemaining`, `lidarScan`.
  - `map_changed`: Floorplan switch notifications.
  - `poi_updated`: Real-time waypoint additions/removals.
  - `log`: Server audit log entries.

### REST Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Current robot telemetry and floorplan status |
| `GET` | `/api/maps` | List of available floorplans |
| `POST` | `/api/maps/select` | Switch active map `{ "mapId": "tech_hq" }` |
| `GET` | `/api/pois` | List destination POIs for active map |
| `POST` | `/api/pois` | Add a new POI `{ "name", "category", "x", "y", "color" }` |
| `DELETE` | `/api/pois/:id` | Remove a POI by ID |
| `POST` | `/api/navigate` | Dispatch navigation to target `{ "x", "y", "name" }` |
| `POST` | `/api/estop` | Toggle Emergency Stop |
| `POST` | `/api/dock` | Return robot to charging dock |
| `POST` | `/api/voice-command` | Process natural language voice command text |

---

## 🏗️ Project Architecture

```
Axynrobotinterface/
├── package.json         # Node.js 16 compatible configuration
├── config.json          # Robot physics, floorplans, obstacles & POIs
├── server.js            # Express + WebSocket server & A* navigation engine
├── README.md            # Documentation & setup instructions
└── public/
    ├── index.html       # Kiosk interface & HTML layout
    ├── css/
    │   ├── main.css     # Design system, glassmorphism theme & grid
    │   ├── map.css      # Canvas HUD, map drawer & floating tools
    │   └── voice.css    # Animated voice visualizer orb & chat styles
    └── js/
        ├── app.js       # App lifecycle & WebSocket client manager
        ├── map.js       # 2D Canvas vector mapping engine
        ├── robot.js     # Telemetry parser & HUD updater
        ├── voice.js     # Web Speech API & audio chime synthesizer
        └── teleop.js    # Virtual joystick & keyboard drive controller
```
