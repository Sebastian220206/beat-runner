// Beat Runner - Main Game Engine & Rhythm State Machine

import { GenreId, GenreTheme, GENRES, GENRE_ORDER } from './genres.ts';
import {
  judgeTiming,
  JudgmentResult,
  TIMING_WINDOWS,
  CALL_RESPONSE_LIBRARY,
  CallResponsePattern,
  intervalToFrequency,
} from './rhythm.ts';
import { audio } from './audio.ts';
import { storage } from './storage.ts';
import { PlayerInputEvent, input } from './input.ts';

export type GameMode = 'ENDLESS' | 'STAGE' | 'PULSE_DOJO';
export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export interface NoteEntity {
  id: number;
  type: 'note';
  lane: number; // 0: Left, 1: Center, 2: Right
  beat: number;
  semitone: number;
  collected: boolean;
  active: boolean;
}

export interface PulseRingEntity {
  id: number;
  type: 'pulse';
  lane: number; // 0, 1, 2 or -1 (all lanes)
  beat: number;
  cleared: boolean;
  active: boolean;
}

export interface BarrierEntity {
  id: number;
  type: 'barrier';
  lane: number; // 0, 1, 2
  isLaser: boolean; // Laser spans all 3 lanes and must be jumped
  beat: number;
  hit: boolean;
  active: boolean;
}

export interface GenrePortalEntity {
  id: number;
  type: 'portal';
  targetGenre: GenreId;
  beat: number;
  active: boolean;
}

export type TrackEntity = NoteEntity | PulseRingEntity | BarrierEntity | GenrePortalEntity;

export interface PerformanceDiagnostics {
  totalNotes: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  meanDeltaMs: number;
  accuracyPercent: number;
  maxCombo: number;
  finalScore: number;
  rank: 'S+' | 'S' | 'A' | 'B' | 'C';
  genreMastery: string;
}

export class GameManager {
  public state: GameState = 'MENU';
  public mode: GameMode = 'ENDLESS';
  public currentGenre: GenreTheme = GENRES.synthwave;
  private genreIndex = 0;

  // Player Runner State
  public targetLane = 1; // 0 = Left, 1 = Center, 2 = Right
  public currentLaneX = 0; // -1.0 (Left) to +1.0 (Right)
  public isJumping = false;
  public jumpProgress = 0; // 0 to 1
  public isFever = false;

  // Metrics & Groove
  public score = 0;
  public combo = 0;
  public maxCombo = 0;
  public multiplier = 1;
  public grooveMeter = 0; // 0 to 100

  // Diagnostics Tracking
  public perfectCount = 0;
  public greatCount = 0;
  public goodCount = 0;
  public missCount = 0;
  public timingDeltas: number[] = [];

  // Entities on track
  public entities: TrackEntity[] = [];
  private nextEntityId = 1;
  private lastSpawnedBeat = 0;
  private readonly lookaheadBeats = 14;

  // Call & Response System
  public callResponseActive = false;
  public callResponsePhase: 'idle' | 'cue' | 'echo' = 'idle';
  public currentPattern: CallResponsePattern | null = null;
  public patternStartBeat = 0;

  // Pulse Dojo Internal Clock Test
  public isMutedBar = false;

  // Callbacks for UI updates
  public onJudgment: ((result: JudgmentResult, lane: number) => void) | null = null;
  public onScoreChange: ((score: number, combo: number, groove: number, mult: number) => void) | null = null;
  public onGenreChange: ((genre: GenreTheme) => void) | null = null;
  public onGameOver: ((diagnostics: PerformanceDiagnostics) => void) | null = null;

  constructor() {
    input.registerCallback((evt) => this.handleInput(evt));
  }

  public setMode(mode: GameMode, selectedGenre: GenreId = 'synthwave'): void {
    this.mode = mode;
    this.genreIndex = GENRE_ORDER.indexOf(selectedGenre);
    if (this.genreIndex < 0) this.genreIndex = 0;
    this.currentGenre = GENRES[GENRE_ORDER[this.genreIndex]];
  }

