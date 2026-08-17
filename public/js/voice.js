/**
 * Robot Axyn Concierge - Voice Recognition & Audio Feedback Module
 * Supports:
 * 1. OpenAI Realtime Voice API (GPT-4o WebRTC speech-to-speech with Function Calling)
 * 2. Browser Web Speech API (Local STT & TTS fallback)
 * 3. Web Audio synthesizers for UI acoustic cues.
 */

class VoiceAssistant {
  constructor(app) {
    this.app = app;
    const storedEngine = localStorage.getItem('axyn_voice_engine');
    const hasOpenAiKey = Boolean(localStorage.getItem('axyn_openai_key'));
    // Default to webspeech if no OpenAI key is configured yet
    this.engine = storedEngine ? storedEngine : (hasOpenAiKey ? 'openai' : 'webspeech');
    this.isListening = false;
    this.ttsEnabled = true;
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.audioCtx = null;

    this.dom = {
      card: document.querySelector('.voice-assistant-card'),
      btnToggle: document.getElementById('btnVoiceToggle'),
      btnTts: document.getElementById('btnTtsToggle'),
      btnEngineOpenai: document.getElementById('btnEngineOpenai'),
      btnEngineWebSpeech: document.getElementById('btnEngineWebSpeech'),
      btnOpenAiSettings: document.getElementById('btnOpenAiSettings'),
      stateTitle: document.getElementById('voiceStateTitle'),
      stateSubtitle: document.getElementById('voiceStateSubtitle'),
      userQueryRow: document.getElementById('userQueryRow'),
      userQueryText: document.getElementById('userQueryText'),
      robotReplyRow: document.getElementById('robotReplyRow'),
      robotReplyText: document.getElementById('robotReplyText'),
      textForm: document.getElementById('textCommandForm'),
      textInput: document.getElementById('textCommandInput'),
      chipsContainer: document.getElementById('quickPromptChips')
    };

    this.initAudioContext();
    this.initSpeechRecognition();
    this.initEngineSelector();
    this.initEventHandlers();
  }

  initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  playChime(type = 'listen') {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (type === 'listen') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'navigating') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'estop') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(240, now + 0.15);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }

  // ==========================================
  // ENGINE SWITCHER (OPENAI vs LOCAL)
  // ==========================================
  initEngineSelector() {
    this.setEngine(this.engine, false);

    if (this.dom.btnEngineOpenai) {
      this.dom.btnEngineOpenai.addEventListener('click', () => {
        this.setEngine('openai');
      });
    }

    if (this.dom.btnEngineWebSpeech) {
      this.dom.btnEngineWebSpeech.addEventListener('click', () => {
        this.setEngine('webspeech');
      });
    }
  }

  setEngine(newEngine, showToastMsg = true) {
    this.engine = newEngine;
    localStorage.setItem('axyn_voice_engine', newEngine);

    if (this.dom.btnEngineOpenai && this.dom.btnEngineWebSpeech) {
      this.dom.btnEngineOpenai.classList.toggle('active', newEngine === 'openai');
      this.dom.btnEngineWebSpeech.classList.toggle('active', newEngine === 'webspeech');
    }

    if (newEngine === 'openai') {
      const hasKey = Boolean(localStorage.getItem('axyn_openai_key'));
      this.dom.stateTitle.textContent = 'OpenAI Realtime Voice';
      this.dom.stateSubtitle.textContent = hasKey ? 'Tap to start live GPT-4o voice conversation' : 'Requires OpenAI API Key in settings';
      if (showToastMsg) {
        this.app.showToast('Switched to OpenAI Realtime Voice (GPT-4o)', 'info');
      }
    } else {
      if (this.app.openaiRealtime && this.app.openaiRealtime.isConnected) {
        this.app.openaiRealtime.disconnect();
      }
      this.dom.stateTitle.textContent = 'Native Web Speech Mode';
      this.dom.stateSubtitle.textContent = 'Tap microphone to speak destination';
      if (showToastMsg) {
        this.app.showToast('Switched to Local Web Speech Recognition', 'info');
      }
    }
  }

  // ==========================================
  // LOCAL WEB SPEECH API
  // ==========================================
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.setListeningState(true);
        this.playChime('listen');
      };

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (interimTranscript) {
          this.displayUserTranscript(interimTranscript);
        }

        if (finalTranscript) {
          this.handleUserVoiceInput(finalTranscript);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.app.showToast('Microphone access blocked. Please allow mic permissions in your browser URL bar.', 'error');
        } else if (event.error === 'no-speech') {
          this.app.showToast('No speech detected. Please speak clearly into your mic.', 'warn');
        } else if (event.error === 'network') {
          this.app.showToast('Speech recognition network error. Please check your connection.', 'error');
        }
        this.setListeningState(false);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.setListeningState(false);
      };
    } catch (e) {
      console.error('Failed to initialize SpeechRecognition:', e);
    }
  }

  async startListening() {
    // Proactively request browser microphone permission
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        console.warn('Microphone permission error:', err);
        this.app.showToast('Microphone permission denied. Please allow microphone access.', 'error');
        this.setListeningState(false);
        return;
      }
    }

    if (!this.recognition) {
      this.initSpeechRecognition();
    }

    if (!this.recognition) {
      this.app.showToast('Speech Recognition is not supported by this browser. Please use Chrome or Edge.', 'error');
      return;
    }

    try {
      this.recognition.start();
      this.isListening = true;
      this.setListeningState(true);
    } catch (e) {
      console.warn('Speech recognition start error (may already be running):', e);
    }
  }

  stopListening() {
    this.isListening = false;
    this.setListeningState(false);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  // ==========================================
  // UI STATE TRANSITIONS
  // ==========================================
  setListeningState(listening) {
    if (listening) {
      this.dom.card.classList.add('listening');
      this.dom.btnToggle.classList.add('active');
      this.dom.stateTitle.textContent = 'Listening...';
      this.dom.stateSubtitle.textContent = 'Speak your destination or command clearly';
      if (this.app.face) this.app.face.setExpression('listening');
    } else {
      this.dom.card.classList.remove('listening');
      if (this.engine !== 'openai' || !this.app.openaiRealtime || !this.app.openaiRealtime.isConnected) {
        this.dom.btnToggle.classList.remove('active');
        this.dom.stateTitle.textContent = this.engine === 'openai' ? 'OpenAI Realtime Voice' : 'Ready to Listen';
        this.dom.stateSubtitle.textContent = 'Tap microphone and ask for a destination';
      }
      if (this.app.face) this.app.face.setExpression('idle');
    }
  }

  setSpeakingState(speaking) {
    if (speaking) {
      this.dom.card.classList.add('speaking');
      this.dom.stateTitle.textContent = 'Axyn Speaking...';
      if (this.app.face) this.app.face.setExpression('speaking');
    } else {
      this.dom.card.classList.remove('speaking');
      if (!this.isListening) {
        this.dom.stateTitle.textContent = this.engine === 'openai' ? 'OpenAI Realtime Voice' : 'Ready to Listen';
        if (this.app.face) this.app.face.setExpression('idle');
      }
    }
  }

  displayUserTranscript(text) {
    this.dom.userQueryRow.style.display = 'flex';
    this.dom.userQueryText.textContent = `"${text}"`;
  }

  appendRobotTranscript(delta) {
    this.dom.robotReplyRow.style.display = 'flex';
    if (!this.isRobotSpeakingStreaming) {
      this.dom.robotReplyText.textContent = delta;
      this.isRobotSpeakingStreaming = true;
    } else {
      this.dom.robotReplyText.textContent += delta;
    }
  }

  async toggleVoiceActivation() {
    const hasOpenAiKey = Boolean(localStorage.getItem('axyn_openai_key'));

    // If currently in OpenAI mode but no API key is configured, fallback to Web Speech smoothly
    if (this.engine === 'openai' && !hasOpenAiKey) {
      this.setEngine('webspeech', false);
      this.app.showToast('No OpenAI API Key set. Using Native Web Speech mode.', 'info');
    }

    if (this.engine === 'openai' && hasOpenAiKey) {
      if (!this.app.openaiRealtime) return;

      if (this.app.openaiRealtime.isConnecting) {
        this.app.showToast('Connecting in progress, please wait a moment...', 'info');
        return;
      }

      if (this.app.openaiRealtime.isConnected) {
        // Toggle mic mute/unmute without resetting connection
        this.app.openaiRealtime.toggleMute();
      } else {
        this.app.openaiRealtime.connect();
      }
      return;
    }

    // Native Web Speech
    if (this.isListening) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  handleUserVoiceInput(transcript) {
    if (!transcript || !transcript.trim()) return;
    this.displayUserTranscript(transcript);
    this.isRobotSpeakingStreaming = false;
    this.processCommand(transcript);
  }

  processCommand(commandText) {
    const apiKey = localStorage.getItem('axyn_openai_key') || '';
    // Send to advanced conversational NLP processor
    fetch('/api/voice-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: commandText, apiKey: apiKey })
    })
      .then(res => res.json())
      .then(data => {
        if (data.action === 'estop') {
          this.app.triggerEstop();
        } else if (data.action === 'navigate' && data.target) {
          this.app.navigateTo(data.target);
        }

        if (data.speech) {
          const chime = data.action === 'estop' ? 'estop' : (data.action === 'navigate' ? 'navigating' : 'success');
          this.respond(data.speech, chime);
        }
      })
      .catch(() => {
        this.respond(`I heard "${commandText}". I can converse with you or escort you anywhere on the floorplan. Where would you like to go?`, 'success');
      });
  }

  respond(text, chimeType = 'success') {
    this.dom.robotReplyRow.style.display = 'flex';
    this.dom.robotReplyText.textContent = text;
    this.playChime(chimeType);

    if (this.ttsEnabled && this.synthesis) {
      this.synthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      const voices = this.synthesis.getVoices();
      const naturalVoice = voices.find(v => (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en'));

      if (naturalVoice) utterance.voice = naturalVoice;

      this.setSpeakingState(true);
      utterance.onend = () => this.setSpeakingState(false);
      utterance.onerror = () => this.setSpeakingState(false);
      this.synthesis.speak(utterance);
    }
  }

  initEventHandlers() {
    this.dom.btnToggle.addEventListener('click', () => {
      this.toggleVoiceActivation();
    });

    this.dom.btnTts.addEventListener('click', () => {
      this.ttsEnabled = !this.ttsEnabled;
      this.dom.btnTts.classList.toggle('active', this.ttsEnabled);
      this.dom.btnTts.querySelector('span').textContent = `Voice Audio: ${this.ttsEnabled ? 'ON' : 'OFF'}`;
      if (!this.ttsEnabled && this.synthesis) this.synthesis.cancel();
    });

    this.dom.chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.prompt-chip');
      if (chip && chip.dataset.cmd) {
        const cmd = chip.dataset.cmd;
        if (this.engine === 'openai' && this.app.openaiRealtime && this.app.openaiRealtime.isConnected) {
          this.app.openaiRealtime.sendEvent({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: cmd }]
            }
          });
          this.app.openaiRealtime.sendEvent({ type: 'response.create' });
          this.displayUserTranscript(cmd);
        } else {
          this.handleUserVoiceInput(cmd);
        }
      }
    });

    if (this.dom.textForm && this.dom.textInput) {
      this.dom.textForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = this.dom.textInput.value.trim();
        if (val) {
          if (this.engine === 'openai' && this.app.openaiRealtime && this.app.openaiRealtime.isConnected) {
            this.app.openaiRealtime.sendEvent({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: val }]
              }
            });
            this.app.openaiRealtime.sendEvent({ type: 'response.create' });
            this.displayUserTranscript(val);
          } else {
            this.handleUserVoiceInput(val);
          }
          this.dom.textInput.value = '';
        }
      });
    }
  }
}
