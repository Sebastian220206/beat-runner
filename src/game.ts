// Beat Runner - Main Game Engine, Player Controller, Dedicated Collider & Musical Note State Machine

import { GenreId, GenreTheme, GENRES, GENRE_ORDER } from './genres.ts';
import {
  judgeTiming,
  JudgmentResult,
  TIMING_WINDOWS,
  CALL_RESPONSE_LIBRARY,
  CallResponsePattern,
  intervalToFrequency,
  ChromaticNote,
  semitoneToNoteName,
  MUSICAL_SEQUENCES,
  MusicalSequenceDef,
  MUSICAL_MISSIONS,
  MusicalMissionDef,
} from './rhythm.ts';
import { audio } from './audio.ts';
import { storage } from './storage.ts';
import { PlayerInputEvent, input } from './input.ts';

export type GameMode = 'ENDLESS' | 'STAGE' | 'PULSE_DOJO';
export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
export type OfficerTempoState = 'chasing' | 'lunging' | 'frustrated' | 'dancing' | 'caught';

// Primary State-Based Character Animation States for Beat
export type CharacterAnimState =
  | 'IDLE'
  | 'RUNNING'
  | 'JUMPING'
  | 'SLIDING'
  | 'LANE_SWITCH'
  | 'COLLISION'
  | 'GAME_OVER';

// Dedicated Gameplay Collision Box (decoupled from the visual 3D character mesh)
export interface PlayerCollider {
  laneHalfWidth: number; // Normalized lane half-width (0.42 of a lane)
  standingHeight: number; // World units (1.85m)
  slidingHeight: number; // World units when crouching/sliding (0.85m)
  jumpClearanceHeight: number; // Minimum jump height to clear low barriers (0.65m)
}

export interface NoteEntity {
  id: number;
  type: 'note';
  lane: number; // 0: Left, 1: Center, 2: Right
  beat: number;
  semitone: number;
  noteName: ChromaticNote;
  noteVariant: 'free' | 'sequence' | 'challenge';
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
  isLaser: boolean; // Low laser spans all 3 lanes and must be jumped
  barrierKind?: 'train' | 'low_laser' | 'high_signal'; // High signal must be slid under
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
  sessionCoins: number;
  sequencesCompleted: number;
  rank: 'S+' | 'S' | 'A' | 'B' | 'C';
  genreMastery: string;
}

export class GameManager {
  public state: GameState = 'MENU';
  public mode: GameMode = 'ENDLESS';
  public currentGenre: GenreTheme = GENRES.synthwave;
  private genreIndex = 0;

  // Player ("Beat") Runner & Animation Controller State
  public targetLane = 1; // 0 = Left, 1 = Center, 2 = Right
  public currentLaneX = 0; // -1.0 (Left) to +1.0 (Right)
  public isJumping = false;
  public isDoubleJump = false;
  public jumpProgress = 0; // 0 to 1
  public isSliding = false;
  public slideProgress = 0; // 0 to 1
  public isFever = false;
  public charAnimState: CharacterAnimState = 'IDLE';

  // Dedicated Collision Volume (separate from visual mesh)
  public readonly collider: PlayerCollider = {
    laneHalfWidth: 0.44,
    standingHeight: 1.85,
    slidingHeight: 0.85,
    jumpClearanceHeight: 0.65,
  };

  // Non-blocking Additive & Event-Driven Animation Timers for Beat
  public noteGestureTimer = 0;
  public celebrateTimer = 0;
  public stumbleTimer = 0;
  public lastCollectedPitch: ChromaticNote = 'C';

  // Officer Tempo Dynamic Chase State
  public tempoDistance = 2.6; // World Z distance behind Beat (1.5 = danger close, 4.5 = far back)
  public tempoLaneX = 0; // Officer Tempo smoothly trails Beat's lane
  public tempoState: OfficerTempoState = 'chasing';
  public tempoStateTimer = 0;
  public dangerStumbles = 0;

  // Musical Note Collection, Sequences & Missions
  public collectedNotesHistory: ChromaticNote[] = [];
  public activeSequence: MusicalSequenceDef = MUSICAL_SEQUENCES[0];
  public sequenceStepIndex = 0;
  public sequencesCompleted = 0;

