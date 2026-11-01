// Beat Runner - Procedural Multi-Genre Web Audio Engine
// Self-contained Web Audio synthesis with 4 dynamic stems & precision lookahead scheduling

import { GenreTheme, GENRES, GenreId } from './genres.ts';
import { intervalToFrequency } from './rhythm.ts';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isUnlocked = false;

  // Master Gain Nodes
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Dynamic Stems (Layers 0..3)
  private stemGains: GainNode[] = [];

  // Lookahead Scheduler
  private schedulerTimerId: number | null = null;
  private currentGenre: GenreTheme = GENRES.synthwave;
  private currentBpm = 116;
  private lookaheadMs = 25; // How frequently to call scheduling loop (ms)
  private scheduleAheadSec = 0.12; // How far ahead to schedule audio events (sec)
  private nextBeatToSchedule = 0;
  private songStartAudioTime = 0;
  private isPlaying = false;

  // Latency Compensation (seconds, positive = audio schedules earlier)
  private latencyOffsetSec = 0.0;

  // Groove meter (0.0 to 1.0) and fever state
  private grooveLevel = 0.0;

  // Noise Buffer for snares, hi-hats, and synth breath
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public async init(): Promise<void> {
    if (this.ctx && this.isUnlocked) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Create 4 dynamic stems:
      // Stem 0: Kick & Primary Pulse (always audible)
      // Stem 1: Snare / Clave / Hi-hats (Groove > 0.2)
      // Stem 2: Bassline (Groove > 0.45)
      // Stem 3: Harmony / Lead Arp (Groove > 0.7 - Fever)
      this.stemGains = [];
      for (let i = 0; i < 4; i++) {
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(i === 0 ? 1.0 : 0.0, this.ctx.currentTime);
        gain.connect(this.musicGain);
        this.stemGains.push(gain);
      }

      this.generateNoiseBuffer();
      this.isUnlocked = true;
    } catch (err) {
      console.warn('AudioContext failed to initialize:', err);
    }
  }

  private generateNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of pink/white noise
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise filtering approximation
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  public setLatencyOffset(offsetMs: number): void {
    this.latencyOffsetSec = offsetMs / 1000;
  }

  public getLatencyOffset(): number {
    return Math.round(this.latencyOffsetSec * 1000);
  }

  public setGenre(genreId: GenreId): void {
    this.currentGenre = GENRES[genreId];
    this.currentBpm = this.currentGenre.bpm;
  }

  public setGrooveLevel(level: number): void {
    this.grooveLevel = Math.max(0, Math.min(1, level));
    if (!this.ctx || this.stemGains.length < 4) return;

    const t = this.ctx.currentTime;
    const ramp = 0.08;

    // Stem 0: Kick (always full)
    this.stemGains[0].gain.setTargetAtTime(1.0, t, ramp);

    // Stem 1: Snare & Percussion (unmutes above 15% groove)
    const stem1Target = this.grooveLevel >= 0.15 ? 1.0 : Math.max(0.3, this.grooveLevel / 0.15);
    this.stemGains[1].gain.setTargetAtTime(stem1Target, t, ramp);

    // Stem 2: Bassline (unmutes above 40% groove)
    const stem2Target = this.grooveLevel >= 0.4 ? 1.0 : Math.max(0.0, (this.grooveLevel - 0.15) / 0.25);
    this.stemGains[2].gain.setTargetAtTime(stem2Target, t, ramp);

    // Stem 3: Lead & Shimmer (unmutes above 70% groove - Fever!)
    const stem3Target = this.grooveLevel >= 0.7 ? 1.0 : Math.max(0.0, (this.grooveLevel - 0.45) / 0.25);
    this.stemGains[3].gain.setTargetAtTime(stem3Target, t, ramp);
  }

  public startPlayback(startBeat = 0): void {
    if (!this.ctx) return;
    this.isPlaying = true;
    this.nextBeatToSchedule = startBeat;
    this.songStartAudioTime = this.ctx.currentTime - (startBeat * (60 / this.currentBpm));

    if (this.schedulerTimerId !== null) {
      window.clearInterval(this.schedulerTimerId);
    }
    this.schedulerTimerId = window.setInterval(() => this.scheduleLoop(), this.lookaheadMs);
  }

  public stopPlayback(): void {
    this.isPlaying = false;
    if (this.schedulerTimerId !== null) {
      window.clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  public getCurrentSongTime(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    return Math.max(0, this.ctx.currentTime - this.songStartAudioTime - this.latencyOffsetSec);
  }

  public getCurrentBeat(): number {
    const sec = this.getCurrentSongTime();
    return sec / (60 / this.currentBpm);
  }

  /**
   * Main Lookahead Scheduler Loop
   * Fires every 25ms and schedules beats in advance using Web Audio timeline
   */
  private scheduleLoop(): void {
    if (!this.ctx || !this.isPlaying) return;

    const currentAudioTime = this.ctx.currentTime;
    const scheduleUntilTime = currentAudioTime + this.scheduleAheadSec;
    const secondsPerBeat = 60 / this.currentBpm;

    while (true) {
      const beatAudioTime = this.songStartAudioTime + (this.nextBeatToSchedule * secondsPerBeat) + this.latencyOffsetSec;
      if (beatAudioTime > scheduleUntilTime) {
        break;
      }

      if (beatAudioTime >= currentAudioTime - 0.05) {
        this.scheduleBeat(this.nextBeatToSchedule, beatAudioTime);
      }
      this.nextBeatToSchedule += 0.5; // Schedule in 8th-note subdivisions
    }
  }

  /**
   * Schedules drum events and musical stems for a specific 8th-note tick
   */
  private scheduleBeat(beat: number, time: number): void {
    if (!this.ctx) return;

    const beatsPerBar = this.currentGenre.timeSignature[0];
    const beatInBar = beat % beatsPerBar;
    const isDownbeat = Math.floor(beat) === beat;
    const isBarStart = beatInBar === 0;

    // Apply swing offset for offbeat 8ths if genre specifies swing
    let adjustedTime = time;
    if (!isDownbeat && this.currentGenre.swingRatio !== 0.5) {
      const swingDelta = (this.currentGenre.swingRatio - 0.5) * (60 / this.currentBpm);
      adjustedTime += swingDelta;
    }

    // 1. Kick (Stem 0)
    switch (this.currentGenre.drumStyle) {
      case 'linn': // Four-on-the-floor
        if (isDownbeat) {
          this.playKick(adjustedTime, isBarStart ? 1.0 : 0.85);
        }
        break;
      case 'funk': // Kick on 1 and offbeats
        if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 2.5) {
          this.playKick(adjustedTime, 0.9);
        }
        break;
      case 'jazz': // Feathered kick on downbeats 0 and 2
        if (beatInBar === 0 || beatInBar === 2) {
          this.playFeatherKick(adjustedTime, 0.45);
        }
        break;
      case 'afro': // Tresillo kick: 0, 1.5, 3
        if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 3) {
          this.playKick(adjustedTime, 0.95);
        }
        break;
      case 'breakbeat': // Amen kick on 0 and 2.5
        if (beatInBar === 0 || beatInBar === 2.5) {
          this.playSubKick(adjustedTime, 1.0);
        }
        break;
    }

    // 2. Snare / Clave / Ride (Stem 1)
    switch (this.currentGenre.drumStyle) {
      case 'linn': // Snare on 1 and 3 (beats 2 and 4 in human 1-based indexing)
        if (beatInBar === 1 || beatInBar === 3) {
          this.playSnare(adjustedTime, 0.9, 'gated');
        }
        break;
      case 'funk': // Crisp Snare on 1 and 3, ghost tap on 2.5
        if (beatInBar === 1 || beatInBar === 3) {
          this.playSnare(adjustedTime, 0.95, 'acoustic');
        } else if (beatInBar === 2.5) {
          this.playSnare(adjustedTime, 0.35, 'acoustic');
        }
        break;
      case 'jazz': // Swung Ride Cymbal + Soft brushed snare on 1 & 3
        this.playRideCymbal(adjustedTime, isDownbeat ? 0.6 : 0.85);
        if (beatInBar === 1 || beatInBar === 3) {
          this.playBrushedSnare(adjustedTime, 0.5);
        }
        break;
      case 'afro': // Clave click on 0, 1.5, 3
        if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 3) {
          this.playClaveClick(adjustedTime, 0.85);
        }
        break;
      case 'breakbeat': // Fast Amen Snare on 1 and 3, plus syncopated snare on 1.75 / 3.25
        if (beatInBar === 1 || beatInBar === 3) {
          this.playSnare(adjustedTime, 1.0, 'break');
        }
        break;
    }

    // 3. Hi-Hats (Stem 1)
    if (this.currentGenre.drumStyle !== 'jazz') {
      this.playHiHat(adjustedTime, isDownbeat ? 0.45 : 0.7);
    }

    // 4. Bassline Note (Stem 2)
    if (isDownbeat || beatInBar === 1.5 || beatInBar === 2.5) {
      this.scheduleBassNote(beat, adjustedTime);
    }

    // 5. Harmony / Lead Arp (Stem 3)
    this.scheduleLeadArp(beat, adjustedTime);
  }

  // --- Procedural Drum Synthesis ---

  private playKick(time: number, volume = 1.0): void {
    if (!this.ctx || !this.stemGains[0]) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Pitch envelope: fast drop from 160Hz to 40Hz
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

    gain.gain.setValueAtTime(volume * 0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(this.stemGains[0]);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  private playSubKick(time: number, volume = 1.0): void {
    if (!this.ctx || !this.stemGains[0]) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.06);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(this.stemGains[0]);

    osc.start(time);
    osc.stop(time + 0.36);
  }

  private playFeatherKick(time: number, volume = 0.5): void {
    if (!this.ctx || !this.stemGains[0]) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    gain.gain.setValueAtTime(volume * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(gain);
    gain.connect(this.stemGains[0]);

    osc.start(time);
    osc.stop(time + 0.22);
  }

  private playSnare(time: number, volume = 1.0, style: 'gated' | 'acoustic' | 'break' = 'gated'): void {
    if (!this.ctx || !this.stemGains[1] || !this.noiseBuffer) return;

    // Snare tone (body)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(style === 'break' ? 240 : 185, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

    oscGain.gain.setValueAtTime(volume * 0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(oscGain);
    oscGain.connect(this.stemGains[1]);

    // Snare rattle (noise + bandpass filter)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(style === 'gated' ? 2200 : 3400, time);
    filter.Q.setValueAtTime(1.2, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.65, time);
    const duration = style === 'gated' ? 0.22 : 0.14;
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.stemGains[1]);

    osc.start(time);
    osc.stop(time + 0.15);
    noise.start(time);
    noise.stop(time + duration);
  }

  private playBrushedSnare(time: number, volume = 0.5): void {
    if (!this.ctx || !this.stemGains[1] || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4500, time);
    filter.Q.setValueAtTime(0.8, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.stemGains[1]);

    noise.start(time);
    noise.stop(time + 0.2);
  }

  private playRideCymbal(time: number, volume = 0.7): void {
    if (!this.ctx || !this.stemGains[1] || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(6500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.stemGains[1]);

    noise.start(time);
    noise.stop(time + 0.38);
  }

  private playClaveClick(time: number, volume = 0.8): void {
    if (!this.ctx || !this.stemGains[1]) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2450, time);

    gain.gain.setValueAtTime(volume * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    osc.connect(gain);
    gain.connect(this.stemGains[1]);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  private playHiHat(time: number, volume = 0.5): void {
    if (!this.ctx || !this.stemGains[1] || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.stemGains[1]);

    noise.start(time);
    noise.stop(time + 0.06);
  }

  // --- Musical Bassline & Harmony Stems ---

  private scheduleBassNote(beat: number, time: number): void {
    if (!this.ctx || !this.stemGains[2]) return;

    const scale = this.currentGenre.scale;
    const noteIndex = Math.floor(beat) % scale.length;
    const semitones = scale[noteIndex];
    const freq = intervalToFrequency(this.currentGenre.baseNoteFrequency * 0.5, semitones);

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = this.currentGenre.id === 'dnb' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.currentGenre.id === 'dnb' ? 650 : 450, time);

    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.26);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stemGains[2]);

    osc.start(time);
    osc.stop(time + 0.28);
  }

  private scheduleLeadArp(beat: number, time: number): void {
    if (!this.ctx || !this.stemGains[3]) return;

    const scale = this.currentGenre.scale;
    const arpIdx = Math.floor(beat * 2) % scale.length;
    const semitones = scale[arpIdx] + 12; // 1 octave up
    const freq = intervalToFrequency(this.currentGenre.baseNoteFrequency, semitones);

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.Q.setValueAtTime(3.0, time);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stemGains[3]);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  // --- Interactive Hit Sounds (Pitched Notes, Pulses, Obstacle Clashes) ---

  public playNotePickup(lane: number, rating: 'PERFECT' | 'GREAT' | 'GOOD'): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Lane pitch: Left = root/low, Center = mid, Right = high lead
    const scale = this.currentGenre.scale;
    const semitone = lane === 0 ? scale[0] : lane === 1 ? scale[2 % scale.length] : scale[4 % scale.length] + 12;
    const freq = intervalToFrequency(this.currentGenre.baseNoteFrequency, semitone);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = rating === 'PERFECT' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    const vol = rating === 'PERFECT' ? 0.6 : rating === 'GREAT' ? 0.45 : 0.3;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (rating === 'PERFECT' ? 0.35 : 0.2));

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.36);

    // If PERFECT, add harmonic chime sparkle!
    if (rating === 'PERFECT') {
      const chime = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(freq * 2, t);
      chimeGain.gain.setValueAtTime(0.25, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      chime.connect(chimeGain);
      chimeGain.connect(this.sfxGain);
      chime.start(t);
      chime.stop(t + 0.42);
    }
  }

  public playPulseAction(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playJumpAction(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.18);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  public playObstacleClash(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Dissonant minor 2nd cluster thud
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(95, t);
    osc2.frequency.setValueAtTime(101, t); // Dissonant beating

    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.3);
    osc2.stop(t + 0.3);
  }

  public playCallCue(noteFreq: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(noteFreq, t);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  public playPortalWarp(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.6);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.7);
  }

  public setMasterVolume(val: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime);
    }
  }

  public setMusicVolume(val: number): void {
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime);
    }
  }

  public setSfxVolume(val: number): void {
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime);
    }
  }
}

export const audio = new AudioEngine();