  public async start(): Promise<void> {
    await audio.init();
    audio.setGenre(this.currentGenre.id);
    audio.setLatencyOffset(storage.getSettings().audioOffsetMs);

    this.state = 'PLAYING';
    this.targetLane = 1;
    this.currentLaneX = 0;
    this.isJumping = false;
    this.jumpProgress = 0;
    this.isFever = false;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.grooveMeter = 20;

    this.perfectCount = 0;
    this.greatCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.timingDeltas = [];

    this.entities = [];
    this.nextEntityId = 1;
    this.lastSpawnedBeat = 0;
    this.callResponseActive = false;
    this.callResponsePhase = 'idle';
    this.isMutedBar = false;

    audio.setGrooveLevel(this.grooveMeter / 100);
    audio.startPlayback(0);

    if (this.onGenreChange) {
      this.onGenreChange(this.currentGenre);
    }
    this.broadcastScore();
  }

  public pause(): void {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      audio.stopPlayback();
    }
  }

  public resume(): void {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      const currentBeat = audio.getCurrentBeat();
      audio.startPlayback(currentBeat);
    }
  }

  public stop(): void {
    this.state = 'GAME_OVER';
    audio.stopPlayback();
    const diagnostics = this.computeDiagnostics();
    storage.recordRun(this.currentGenre.id, this.score, this.maxCombo, diagnostics.accuracyPercent);
    storage.incrementStats({
      totalRuns: 1,
      totalNotesHit: this.perfectCount + this.greatCount + this.goodCount,
      totalPerfects: this.perfectCount,
      totalGreats: this.greatCount,
      totalGoods: this.goodCount,
      totalMisses: this.missCount,
    });
    if (this.onGameOver) {
      this.onGameOver(diagnostics);
    }
  }

  /**
   * Main game tick (invoked at 60fps/120fps by animation frame)
   */
  public update(dt: number): void {
    if (this.state !== 'PLAYING') return;

    const currentBeat = audio.getCurrentBeat();

    // 1. Smooth Lane Interpolation (Lerp)
    const targetX = this.targetLane - 1; // -1 (Left), 0 (Center), +1 (Right)
    this.currentLaneX += (targetX - this.currentLaneX) * Math.min(1, 16 * dt);

    // 2. Jump Physics (Synchronized to 1 beat duration)
    if (this.isJumping) {
      const beatDurationSec = 60 / this.currentGenre.bpm;
      this.jumpProgress += dt / beatDurationSec;
      if (this.jumpProgress >= 1) {
        this.isJumping = false;
        this.jumpProgress = 0;
      }
    }

    // 3. Spawner: Generate ahead of time
    this.spawnEntitiesAhead(currentBeat);

    // 4. Collision & Miss Detection
    this.checkEntities(currentBeat);

    // 5. Update Groove Decay (gradual slow drop if idle)
    if (this.grooveMeter > 0 && !this.isFever) {
      this.grooveMeter = Math.max(0, this.grooveMeter - 1.2 * dt);
      audio.setGrooveLevel(this.grooveMeter / 100);
      this.broadcastScore();
    }
  }

  /**
   * Handles user actions from keyboard or mobile touch
   */
  public handleInput(evt: PlayerInputEvent): void {
    if (this.state !== 'PLAYING') return;

    const currentBeat = audio.getCurrentBeat();
    const bpm = this.currentGenre.bpm;
    const currentTimeSec = audio.getCurrentSongTime();

    switch (evt.type) {
      case 'move_left':
        if (this.targetLane > 0) {
          this.targetLane--;
          this.checkActiveNoteHit(currentBeat, currentTimeSec, bpm);
        }
        break;

      case 'move_right':
        if (this.targetLane < 2) {
          this.targetLane++;
          this.checkActiveNoteHit(currentBeat, currentTimeSec, bpm);
        }
        break;

      case 'set_lane':
        if (evt.targetLane !== undefined && evt.targetLane >= 0 && evt.targetLane <= 2) {
          this.targetLane = evt.targetLane;
          this.checkActiveNoteHit(currentBeat, currentTimeSec, bpm);
        }
        break;

      case 'jump':
        if (!this.isJumping) {
          this.isJumping = true;
          this.jumpProgress = 0;
          audio.playJumpAction();
          this.checkActivePulseOrLaser(currentBeat, currentTimeSec, bpm, true);
        }
        break;

      case 'pulse':
        audio.playPulseAction();
        this.checkActivePulseOrLaser(currentBeat, currentTimeSec, bpm, false);
        break;

      case 'pause':
        this.pause();
        break;
    }
  }

  private checkActiveNoteHit(currentBeat: number, currentTimeSec: number, bpm: number): void {
    const windowBeats = (TIMING_WINDOWS.GOOD_MS / 1000) / (60 / bpm);

    for (const ent of this.entities) {
      if (ent.type === 'note' && ent.active && !ent.collected && ent.lane === this.targetLane) {
        if (Math.abs(ent.beat - currentBeat) <= windowBeats) {
          const targetTime = ent.beat * (60 / bpm);
          const result = judgeTiming(currentTimeSec, targetTime);
          this.processHit(ent, result);
          break;
        }
      }
    }
  }

  private checkActivePulseOrLaser(currentBeat: number, currentTimeSec: number, bpm: number, isJump: boolean): void {
    const windowBeats = (TIMING_WINDOWS.GOOD_MS / 1000) / (60 / bpm);

    for (const ent of this.entities) {
      if (ent.active) {
        if (ent.type === 'pulse' && !ent.cleared) {
          if (ent.lane === -1 || ent.lane === this.targetLane) {
            if (Math.abs(ent.beat - currentBeat) <= windowBeats) {
              const targetTime = ent.beat * (60 / bpm);
              const result = judgeTiming(currentTimeSec, targetTime);
              ent.cleared = true;
              ent.active = false;
              this.processJudgment(result, this.targetLane);
              audio.playPulseAction();
              input.triggerHaptic(20);
              break;
            }
          }
        } else if (ent.type === 'barrier' && ent.isLaser && isJump && !ent.hit) {
          if (Math.abs(ent.beat - currentBeat) <= windowBeats) {
            ent.hit = true; // Cleared cleanly by jump
            const result: JudgmentResult = {
              rating: 'PERFECT',
              deltaMs: 0,
              score: 80,
              grooveChange: 8,
              label: 'CLEARED!',
            };
            this.processJudgment(result, this.targetLane);
            break;
          }
        }
      }
    }
  }

  /**
   * Spawns entities ahead of player's current beat
   */
  private spawnEntitiesAhead(currentBeat: number): void {
    const targetBeat = currentBeat + this.lookaheadBeats;

    while (this.lastSpawnedBeat < targetBeat) {
      const nextBeat = this.lastSpawnedBeat + 4; // Spawn in 1-bar chunks (4 beats)
      this.spawnBarChunk(this.lastSpawnedBeat, nextBeat);
      this.lastSpawnedBeat = nextBeat;
    }
  }

  private spawnBarChunk(barStartBeat: number, _barEndBeat: number): void {
    const barIndex = Math.floor(barStartBeat / 4);

    // Endless Mode: Check Genre Portal every 32 bars
    if (this.mode === 'ENDLESS' && barIndex > 0 && barIndex % 32 === 0) {
      const nextGenreIdx = (this.genreIndex + 1) % GENRE_ORDER.length;
      this.entities.push({
        id: this.nextEntityId++,
        type: 'portal',
        targetGenre: GENRE_ORDER[nextGenreIdx],
        beat: barStartBeat + 2,
        active: true,
      });
      return;
    }

    // Call & Response or Pulse Dojo trigger every 8 bars
    if (barIndex > 0 && barIndex % 8 === 0) {
      const pattern = CALL_RESPONSE_LIBRARY[barIndex % CALL_RESPONSE_LIBRARY.length];
      this.spawnCallResponsePattern(barStartBeat, pattern);
      return;
    }

    // Standard Genre Rhythmic Pattern Spawning
    const patterns = this.currentGenre.rhythmPatterns;
    const chosenPattern = patterns[barIndex % patterns.length];

    for (let i = 0; i < chosenPattern.subdivisions.length; i++) {
      const subBeat = barStartBeat + chosenPattern.subdivisions[i];
      const lane = chosenPattern.laneDistribution[i % chosenPattern.laneDistribution.length];
      const action = chosenPattern.actionRequired ? chosenPattern.actionRequired[i] : 'move';

      if (action === 'jump') {
        // Laser barrier across lanes
        this.entities.push({
          id: this.nextEntityId++,
          type: 'barrier',
          lane,
          isLaser: true,
          beat: subBeat,
          hit: false,
          active: true,
        });
      } else if (action === 'pulse') {
        // Pulse Ring
        this.entities.push({
          id: this.nextEntityId++,
          type: 'pulse',
          lane,
          beat: subBeat,
          cleared: false,
          active: true,
        });
      } else {
        // Flow Note Orb
        const scale = this.currentGenre.scale;
        const semitone = scale[i % scale.length];
        this.entities.push({
          id: this.nextEntityId++,
          type: 'note',
          lane,
          beat: subBeat,
          semitone,
          collected: false,
          active: true,
        });

        // Add occasional tall obstacle in other lane
        if (i % 2 === 1 && Math.random() > 0.4) {
          const obstacleLane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
          this.entities.push({
            id: this.nextEntityId++,
            type: 'barrier',
            lane: obstacleLane,
            isLaser: false,
            beat: subBeat,
            hit: false,
            active: true,
          });
        }
      }
    }
  }

  private spawnCallResponsePattern(barStartBeat: number, pattern: CallResponsePattern): void {
    // Cue bar: audio-visual preview (first bar)
    for (let i = 0; i < pattern.beats.length; i++) {
      const cueBeat = barStartBeat + pattern.beats[i];
      // Schedule audio preview tone
      const timeSec = cueBeat * (60 / this.currentGenre.bpm);
      const freq = intervalToFrequency(this.currentGenre.baseNoteFrequency, pattern.notes[i]);
      setTimeout(() => {
        if (this.state === 'PLAYING') {
          audio.playCallCue(freq);
        }
      }, Math.max(0, (timeSec - audio.getCurrentSongTime()) * 1000));
    }

    // Echo bar: interactive notes player must hit (next bar, barStartBeat + 4)
    for (let i = 0; i < pattern.beats.length; i++) {
      const echoBeat = barStartBeat + 4 + pattern.beats[i];
      this.entities.push({
        id: this.nextEntityId++,
        type: 'note',
        lane: pattern.lanes[i],
        beat: echoBeat,
        semitone: pattern.notes[i],
        collected: false,
        active: true,
      });
    }
  }

  /**
   * Evaluates active entities relative to current beat and detects misses
   */
  private checkEntities(currentBeat: number): void {
    const missThresholdBeats = (TIMING_WINDOWS.GOOD_MS / 1000) / (60 / this.currentGenre.bpm);

    for (const ent of this.entities) {
      if (!ent.active) continue;

      // Note Orb handling
      if (ent.type === 'note' && !ent.collected) {
        if (currentBeat - ent.beat > missThresholdBeats) {
          // Missed note
          ent.active = false;
          const missResult: JudgmentResult = {
            rating: 'MISS',
            deltaMs: Math.round(missThresholdBeats * (60 / this.currentGenre.bpm) * 1000),
            score: 0,
            grooveChange: -15,
            label: 'MISS',
          };
          this.processJudgment(missResult, ent.lane);
        } else if (Math.abs(currentBeat - ent.beat) <= missThresholdBeats && ent.lane === this.targetLane) {
          // Auto-collected by being in the correct lane
          const currentTime = audio.getCurrentSongTime();
          const targetTime = ent.beat * (60 / this.currentGenre.bpm);
          const result = judgeTiming(currentTime, targetTime);
          this.processHit(ent, result);
        }
      }

      // Barrier collision
      if (ent.type === 'barrier' && !ent.hit) {
        if (Math.abs(currentBeat - ent.beat) < 0.15) {
          if (ent.isLaser) {
            // Must be jumping
            if (!this.isJumping) {
              ent.hit = true;
              this.handleCollision();
            }
          } else {
            // Must not be in same lane
            if (this.targetLane === ent.lane && !this.isJumping) {
              ent.hit = true;
              this.handleCollision();
            }
          }
        }
      }

      // Pulse Ring expiration
      if (ent.type === 'pulse' && !ent.cleared) {
        if (currentBeat - ent.beat > missThresholdBeats) {
          ent.active = false;
          const missResult: JudgmentResult = {
            rating: 'MISS',
            deltaMs: 120,
            score: 0,
            grooveChange: -10,
            label: 'PULSE MISSED',
          };
          this.processJudgment(missResult, ent.lane === -1 ? 1 : ent.lane);
        }
      }

      // Genre Portal trigger
      if (ent.type === 'portal') {
        if (currentBeat >= ent.beat) {
          ent.active = false;
          this.shiftGenre(ent.targetGenre);
        }
      }

      // Cleanup entities far behind player
      if (currentBeat - ent.beat > 8) {
        ent.active = false;
      }
    }

    // Filter dead entities periodically
    if (this.entities.length > 80) {
      this.entities = this.entities.filter((e) => e.active);
    }
  }

  private processHit(note: NoteEntity, result: JudgmentResult): void {
    note.collected = true;
    note.active = false;
    audio.playNotePickup(note.lane, result.rating as 'PERFECT' | 'GREAT' | 'GOOD');
    input.triggerHaptic(15);
    this.processJudgment(result, note.lane);
  }

  private handleCollision(): void {
    audio.playObstacleClash();
    input.triggerHaptic(60);

    const clashResult: JudgmentResult = {
      rating: 'MISS',
      deltaMs: 0,
      score: 0,
      grooveChange: -25,
      label: 'BARRIER CLASH!',
    };
    this.processJudgment(clashResult, this.targetLane);
  }

  private processJudgment(result: JudgmentResult, lane: number): void {
    this.timingDeltas.push(result.deltaMs);

    if (result.rating === 'PERFECT') {
      this.perfectCount++;
      this.combo++;
    } else if (result.rating === 'GREAT') {
      this.greatCount++;
      this.combo++;
    } else if (result.rating === 'GOOD') {
      this.goodCount++;
      this.combo++;
    } else {
      this.missCount++;
      this.combo = 0;
    }

    this.maxCombo = Math.max(this.maxCombo, this.combo);

    // Multiplier calculation (1x -> 2x at 10 combo, 3x at 25 combo, 4x at 50 combo)
    if (this.combo >= 50) this.multiplier = 4;
    else if (this.combo >= 25) this.multiplier = 3;
    else if (this.combo >= 10) this.multiplier = 2;
    else this.multiplier = 1;

    // Groove Meter update
    this.grooveMeter = Math.max(0, Math.min(100, this.grooveMeter + result.grooveChange));
    this.isFever = this.grooveMeter >= 100;
    const finalMult = this.isFever ? this.multiplier * 2 : this.multiplier;

    this.score += result.score * finalMult;
    audio.setGrooveLevel(this.grooveMeter / 100);

    if (this.onJudgment) {
      this.onJudgment(result, lane);
    }
    this.broadcastScore();
  }

  private shiftGenre(genreId: GenreId): void {
    this.currentGenre = GENRES[genreId];
    this.genreIndex = GENRE_ORDER.indexOf(genreId);
    audio.playPortalWarp();
    audio.setGenre(genreId);

    if (this.onGenreChange) {
      this.onGenreChange(this.currentGenre);
    }
  }

  private broadcastScore(): void {
    if (this.onScoreChange) {
      this.onScoreChange(this.score, this.combo, this.grooveMeter, this.isFever ? this.multiplier * 2 : this.multiplier);
    }
  }

  public computeDiagnostics(): PerformanceDiagnostics {
    const total = this.perfectCount + this.greatCount + this.goodCount + this.missCount;
    const accuracyPercent =
      total > 0
        ? Math.round(
            ((this.perfectCount * 1.0 + this.greatCount * 0.75 + this.goodCount * 0.45) / total) * 100
          )
        : 0;

    let meanDelta = 0;
    if (this.timingDeltas.length > 0) {
      const sum = this.timingDeltas.reduce((acc, v) => acc + v, 0);
      meanDelta = Math.round(sum / this.timingDeltas.length);
    }

    let rank: 'S+' | 'S' | 'A' | 'B' | 'C' = 'C';
    if (accuracyPercent >= 96 && this.missCount === 0) rank = 'S+';
    else if (accuracyPercent >= 90) rank = 'S';
    else if (accuracyPercent >= 80) rank = 'A';
    else if (accuracyPercent >= 65) rank = 'B';

    return {
      totalNotes: total,
      perfectCount: this.perfectCount,
      greatCount: this.greatCount,
      goodCount: this.goodCount,
      missCount: this.missCount,
      meanDeltaMs: meanDelta,
      accuracyPercent,
      maxCombo: this.maxCombo,
      finalScore: this.score,
      rank,
      genreMastery: `${this.currentGenre.name} (${this.currentGenre.skillFocus})`,
    };
  }
}

export const game = new GameManager();
