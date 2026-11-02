// Beat Runner - Procedural Multi-Genre Web Audio Engine & 6-Instrument Pitched Synthesizer
// Self-contained Web Audio synthesis with 4 dynamic soundtrack layers & precision lookahead scheduling

import { GenreTheme, GENRES, GenreId } from './genres.ts';
import { ChromaticNote, intervalToFrequency, noteNameToFrequency } from './rhythm.ts';
import { InstrumentId } from './storage.ts';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isUnlocked = false;

  // Master Gain Nodes
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Dynamic Soundtrack Stems (Layers 0..3)
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

  // Noise Buffer for snares, hi-hats, and flute breath
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public async init(): Promise<void> {
    if (this.ctx && this.isUnlocked) return;

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      this.sfxGain.gain.setValueAtTime(0.92, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Create 4 dynamic stems:
      // Stem 0: Drums / Rhythm Pulse (always audible)
      // Stem 1: Percussion / Snare / Clave (Groove > 0.15)
      // Stem 2: Bassline (Groove > 0.40)
      // Stem 3: Harmony / Solo Lead (Groove > 0.70)
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
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
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

    this.stemGains[0].gain.setTargetAtTime(1.0, t, ramp);

    const stem1Target = this.grooveLevel >= 0.15 ? 1.0 : Math.max(0.3, this.grooveLevel / 0.15);
    this.stemGains[1].gain.setTargetAtTime(stem1Target, t, ramp);

    const stem2Target =
      this.grooveLevel >= 0.4 ? 1.0 : Math.max(0.0, (this.grooveLevel - 0.15) / 0.25);
    this.stemGains[2].gain.setTargetAtTime(stem2Target, t, ramp);

    const stem3Target =
      this.grooveLevel >= 0.7 ? 1.0 : Math.max(0.0, (this.grooveLevel - 0.45) / 0.25);
    this.stemGains[3].gain.setTargetAtTime(stem3Target, t, ramp);
  }

  public startPlayback(startBeat = 0): void {
    if (!this.ctx) return;
    this.isPlaying = true;
    this.nextBeatToSchedule = startBeat;
    this.songStartAudioTime = this.ctx.currentTime - startBeat * (60 / this.currentBpm);

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

  private scheduleLoop(): void {
    if (!this.ctx || !this.isPlaying) return;

    const currentAudioTime = this.ctx.currentTime;
    const scheduleUntilTime = currentAudioTime + this.scheduleAheadSec;
    const secondsPerBeat = 60 / this.currentBpm;

    while (true) {
      const beatAudioTime =
        this.songStartAudioTime + this.nextBeatToSchedule * secondsPerBeat + this.latencyOffsetSec;
      if (beatAudioTime > scheduleUntilTime) {
        break;
      }

      if (beatAudioTime >= currentAudioTime - 0.05) {
        this.scheduleBeat(this.nextBeatToSchedule, beatAudioTime);
      }
      this.nextBeatToSchedule += 0.5;
    }
  }

  private scheduleBeat(beat: number, time: number): void {
    if (!this.ctx) return;

    const beatsPerBar = this.currentGenre.timeSignature[0];
    const beatInBar = beat % beatsPerBar;
    const isDownbeat = Math.floor(beat) === beat;
    const isBarStart = beatInBar === 0;

    let adjustedTime = time;
    if (!isDownbeat && this.currentGenre.swingRatio !== 0.5) {
      const swingDelta = (this.currentGenre.swingRatio - 0.5) * (60 / this.currentBpm);
      adjustedTime += swingDelta;
    }

    // 1. Kick (Stem 0)
    switch (this.currentGenre.drumStyle) {
      case 'linn':
        if (isDownbeat) {
          this.playKick(adjustedTime, isBarStart ? 1.0 : 0.85);
        }
        break;
      case 'funk':
        if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 2.5) {
          this.playKick(adjustedTime, 0.9);
        }
        break;
      case 'jazz':
        if (beatInBar === 0 || beatInBar === 2) {
          this.playFeatherKick(adjustedTime, 0.45);
        }
        break;
      case 'afro':
        if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 3) {
          this.playKick(adjustedTime, 0.95);
        }
        break;
      case 'breakbeat':
        if (beatInBar === 0 || beatInBar === 2.5) {
          this.playSubKick(adjustedTime, 1.0);
        }
        break;
    }

    // 2. Snare / Clave / Ride (Stem 1)
    switch (this.currentGenre.drumStyle) {
      case 'linn':
        if (beatInBar === 1 || beatInBar === 3) {
          this.playSnare(adjustedTime, 0.9, 'gated');
        }
        break;
      case 'funk':
        if (beatInBar === 1 || beatInBar === 3) {
          this.playSnare(adjustedTime, 0.95, 'acoustic');
        } else if (beatInBar === 2.5) {
          this.playSnare(adjustedTime, 0.35, 'acoustic');
        }
        break;
      case 'jazz':
        this.playRideCymbal(adjustedTime, isDownbeat ? 0.6 : 0.85);
        if (beatInBar === 1 || beatInBar === 3) {
          this.playBrushedSnare(adjustedTime, 0.5);
        }
        break;
      case 'afro':
        if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 3) {
          this.playClaveClick(adjustedTime, 0.85);
        }
        break;
      case 'breakbeat':
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

    // 5. Harmony / Solo Lead Arp (Stem 3)
    this.scheduleLeadArp(beat, adjustedTime);
  }

  // --- Procedural Drum Synthesis ---

  private playKick(time: number, volume = 1.0): void {
    if (!this.ctx || !this.stemGains[0]) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
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

  private playSnare(
    time: number,
    volume = 1.0,
    style: 'gated' | 'acoustic' | 'break' = 'gated'
  ): void {
    if (!this.ctx || !this.stemGains[1] || !this.noiseBuffer) return;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(style === 'break' ? 240 : 185, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

    oscGain.gain.setValueAtTime(volume * 0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(oscGain);
    oscGain.connect(this.stemGains[1]);

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
    const semitones = scale[arpIdx] + 12;
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

  // --- 6-Instrument Pitched Synthesis for Musical Note Collection ---

  /**
   * Plays a pitched musical note (C, C#, D, D#, E, F, F#, G, G#, A, A#, B) using Beat's
   * equipped Magical Instrument (Piano, Synthesizer, Guitar, Marimba, Flute, Bells).
   */
  public playNotePitch(
    noteName: ChromaticNote,
    instrument: InstrumentId = 'piano',
    rating: 'PERFECT' | 'GREAT' | 'GOOD' = 'PERFECT',
    octave = 4
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const freq = noteNameToFrequency(noteName, octave);
    this.synthesizeInstrumentVoice(freq, instrument, rating, this.ctx.currentTime);
  }

  public playNotePickup(
    lane: number,
    rating: 'PERFECT' | 'GREAT' | 'GOOD',
    noteName?: ChromaticNote,
    instrument: InstrumentId = 'piano'
  ): void {
    if (!this.ctx || !this.sfxGain) return;

    if (noteName) {
      const octave = lane === 0 ? 4 : lane === 1 ? 4 : 5;
      this.playNotePitch(noteName, instrument, rating, octave);
      return;
    }

    const scale = this.currentGenre.scale;
    const semitone =
      lane === 0 ? scale[0] : lane === 1 ? scale[2 % scale.length] : scale[4 % scale.length] + 12;
    const freq = intervalToFrequency(this.currentGenre.baseNoteFrequency * 2, semitone);
    this.synthesizeInstrumentVoice(freq, instrument, rating, this.ctx.currentTime);
  }

  private synthesizeInstrumentVoice(
    freq: number,
    instrument: InstrumentId,
    rating: 'PERFECT' | 'GREAT' | 'GOOD',
    startTime: number
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const vol = rating === 'PERFECT' ? 0.58 : rating === 'GREAT' ? 0.46 : 0.34;

    switch (instrument) {
      case 'piano': {
        // Warm acoustic piano: fundamental triangle + 2nd harmonic sine + hammer strike
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const harmGain = this.ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.48);

        harmGain.gain.setValueAtTime(vol * 0.35, startTime);
        harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

        osc1.connect(gain);
        osc2.connect(harmGain);
        harmGain.connect(gain);
        gain.connect(this.sfxGain);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + 0.5);
        osc2.stop(startTime + 0.25);
        break;
      }

      case 'synth': {
        // Dual detuned sawtooth + square with resonant lowpass filter envelope
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.frequency.setValueAtTime(freq * 1.005, startTime);

        filter.type = 'lowpass';
        filter.Q.setValueAtTime(4.0, startTime);
        filter.frequency.setValueAtTime(3200, startTime);
        filter.frequency.exponentialRampToValueAtTime(480, startTime + 0.32);

        gain.gain.setValueAtTime(vol * 0.55, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + 0.4);
        osc2.stop(startTime + 0.4);
        break;
      }

      case 'guitar': {
        // Plucked string resonance with crisp pick transient
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.frequency.setValueAtTime(freq * 2, startTime);

        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2.5, startTime);
        filter.frequency.setValueAtTime(3800, startTime);
        filter.frequency.exponentialRampToValueAtTime(650, startTime + 0.18);

        gain.gain.setValueAtTime(vol * 0.65, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.42);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + 0.44);
        osc2.stop(startTime + 0.44);
        break;
      }

      case 'marimba': {
        // Rosewood bar fundamental + 4th harmonic overtone with fast wooden decay
        const osc1 = this.ctx.createOscillator();
        const osc4 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        const gain4 = this.ctx.createGain();

        osc1.type = 'sine';
        osc4.type = 'sine';
        osc1.frequency.setValueAtTime(freq, startTime);
        osc4.frequency.setValueAtTime(freq * 4, startTime);

        gain1.gain.setValueAtTime(vol * 0.8, startTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.26);

        gain4.gain.setValueAtTime(vol * 0.45, startTime);
        gain4.gain.exponentialRampToValueAtTime(0.001, startTime + 0.065);

        osc1.connect(gain1);
        osc4.connect(gain4);
        gain1.connect(this.sfxGain);
        gain4.connect(this.sfxGain);

        osc1.start(startTime);
        osc4.start(startTime);
        osc1.stop(startTime + 0.28);
        osc4.stop(startTime + 0.08);
        break;
      }

      case 'flute': {
        // Airy sine with soft attack, vibrato LFO, and gentle breath
        const osc = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 1.5 > 1200 ? freq : freq * 2, startTime);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(5.5, startTime);
        lfoGain.gain.setValueAtTime(6.0, startTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol * 0.65, startTime + 0.045);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.42);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(startTime);
        lfo.start(startTime);
        osc.stop(startTime + 0.44);
        lfo.stop(startTime + 0.44);
        break;
      }

      case 'bells': {
        // Metallic glockenspiel chime: fundamental + inharmonic bell partial (2.756x)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        const gain2 = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(freq * 2, startTime);
        osc2.frequency.setValueAtTime(freq * 2 * 2.756, startTime);

        gain1.gain.setValueAtTime(vol * 0.55, startTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.58);

        gain2.gain.setValueAtTime(vol * 0.28, startTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(this.sfxGain);
        gain2.connect(this.sfxGain);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + 0.6);
        osc2.stop(startTime + 0.24);
        break;
      }
    }
  }

  /**
   * Plays a celebratory arpeggio flourish when Beat completes a Musical Sequence (e.g. C -> E -> G -> C)
   */
  public playSequenceCompleteChord(notes: ChromaticNote[], instrument: InstrumentId): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    notes.forEach((note, idx) => {
      const octave = idx === notes.length - 1 ? 5 : 4;
      const freq = noteNameToFrequency(note, octave);
      this.synthesizeInstrumentVoice(freq, instrument, 'PERFECT', now + idx * 0.055);
    });
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

  public playSlideAction(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.16);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  /**
   * Comedic Police Whistle trill when Officer Tempo surges closer!
   */
  public playOfficerWhistle(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2650, t);
    osc.frequency.linearRampToValueAtTime(2950, t + 0.18);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(28, t); // Pea-whistle trill
    lfoGain.gain.setValueAtTime(140, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.25);
    lfo.stop(t + 0.25);
  }

  public playObstacleClash(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(95, t);
    osc2.frequency.setValueAtTime(101, t);

    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.3);
    osc2.stop(t + 0.3);

    // Officer Tempo blows his whistle as he surges closer!
    this.playOfficerWhistle();
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

  // --- Tactile Arcade UI Sound Effects ---

  public playButtonPop(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.05);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  public playCoinPickup(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, t); // B5
    osc2.frequency.setValueAtTime(1318.51, t + 0.04); // E6

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t);
    osc1.stop(t + 0.12);
    osc2.start(t + 0.04);
    osc2.stop(t + 0.23);
  }

  public playCountdownTick(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  public playCountdownGo(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.02);

      gain.gain.setValueAtTime(0.3, t + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(t + idx * 0.02);
      osc.stop(t + 0.48);
    });
  }

  public playTabSwitch(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.04);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  public setMasterVolume(val: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime);
    }
  }
}

export const audio = new AudioEngine();