  private missionIndex = 0;
  public activeMission: MusicalMissionDef = MUSICAL_MISSIONS[0];
  public missionProgress = 0;
  private uniqueNotesSet: Set<ChromaticNote> = new Set();

  // Metrics, Notes Currency & Groove
  public score = 0;
  public combo = 0;
  public maxCombo = 0;
  public multiplier = 1;
  public grooveMeter = 0; // 0 to 100
  public sessionCoins = 0;

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
  public onCoinEarned: ((totalSessionCoins: number, delta: number) => void) | null = null;
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
    this.isDoubleJump = false;
    this.jumpProgress = 0;
    this.isSliding = false;
    this.slideProgress = 0;
    this.isFever = false;
    this.charAnimState = 'RUNNING';

    this.noteGestureTimer = 0;
    this.celebrateTimer = 0;
    this.stumbleTimer = 0;

    // Initialize Officer Tempo right behind Beat as the Great Musical Chase begins
    this.tempoDistance = 2.55;
    this.tempoLaneX = 0;
    this.tempoState = 'chasing';
    this.tempoStateTimer = 0;
    this.dangerStumbles = 0;

    // Reset Musical Note History, Sequences & Missions
    this.collectedNotesHistory = [];
    this.activeSequence = MUSICAL_SEQUENCES[0];
    this.sequenceStepIndex = 0;
    this.sequencesCompleted = 0;
    this.activeMission = MUSICAL_MISSIONS[this.missionIndex % MUSICAL_MISSIONS.length];
    this.missionProgress = 0;
    this.uniqueNotesSet.clear();

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.grooveMeter = 25;
    this.sessionCoins = 0;

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
    this.charAnimState = 'GAME_OVER';
    this.tempoState = 'caught';
    audio.stopPlayback();
    const diagnostics = this.computeDiagnostics();
    storage.recordRun(
      this.currentGenre.id,
      this.score,
      this.maxCombo,
      diagnostics.accuracyPercent,
      diagnostics.rank
    );
    storage.addCoins(this.sessionCoins);
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
   * Returns Beat's current vertical height in world units based on jump state
   */
  public getPlayerHeight(): number {
    if (!this.isJumping) return 0;
    return Math.sin(this.jumpProgress * Math.PI) * (this.isDoubleJump ? 2.85 : 2.15);
  }

  /**
   * Evaluates whether the dedicated PlayerCollider overlaps a target lane (0, 1, 2)
   */
  public isColliderOverlappingLane(lane: number): boolean {
    const laneNormalized = lane - 1;
    return (
      this.targetLane === lane ||
      Math.abs(this.currentLaneX - laneNormalized) <= this.collider.laneHalfWidth
    );
  }

  /**
   * Main game tick (invoked at 60fps/120fps by animation frame)
   */
  public update(dt: number): void {
    if (this.state === 'MENU') {
      this.charAnimState = 'IDLE';
      return;
    }
    if (this.state === 'GAME_OVER') {
      this.charAnimState = 'GAME_OVER';
      return;
    }
    if (this.state !== 'PLAYING') return;

    const currentBeat = audio.getCurrentBeat();
    const beatDurationSec = 60 / this.currentGenre.bpm;

    // 1. Smooth Lane Interpolation for Beat and trailing Officer Tempo
    const targetX = this.targetLane - 1;
    this.currentLaneX += (targetX - this.currentLaneX) * Math.min(1, 16 * dt);
    this.tempoLaneX += (this.currentLaneX - this.tempoLaneX) * Math.min(1, 6.5 * dt);

    // 2. Jump & Double-Jump Physics (1 beat duration)
    if (this.isJumping) {
      this.jumpProgress += dt / beatDurationSec;
      if (this.jumpProgress >= 1) {
        this.isJumping = false;
        this.isDoubleJump = false;
        this.jumpProgress = 0;
      }
    }

    // 3. Slide / Crouch Physics (0.85 beat duration)
    if (this.isSliding) {
      this.slideProgress += dt / (beatDurationSec * 0.85);
      if (this.slideProgress >= 1) {
        this.isSliding = false;
        this.slideProgress = 0;
      }
    }

    // 4. Short Event-Driven Character Animation Timers
    if (this.noteGestureTimer > 0) this.noteGestureTimer = Math.max(0, this.noteGestureTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.stumbleTimer > 0) this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);

