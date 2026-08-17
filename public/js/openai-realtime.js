/**
 * OpenAI Realtime Voice Client (WebRTC + Real-time Function Calling)
 * Ultra-low latency conversational voice agent with gpt-4o-realtime-preview.
 */

class OpenAIRealtimeClient {
  constructor(app) {
    this.app = app;
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteAudioEl = null;
    this.isConnected = false;
    this.isConnecting = false;

    // Config & Preferences
    this.apiKey = localStorage.getItem('axyn_openai_key') || '';
    this.voice = localStorage.getItem('axyn_openai_voice') || 'alloy';
    this.model = 'gpt-4o-realtime-preview-2024-12-17';

    this.initAudioElement();
  }

  initAudioElement() {
    this.remoteAudioEl = document.createElement('audio');
    this.remoteAudioEl.autoplay = true;
    document.body.appendChild(this.remoteAudioEl);
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    localStorage.setItem('axyn_openai_key', this.apiKey);
  }

  setVoice(voiceName) {
    this.voice = voiceName;
    localStorage.setItem('axyn_openai_voice', this.voice);
  }

  // ==========================================
  // WEBRTC CONNECTION LIFECYCLE
  // ==========================================
  async connect() {
    if (this.isConnected || this.isConnecting) return;

    if (!this.apiKey) {
      this.app.showToast('Please set your OpenAI API key in Voice Settings', 'warn');
      if (this.app.openOpenAiSettingsModal) {
        this.app.openOpenAiSettingsModal();
      }
      return false;
    }

    this.isConnecting = true;
    this.app.updateRealtimeUiState('connecting');
    this.app.showToast('Initializing OpenAI Realtime Voice WebRTC session...', 'info');

    try {
      // 1. Request Ephemeral Session Token from Server
      const sessionRes = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          voice: this.voice,
          model: this.model
        })
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json();
        throw new Error(errData.error || 'Failed to initialize session on server');
      }

      const sessionData = await sessionRes.json();
      const clientSecret = sessionData.client_secret ? sessionData.client_secret.value : null;

      if (!clientSecret) {
        throw new Error('No ephemeral client_secret received from OpenAI session endpoint');
      }

      // 2. Initialize WebRTC Peer Connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      // 3. Audio Stream Output Handler
      this.peerConnection.ontrack = (event) => {
        this.remoteAudioEl.srcObject = event.streams[0];
        this.app.updateRealtimeUiState('connected');
        this.app.voice.setSpeakingState(true);
      };

      // 4. Capture User Microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // 5. Create Data Channel for JSON events & function calling
      this.dataChannel = this.peerConnection.createDataChannel('oai-events');
      this.setupDataChannel(this.dataChannel);

      // 6. Create SDP Offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // 7. Exchange SDP Offer with OpenAI WebRTC Gateway
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const sdpResponse = await fetch(`${baseUrl}?model=${this.model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp'
        }
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`OpenAI SDP negotiation failed: ${errText}`);
      }

      const answerSdp = await sdpResponse.text();
      const answer = { type: 'answer', sdp: answerSdp };
      await this.peerConnection.setRemoteDescription(answer);

      this.isConnected = true;
      this.isConnecting = false;
      this.app.updateRealtimeUiState('connected');
      this.app.showToast('✨ Connected to OpenAI Realtime Voice (GPT-4o)', 'success');
      return true;
    } catch (err) {
      console.error('OpenAI Realtime WebRTC connection error:', err);
      this.disconnect();
      this.app.showToast(`OpenAI Realtime Error: ${err.message}`, 'error');
      return false;
    }
  }

  disconnect() {
    this.isConnected = false;
    this.isConnecting = false;

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
    }

    this.app.updateRealtimeUiState('disconnected');
    this.app.voice.setSpeakingState(false);
  }

  // ==========================================
  // DATA CHANNEL & FUNCTION CALLING
  // ==========================================
  setupDataChannel(dc) {
    dc.onopen = () => {
      console.log('OpenAI Realtime DataChannel opened');
      this.sendInitialGreetingTrigger();
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleRealtimeServerEvent(msg);
      } catch (err) {
        console.error('Error parsing Realtime event:', err);
      }
    };

    dc.onclose = () => {
      console.log('OpenAI Realtime DataChannel closed');
      this.disconnect();
    };

    dc.onerror = (err) => {
      console.error('OpenAI DataChannel error:', err);
    };
  }

  sendInitialGreetingTrigger() {
    // Send response create to greet the user
    this.sendEvent({
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
        instructions: 'Greet the visitor warmly as the Axyn Concierge Robot and let them know you can escort them anywhere in the building.'
      }
    });
  }

  sendEvent(eventObj) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(eventObj));
    }
  }

  handleRealtimeServerEvent(event) {
    // 1. Transcription Events
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.transcript && this.app.voice) {
        this.app.voice.displayUserTranscript(event.transcript);
      }
    }

    if (event.type === 'response.audio_transcript.delta') {
      if (event.delta && this.app.voice) {
        this.app.voice.appendRobotTranscript(event.delta);
      }
    }

    // 2. Speech state changes
    if (event.type === 'input_audio_buffer.speech_started') {
      this.app.voice.setListeningState(true);
    }
    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.app.voice.setListeningState(false);
    }

    if (event.type === 'response.audio.done') {
      this.app.voice.setSpeakingState(false);
    }

    // 3. Real-Time Tool Calls (Function Execution)
    if (event.type === 'response.function_call_arguments.done') {
      this.executeToolCall(event.call_id, event.name, event.arguments);
    }
  }

  executeToolCall(callId, name, argsJson) {
    let args = {};
    try {
      args = JSON.parse(argsJson);
    } catch (e) {
      console.warn('Could not parse tool args:', argsJson);
    }

    console.log(`🤖 Executing OpenAI Realtime Tool Call: ${name}`, args);
    let toolResult = { success: true };

    switch (name) {
      case 'navigate_to':
        const destQuery = args.destination || '';
        const pois = this.app.activeMap ? this.app.activeMap.pois : [];
        let matchedPoi = null;

        for (const poi of pois) {
          if (destQuery.toLowerCase().includes(poi.name.toLowerCase()) ||
              poi.name.toLowerCase().includes(destQuery.toLowerCase())) {
            matchedPoi = poi;
            break;
          }
        }

        if (matchedPoi) {
          this.app.navigateTo(matchedPoi);
          toolResult = {
            success: true,
            message: `Dispatched navigation to ${matchedPoi.name}. Coordinates: (${matchedPoi.x}, ${matchedPoi.y})`,
            destination: matchedPoi.name
          };
        } else if (pois.length > 0) {
          // Fallback to first matching or custom target
          this.app.navigateTo(pois[0]);
          toolResult = {
            success: true,
            message: `Navigating to ${pois[0].name}.`,
            destination: pois[0].name
          };
        } else {
          toolResult = { success: false, error: `Could not locate destination "${destQuery}" on current map.` };
        }
        break;

      case 'emergency_stop':
        if (!this.app.robotState.estopActive) {
          this.app.triggerEstop();
        }
        toolResult = { success: true, message: 'Emergency Stop engaged immediately. Motors halted.' };
        break;

      case 'return_to_dock':
        if (this.app.activeMap && this.app.activeMap.dock) {
          this.app.navigateTo(this.app.activeMap.dock);
          toolResult = { success: true, message: `Returning to charging dock ${this.app.activeMap.dock.name}.` };
        } else {
          toolResult = { success: false, error: 'Dock not found' };
        }
        break;

      case 'get_robot_status':
        toolResult = {
          success: true,
          state: this.app.robotState.state,
          batteryPercent: Math.round(this.app.robotState.battery),
          voltage: this.app.robotState.batteryVoltage,
          isCharging: this.app.robotState.isCharging,
          location: {
            x: parseFloat(this.app.robotState.x.toFixed(1)),
            y: parseFloat(this.app.robotState.y.toFixed(1))
          },
          currentMap: this.app.activeMap ? this.app.activeMap.name : 'Unknown'
        };
        break;

      case 'list_destinations':
        toolResult = {
          success: true,
          destinations: (this.app.activeMap ? this.app.activeMap.pois : []).map(p => ({
            name: p.name,
            category: p.category,
            description: p.description
          }))
        };
        break;

      default:
        toolResult = { success: false, error: `Unknown tool: ${name}` };
        break;
    }

    // Return Tool Output Back to OpenAI Realtime Session
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(toolResult)
      }
    });

    // Trigger completion response so the model speaks the confirmation
    this.sendEvent({
      type: 'response.create'
    });
  }
}
