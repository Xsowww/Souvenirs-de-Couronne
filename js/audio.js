// Audio system for Souvenirs de Couronne
// Uses Web Audio API for procedural music and sound effects

const AudioManager = {
    _ctx: null,
    _musicGain: null,
    _sfxGain: null,
    _musicVolume: 0.5,
    _sfxVolume: 0.7,
    _musicPlaying: false,
    _musicNodes: [],
    _musicInterval: null,
    _initialized: false,

    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Load saved volumes
        try {
            const savedMusic = localStorage.getItem('sdc_vol_music');
            const savedSfx = localStorage.getItem('sdc_vol_sfx');
            if (savedMusic !== null) this._musicVolume = parseInt(savedMusic) / 100;
            if (savedSfx !== null) this._sfxVolume = parseInt(savedSfx) / 100;
        } catch(e) {}

        // Sync slider values
        const sliders = ['opt-music', 'pause-opt-music'];
        for (const id of sliders) {
            const el = document.getElementById(id);
            if (el) el.value = Math.round(this._musicVolume * 100);
        }
        const sfxSliders = ['opt-sfx', 'pause-opt-sfx'];
        for (const id of sfxSliders) {
            const el = document.getElementById(id);
            if (el) el.value = Math.round(this._sfxVolume * 100);
        }

        // Bind volume sliders
        for (const id of sliders) {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    this.setMusicVolume(parseInt(e.target.value) / 100);
                    // Sync other slider
                    for (const oid of sliders) {
                        if (oid !== id) {
                            const oel = document.getElementById(oid);
                            if (oel) oel.value = e.target.value;
                        }
                    }
                });
            }
        }
        for (const id of sfxSliders) {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    this.setSfxVolume(parseInt(e.target.value) / 100);
                    for (const oid of sfxSliders) {
                        if (oid !== id) {
                            const oel = document.getElementById(oid);
                            if (oel) oel.value = e.target.value;
                        }
                    }
                });
            }
        }
    },

    _ensureContext() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._musicGain = this._ctx.createGain();
            this._musicGain.gain.value = this._musicVolume * 0.3; // music is quieter
            this._musicGain.connect(this._ctx.destination);
            this._sfxGain = this._ctx.createGain();
            this._sfxGain.gain.value = this._sfxVolume;
            this._sfxGain.connect(this._ctx.destination);
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
    },

    setMusicVolume(vol) {
        this._musicVolume = Math.max(0, Math.min(1, vol));
        if (this._musicGain) {
            this._musicGain.gain.value = this._musicVolume * 0.3;
        }
        try { localStorage.setItem('sdc_vol_music', Math.round(this._musicVolume * 100)); } catch(e) {}
    },

    setSfxVolume(vol) {
        this._sfxVolume = Math.max(0, Math.min(1, vol));
        if (this._sfxGain) {
            this._sfxGain.gain.value = this._sfxVolume;
        }
        try { localStorage.setItem('sdc_vol_sfx', Math.round(this._sfxVolume * 100)); } catch(e) {}
    },

    // ==================== MUSIC ====================
    // Medieval ambient music using simple oscillators and pentatonic scale

    _SCALE: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25], // C pentatonic extended

    startMusic() {
        this._ensureContext();
        if (this._musicPlaying) return;
        this._musicPlaying = true;
        this._playAmbientLoop();
    },

    stopMusic() {
        this._musicPlaying = false;
        if (this._musicInterval) {
            clearInterval(this._musicInterval);
            this._musicInterval = null;
        }
        // Fade out existing nodes
        for (const n of this._musicNodes) {
            try { n.stop(); } catch(e) {}
        }
        this._musicNodes = [];
    },

    _playAmbientLoop() {
        if (!this._musicPlaying) return;

        const ctx = this._ctx;
        const playNote = (freq, startTime, duration, type) => {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.value = freq;
            env.gain.setValueAtTime(0, startTime);
            env.gain.linearRampToValueAtTime(0.15, startTime + 0.1);
            env.gain.linearRampToValueAtTime(0.08, startTime + duration * 0.5);
            env.gain.linearRampToValueAtTime(0, startTime + duration);
            osc.connect(env);
            env.connect(this._musicGain);
            osc.start(startTime);
            osc.stop(startTime + duration);
            this._musicNodes.push(osc);
        };

        const now = ctx.currentTime;
        const scale = this._SCALE;
        const barLen = 2.5; // seconds per bar

        // Generate a 4-bar ambient phrase
        for (let bar = 0; bar < 4; bar++) {
            const barStart = now + bar * barLen;

            // Bass drone (low octave)
            const bassIdx = bar % 2 === 0 ? 0 : 3;
            playNote(scale[bassIdx] / 2, barStart, barLen * 0.95, 'triangle');

            // Melody notes (2-3 per bar, from pentatonic)
            const notesInBar = 2 + Math.floor(Math.random() * 2);
            for (let n = 0; n < notesInBar; n++) {
                const noteStart = barStart + (n / notesInBar) * barLen + Math.random() * 0.2;
                const noteIdx = Math.floor(Math.random() * scale.length);
                const noteDur = 0.6 + Math.random() * 1.0;
                playNote(scale[noteIdx], noteStart, noteDur, 'sine');
            }

            // Pad chord (quiet)
            if (Math.random() > 0.4) {
                const chordRoot = scale[bar % scale.length];
                playNote(chordRoot * 0.5, barStart + 0.05, barLen * 0.8, 'sine');
                playNote(chordRoot * 0.75, barStart + 0.1, barLen * 0.7, 'sine');
            }
        }

        // Clean up old nodes
        this._musicNodes = this._musicNodes.filter(n => {
            try { return n.context.currentTime < n.stop; } catch(e) { return false; }
        });

        // Schedule next phrase
        const phraseLen = 4 * barLen * 1000;
        this._musicInterval = setTimeout(() => this._playAmbientLoop(), phraseLen - 200);
    },

    // ==================== SOUND EFFECTS ====================

    playBuild() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Hammer hit sound
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        env.gain.setValueAtTime(0.3, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(env);
        env.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);

        // Second tap
        const osc2 = ctx.createOscillator();
        const env2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(180, now + 0.12);
        osc2.frequency.exponentialRampToValueAtTime(60, now + 0.25);
        env2.gain.setValueAtTime(0.2, now + 0.12);
        env2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.connect(env2);
        env2.connect(this._sfxGain);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.3);
    },

    playDemolish() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Crash/crumble
        const noise = ctx.createBufferSource();
        const bufferSize = ctx.sampleRate * 0.4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        noise.buffer = buffer;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.25, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        noise.connect(filter);
        filter.connect(env);
        env.connect(this._sfxGain);
        noise.start(now);
    },

    playNotification() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Soft bell
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        env.gain.setValueAtTime(0.15, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.connect(env);
        env.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.5);
    },

    playClick() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 600;
        env.gain.setValueAtTime(0.12, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(env);
        env.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.08);
    },

    playUpgrade() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Rising notes
        const notes = [440, 554, 659];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = now + i * 0.12;
            env.gain.setValueAtTime(0.15, t);
            env.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.connect(env);
            env.connect(this._sfxGain);
            osc.start(t);
            osc.stop(t + 0.3);
        });
    },

    playNewDay() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Horn fanfare
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(293.66, now); // D4
        osc.frequency.setValueAtTime(392, now + 0.3); // G4
        osc.frequency.setValueAtTime(523.25, now + 0.6); // C5
        env.gain.setValueAtTime(0.08, now);
        env.gain.linearRampToValueAtTime(0.15, now + 0.1);
        env.gain.linearRampToValueAtTime(0.12, now + 0.6);
        env.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
        osc.connect(env);
        env.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 1.2);
    },

    playError() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.setValueAtTime(150, now + 0.1);
        env.gain.setValueAtTime(0.12, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(env);
        env.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);
    },

    playTrainingComplete() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Military trumpet
        const notes = [392, 523.25, 659.25, 783.99]; // G4 C5 E5 G5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            const t = now + i * 0.15;
            env.gain.setValueAtTime(0.08, t);
            env.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.connect(env);
            env.connect(this._sfxGain);
            osc.start(t);
            osc.stop(t + 0.25);
        });
    },

    playSave() {
        this._ensureContext();
        const ctx = this._ctx;
        const now = ctx.currentTime;

        // Quill scratch + chime
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1046.5; // C6
        env.gain.setValueAtTime(0.12, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(env);
        env.connect(this._sfxGain);
        osc.start(now);
        osc.stop(now + 0.3);

        const osc2 = ctx.createOscillator();
        const env2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 1318.5; // E6
        env2.gain.setValueAtTime(0.1, now + 0.15);
        env2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc2.connect(env2);
        env2.connect(this._sfxGain);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.45);
    }
};