    // 5. Update Primary State-Based Animation State for Beat
    if (this.stumbleTimer > 0) {
      this.charAnimState = 'COLLISION';
    } else if (this.isJumping) {
      this.charAnimState = 'JUMPING';
    } else if (this.isSliding) {
      this.charAnimState = 'SLIDING';
    } else if (Math.abs(targetX - this.currentLaneX) > 0.08) {
      this.charAnimState = 'LANE_SWITCH';
    } else {
      this.charAnimState = 'RUNNING';
    }

    // 6. Officer Tempo Dynamic Chase Logic
    if (this.tempoStateTimer > 0) {
      this.tempoStateTimer = Math.max(0, this.tempoStateTimer - dt);
      if (this.tempoStateTimer === 0) {
        this.tempoState = this.isFever ? 'dancing' : 'chasing';
      }
    } else if (this.isFever) {
      this.tempoState = 'dancing';
    } else if (this.tempoDistance < 2.05) {
      this.tempoState = 'lunging';
    } else {
      this.tempoState = 'chasing';
    }

    const desiredDistance = this.isFever
      ? 4.2
      : this.dangerStumbles > 0
      ? 1.85
      : 2.4 + (this.grooveMeter / 100) * 1.5;
    this.tempoDistance += (desiredDistance - this.tempoDistance) * Math.min(1, 1.5 * dt);

    if (this.dangerStumbles > 0 && this.stumbleTimer === 0 && this.combo >= 6) {
      this.dangerStumbles = 0;
    }

    // 7. Spawner: Generate ahead of time
    this.spawnEntitiesAhead(currentBeat);

    // 8. Collision & Musical Note Collection Detection
    this.checkEntities(currentBeat);

    // 9. Update Groove Decay
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
          this.isDoubleJump = false;
          this.isSliding = false;
          this.slideProgress = 0;
          this.jumpProgress = 0;
          audio.playJumpAction();
          this.checkActivePulseOrLaser(currentBeat, currentTimeSec, bpm, 'jump');
          this.checkActiveNoteHit(currentBeat, currentTimeSec, bpm);
        } else if (!this.isDoubleJump && this.jumpProgress < 0.65) {
          this.isDoubleJump = true;
          this.jumpProgress = 0.15;
          audio.playJumpAction();
        }
        break;

      case 'slide':
        if (!this.isSliding) {
          this.isSliding = true;
          this.slideProgress = 0;
          if (this.isJumping) {
            this.isJumping = false;
            this.isDoubleJump = false;
            this.jumpProgress = 0;
          }
          audio.playSlideAction();
          this.checkActivePulseOrLaser(currentBeat, currentTimeSec, bpm, 'slide');
          this.checkActiveNoteHit(currentBeat, currentTimeSec, bpm);
        }
        break;

      case 'pulse':
        audio.playPulseAction();
        this.checkActivePulseOrLaser(currentBeat, currentTimeSec, bpm, 'pulse');
        break;

      case 'pause':
        this.pause();
        break;
    }
  }

  private checkActiveNoteHit(currentBeat: number, currentTimeSec: number, bpm: number): void {
    const windowBeats = TIMING_WINDOWS.GOOD_MS / 1000 / (60 / bpm);

    for (const ent of this.entities) {
      if (
        ent.type === 'note' &&
        ent.active &&
        !ent.collected &&
        this.isColliderOverlappingLane(ent.lane)
      ) {
        if (Math.abs(ent.beat - currentBeat) <= windowBeats) {
          const targetTime = ent.beat * (60 / bpm);
          const result = judgeTiming(currentTimeSec, targetTime);
          this.processHit(ent, result);
          break;
        }
      }
    }
  }

  private checkActivePulseOrLaser(
    currentBeat: number,
    currentTimeSec: number,
    bpm: number,
    actionType: 'jump' | 'slide' | 'pulse'
  ): void {
    const windowBeats = TIMING_WINDOWS.GOOD_MS / 1000 / (60 / bpm);

    for (const ent of this.entities) {
      if (ent.active) {
        if (ent.type === 'pulse' && !ent.cleared) {
          if (ent.lane === -1 || this.isColliderOverlappingLane(ent.lane)) {
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
        } else if (ent.type === 'barrier' && !ent.hit) {
          const kind = ent.barrierKind || (ent.isLaser ? 'low_laser' : 'train');
          if (
            (kind === 'low_laser' && actionType === 'jump') ||
            (kind === 'high_signal' && actionType === 'slide')
          ) {
            if (Math.abs(ent.beat - currentBeat) <= windowBeats) {
              ent.hit = true;
              const result: JudgmentResult = {
                rating: 'PERFECT',
                deltaMs: 0,
                score: 80,
                grooveChange: 8,
                label: actionType === 'slide' ? 'SLIDE CLEAR!' : 'LEAP CLEAR!',
              };
              this.processJudgment(result, this.targetLane);
              break;
            }
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
      const nextBeat = this.lastSpawnedBeat + 4;
      this.spawnBarChunk(this.lastSpawnedBeat, nextBeat);
      this.lastSpawnedBeat = nextBeat;
    }
  }

  private spawnBarChunk(barStartBeat: number, _barEndBeat: number): void {
    const barIndex = Math.floor(barStartBeat / 4);

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

    if (barIndex > 0 && barIndex % 8 === 0) {
      const pattern = CALL_RESPONSE_LIBRARY[barIndex % CALL_RESPONSE_LIBRARY.length];
      this.spawnCallResponsePattern(barStartBeat, pattern);
      return;
    }

    const isSequenceBar = barIndex % 3 === 1;
    const seqDef = MUSICAL_SEQUENCES[barIndex % MUSICAL_SEQUENCES.length];

    const patterns = this.currentGenre.rhythmPatterns;
    const chosenPattern = patterns[barIndex % patterns.length];
    const scale = this.currentGenre.scale;

    for (let i = 0; i < chosenPattern.subdivisions.length; i++) {
      const subBeat = barStartBeat + chosenPattern.subdivisions[i];
      const lane = chosenPattern.laneDistribution[i % chosenPattern.laneDistribution.length];
      const action = chosenPattern.actionRequired ? chosenPattern.actionRequired[i] : 'move';

      if (action === 'jump') {
        const useHighSignal = (barIndex + i) % 2 === 1;
        this.entities.push({
          id: this.nextEntityId++,
          type: 'barrier',
          lane,
          isLaser: !useHighSignal,
          barrierKind: useHighSignal ? 'high_signal' : 'low_laser',
          beat: subBeat,
          hit: false,
          active: true,
        });
      } else if (action === 'pulse') {
        this.entities.push({
          id: this.nextEntityId++,
          type: 'pulse',
          lane,
          beat: subBeat,
          cleared: false,
          active: true,
        });
      } else {
        const semitone = scale[i % scale.length];
        const noteName: ChromaticNote = isSequenceBar
          ? seqDef.notes[i % seqDef.notes.length]
          : semitoneToNoteName(semitone);

        const isChallengeNote =
          (this.activeMission.type === 'pitch_count' &&
            noteName === this.activeMission.targetNote) ||
          (this.activeMission.type === 'sequence' &&
            this.activeMission.targetSequence?.includes(noteName));

        this.entities.push({
          id: this.nextEntityId++,
          type: 'note',
          lane,
          beat: subBeat,
          semitone,
          noteName,
          noteVariant: isChallengeNote ? 'challenge' : isSequenceBar ? 'sequence' : 'free',
          collected: false,
          active: true,
        });

        if (i % 2 === 1 && Math.random() > 0.38) {
          const obstacleLane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
          this.entities.push({
            id: this.nextEntityId++,
            type: 'barrier',
            lane: obstacleLane,
            isLaser: false,
            barrierKind: 'train',
            beat: subBeat,
            hit: false,
            active: true,
          });
        }
      }
    }
  }

  private spawnCallResponsePattern(barStartBeat: number, pattern: CallResponsePattern): void {
    for (let i = 0; i < pattern.beats.length; i++) {
      const cueBeat = barStartBeat + pattern.beats[i];
      const timeSec = cueBeat * (60 / this.currentGenre.bpm);
      const freq = intervalToFrequency(this.currentGenre.baseNoteFrequency, pattern.notes[i]);
      setTimeout(() => {
        if (this.state === 'PLAYING') {
          audio.playCallCue(freq);
        }
      }, Math.max(0, (timeSec - audio.getCurrentSongTime()) * 1000));
    }

    for (let i = 0; i < pattern.beats.length; i++) {
      const echoBeat = barStartBeat + 4 + pattern.beats[i];
      const semitone = pattern.notes[i];
      this.entities.push({
        id: this.nextEntityId++,
        type: 'note',
        lane: pattern.lanes[i],
        beat: echoBeat,
        semitone,
        noteName: semitoneToNoteName(semitone),
        noteVariant: 'sequence',
        collected: false,
        active: true,
      });
    }
  }

  /**
   * Evaluates active entities relative to current beat using the dedicated PlayerCollider
   * so musical notes remain collectible during running, jumping, sliding, and lane switching.
   */
  private checkEntities(currentBeat: number): void {
    const missThresholdBeats = TIMING_WINDOWS.GOOD_MS / 1000 / (60 / this.currentGenre.bpm);

    for (const ent of this.entities) {
      if (!ent.active) continue;

      if (ent.type === 'note' && !ent.collected) {
        if (currentBeat - ent.beat > missThresholdBeats) {
          ent.active = false;
          const missResult: JudgmentResult = {
            rating: 'MISS',
            deltaMs: Math.round(missThresholdBeats * (60 / this.currentGenre.bpm) * 1000),
            score: 0,
            grooveChange: -15,
            label: `MISSED ${ent.noteName}`,
          };
          this.processJudgment(missResult, ent.lane);
        } else if (
          Math.abs(currentBeat - ent.beat) <= missThresholdBeats &&
          this.isColliderOverlappingLane(ent.lane)
        ) {
          const currentTime = audio.getCurrentSongTime();
          const targetTime = ent.beat * (60 / this.currentGenre.bpm);
          const result = judgeTiming(currentTime, targetTime);
          this.processHit(ent, result);
        }
      }

      if (ent.type === 'barrier' && !ent.hit) {
        if (Math.abs(currentBeat - ent.beat) < 0.15) {
          const kind = ent.barrierKind || (ent.isLaser ? 'low_laser' : 'train');
          if (kind === 'low_laser') {
            if (this.getPlayerHeight() < this.collider.jumpClearanceHeight && !this.isJumping) {
              ent.hit = true;
              this.handleCollision();
            }
          } else if (kind === 'high_signal') {
            if (!this.isSliding) {
              ent.hit = true;
              this.handleCollision();
            }
          } else {
            if (this.targetLane === ent.lane && !this.isDoubleJump) {
              ent.hit = true;
              this.handleCollision();
            }
          }
        }
      }

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

      if (ent.type === 'portal') {
        if (currentBeat >= ent.beat) {
          ent.active = false;
          this.shiftGenre(ent.targetGenre);
        }
      }

      if (currentBeat - ent.beat > 8) {
        ent.active = false;
      }
    }

    if (this.entities.length > 80) {
      this.entities = this.entities.filter((e) => e.active);
    }
  }

  private processHit(note: NoteEntity, result: JudgmentResult): void {
    if (note.collected) return; // Prevent double collection
    note.collected = true;
    note.active = false;

    const instrument = storage.getEquippedInstrument().id;
    const rating = result.rating === 'MISS' ? 'GOOD' : result.rating;
    audio.playNotePickup(note.lane, rating, note.noteName, instrument);
    input.triggerHaptic(15);

    this.lastCollectedPitch = note.noteName;
    this.noteGestureTimer = 0.32;
    if (result.rating === 'PERFECT' || note.noteVariant === 'challenge') {
      this.celebrateTimer = 0.42;
    }

    this.collectedNotesHistory.push(note.noteName);
    if (this.collectedNotesHistory.length > 8) {
      this.collectedNotesHistory.shift();
    }

    const expectedNote = this.activeSequence.notes[this.sequenceStepIndex];
    if (note.noteName === expectedNote || note.noteVariant === 'sequence') {
      this.sequenceStepIndex++;
      if (this.sequenceStepIndex >= this.activeSequence.notes.length) {
        this.sequencesCompleted++;
        this.sequenceStepIndex = 0;
        this.score += this.activeSequence.bonusScore;
        this.grooveMeter = Math.min(100, this.grooveMeter + 15);
        this.celebrateTimer = 0.55;

        this.tempoState = 'frustrated';
        this.tempoStateTimer = 1.25;
        this.tempoDistance = Math.min(4.6, this.tempoDistance + 0.85);

        audio.playSequenceCompleteChord(this.activeSequence.notes, instrument);
        const nextSeqIdx = this.sequencesCompleted % MUSICAL_SEQUENCES.length;
        this.activeSequence = MUSICAL_SEQUENCES[nextSeqIdx];
      }
    }

    this.updateMissionOnNote(note.noteName);

    const coinReward =
      (result.rating === 'PERFECT' ? 3 : result.rating === 'GREAT' ? 2 : 1) *
      (this.isFever ? 2 : 1);
    this.sessionCoins += coinReward;
    if (this.onCoinEarned) {
      this.onCoinEarned(this.sessionCoins, coinReward);
    }

    const musicalResult: JudgmentResult = {
      ...result,
      label: `♪ ${note.noteName} • ${result.rating}!`,
    };
    this.processJudgment(musicalResult, note.lane);
  }

  private updateMissionOnNote(noteName: ChromaticNote): void {
    const m = this.activeMission;
    if (m.type === 'pitch_count' && noteName === m.targetNote) {
      this.missionProgress++;
    } else if (m.type === 'sequence' && m.targetSequence) {
      const targetNote = m.targetSequence[this.missionProgress];
      if (noteName === targetNote) {
        this.missionProgress++;
      }
    } else if (m.type === 'unique_notes') {
      this.uniqueNotesSet.add(noteName);
      this.missionProgress = this.uniqueNotesSet.size;
    } else if (m.type === 'flawless_streak') {
      this.missionProgress = Math.min(m.targetCount, this.combo + 1);
    }

    if (this.missionProgress >= m.targetCount) {
      this.sessionCoins += m.rewardCoins;
      if (this.onCoinEarned) {
        this.onCoinEarned(this.sessionCoins, m.rewardCoins);
      }
      this.missionIndex++;
      this.activeMission = MUSICAL_MISSIONS[this.missionIndex % MUSICAL_MISSIONS.length];
      this.missionProgress = 0;
      this.uniqueNotesSet.clear();
    }
  }

  private handleCollision(): void {
    audio.playObstacleClash();
    input.triggerHaptic(60);

    this.stumbleTimer = 0.6;
    this.charAnimState = 'COLLISION';
    this.dangerStumbles++;
    this.tempoDistance = Math.max(1.45, this.tempoDistance - 1.25);
    this.tempoState = 'lunging';
    this.tempoStateTimer = 1.6;

    const clashResult: JudgmentResult = {
      rating: 'MISS',
      deltaMs: 0,
      score: 0,
      grooveChange: -25,
      label:
        this.dangerStumbles >= 2
          ? 'CAUGHT BY OFFICER TEMPO!'
          : 'STUMBLED! TEMPO CLOSING IN!',
    };
    this.processJudgment(clashResult, this.targetLane);

    if (this.dangerStumbles >= 2 && this.tempoDistance <= 1.9) {
      this.stop();
    }
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
      if (this.activeMission.type === 'flawless_streak') {
        this.missionProgress = 0;
      }
    }

    this.maxCombo = Math.max(this.maxCombo, this.combo);

    if (this.combo >= 50) this.multiplier = 4;
    else if (this.combo >= 25) this.multiplier = 3;
    else if (this.combo >= 10) this.multiplier = 2;
    else this.multiplier = 1;

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
      this.onScoreChange(
        this.score,
        this.combo,
        this.grooveMeter,
        this.isFever ? this.multiplier * 2 : this.multiplier
      );
    }
  }

  public computeDiagnostics(): PerformanceDiagnostics {
    const total = this.perfectCount + this.greatCount + this.goodCount + this.missCount;
    const accuracyPercent =
      total > 0
        ? Math.round(
            ((this.perfectCount * 1.0 + this.greatCount * 0.75 + this.goodCount * 0.45) / total) *
              100
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
      sessionCoins: this.sessionCoins,
      sequencesCompleted: this.sequencesCompleted,
      rank,
      genreMastery: `${this.currentGenre.name} (${this.currentGenre.skillFocus})`,
    };
  }
}

export const game = new GameManager();
