// Beat Runner - UI State, Screen Transitions & Latency Calibrator

import { game, PerformanceDiagnostics } from './game.ts';
import { GENRES, GenreId, GENRE_ORDER, GenreTheme } from './genres.ts';
import { storage } from './storage.ts';
import { input } from './input.ts';
import { audio } from './audio.ts';
import { JudgmentResult } from './rhythm.ts';

export class UIManager {
  // Screens
  private menuScreen!: HTMLElement;
  private calibrateScreen!: HTMLElement;
  private gameoverScreen!: HTMLElement;
  private hudElement!: HTMLElement;

  // HUD Elements
  private hudScore!: HTMLElement;
  private hudCombo!: HTMLElement;
  private hudMultiplier!: HTMLElement;
  private hudGenreName!: HTMLElement;
  private hudBpm!: HTMLElement;
  private grooveFill!: HTMLElement;
  private grooveText!: HTMLElement;
  private timingMarker!: HTMLElement;
  private timingLabel!: HTMLElement;

  // Menu Elements
  private genreSelectContainer!: HTMLElement;
  private genreGridItems!: HTMLElement;
  private selectedStageGenre: GenreId = 'synthwave';
  private menuOffsetLabel!: HTMLElement;

  // Calibrator State
  private calibratorPad!: HTMLElement;
  private latencySlider!: HTMLInputElement;
  private latencySliderVal!: HTMLElement;
  private calibratorInterval: number | null = null;
  private calibratorTaps: number[] = [];
  private nextExpectedClickTime = 0;

  constructor() {
    this.cacheDOMElements();
    this.setupEventListeners();
    this.populateGenreGrid();
    this.detectTouchDevice();
    this.updateOffsetLabels();
  }

  private cacheDOMElements(): void {
    this.menuScreen = document.getElementById('menu-screen')!;
    this.calibrateScreen = document.getElementById('calibrate-screen')!;
    this.gameoverScreen = document.getElementById('gameover-screen')!;
    this.hudElement = document.getElementById('game-hud')!;

    this.hudScore = document.getElementById('hud-score')!;
    this.hudCombo = document.getElementById('hud-combo')!;
    this.hudMultiplier = document.getElementById('hud-multiplier')!;
    this.hudGenreName = document.getElementById('hud-genre-name')!;
    this.hudBpm = document.getElementById('hud-bpm')!;
    this.grooveFill = document.getElementById('groove-fill')!;
    this.grooveText = document.getElementById('groove-text')!;
    this.timingMarker = document.getElementById('timing-marker')!;
    this.timingLabel = document.getElementById('timing-label')!;

    this.genreSelectContainer = document.getElementById('genre-select-container')!;
    this.genreGridItems = document.getElementById('genre-grid-items')!;
    this.menuOffsetLabel = document.getElementById('menu-offset-label')!;

    this.calibratorPad = document.getElementById('calibrator-pad')!;
    this.latencySlider = document.getElementById('latency-slider') as HTMLInputElement;
    this.latencySliderVal = document.getElementById('latency-slider-val')!;
  }

  private setupEventListeners(): void {
    // Mode Buttons
    document.getElementById('btn-play-endless')?.addEventListener('click', () => {
      this.startGame('ENDLESS', 'synthwave');
    });

    document.getElementById('btn-open-stages')?.addEventListener('click', () => {
      const isHidden = this.genreSelectContainer.style.display === 'none';
      this.genreSelectContainer.style.display = isHidden ? 'flex' : 'none';
    });

    document.getElementById('btn-start-stage')?.addEventListener('click', () => {
      this.startGame('STAGE', this.selectedStageGenre);
    });

    document.getElementById('btn-pulse-dojo')?.addEventListener('click', () => {
      this.startGame('PULSE_DOJO', 'jazz');
    });

    // Calibrator Open / Close
    document.getElementById('btn-open-calibrate')?.addEventListener('click', () => {
      this.openCalibrator();
    });

    document.getElementById('btn-save-calibrate')?.addEventListener('click', () => {
      this.closeCalibrator();
    });

    this.latencySlider.addEventListener('input', () => {
      const val = parseInt(this.latencySlider.value, 10);
      this.latencySliderVal.innerText = `${val}ms`;
      storage.saveSettings({ audioOffsetMs: val });
      audio.setLatencyOffset(val);
      this.updateOffsetLabels();
    });

    this.calibratorPad.addEventListener('click', () => {
      this.handleCalibratorTap();
    });

    // Post-Run Buttons
    document.getElementById('btn-restart-run')?.addEventListener('click', () => {
      this.hideAllScreens();
      game.start();
      this.hudElement.classList.add('active');
    });

    document.getElementById('btn-return-menu')?.addEventListener('click', () => {
      this.hideAllScreens();
      this.menuScreen.classList.add('active');
      this.hudElement.classList.remove('active');
    });

    // Mobile Direct Lane Buttons
    document.getElementById('touch-lane-0')?.addEventListener('click', () => {
      input.handleActionDirectly({ type: 'set_lane', targetLane: 0, timestamp: performance.now() });
    });
    document.getElementById('touch-lane-1')?.addEventListener('click', () => {
      input.handleActionDirectly({ type: 'set_lane', targetLane: 1, timestamp: performance.now() });
    });
    document.getElementById('touch-lane-2')?.addEventListener('click', () => {
      input.handleActionDirectly({ type: 'set_lane', targetLane: 2, timestamp: performance.now() });
    });
    document.getElementById('mobile-pulse-btn')?.addEventListener('click', () => {
      input.handleActionDirectly({ type: 'jump', timestamp: performance.now() });
    });
  }

  private detectTouchDevice(): void {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('has-touch');
    }
  }

  private updateOffsetLabels(): void {
    const offset = storage.getSettings().audioOffsetMs;
    this.menuOffsetLabel.innerText = `${offset}ms`;
    this.latencySlider.value = offset.toString();
    this.latencySliderVal.innerText = `${offset}ms`;
  }

  private populateGenreGrid(): void {
    this.genreGridItems.innerHTML = '';
    for (const genreId of GENRE_ORDER) {
      const g = GENRES[genreId];
      const card = document.createElement('div');
      card.className = `genre-card ${genreId === this.selectedStageGenre ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="genre-card-title">${g.name}</div>
        <div class="genre-card-bpm">${g.bpm} BPM • ${g.timeSignature.join('/')}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedStageGenre = genreId;
        const allCards = this.genreGridItems.querySelectorAll('.genre-card');
        allCards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      this.genreGridItems.appendChild(card);
    }
  }

  public startGame(mode: 'ENDLESS' | 'STAGE' | 'PULSE_DOJO', genreId: GenreId): void {
    this.hideAllScreens();
    game.setMode(mode, genreId);
    game.start();
    this.hudElement.classList.add('active');
  }

  private hideAllScreens(): void {
    this.menuScreen.classList.remove('active');
    this.calibrateScreen.classList.remove('active');
    this.gameoverScreen.classList.remove('active');
  }

  // --- Latency Calibrator Engine ---

  private async openCalibrator(): Promise<void> {
    await audio.init();
    this.hideAllScreens();
    this.calibrateScreen.classList.add('active');
    this.calibratorTaps = [];
    this.calibratorPad.innerText = 'TAP ON THE BEAT (0/8)';

    // Start 120 BPM Metronome Click Loop (every 500ms)
    this.nextExpectedClickTime = performance.now() + 500;
    this.calibratorInterval = window.setInterval(() => {
      this.nextExpectedClickTime = performance.now();
      audio.playPulseAction();

      // Visual flash
      this.calibratorPad.classList.add('pulse');
      setTimeout(() => this.calibratorPad.classList.remove('pulse'), 100);
    }, 500);
  }

  private handleCalibratorTap(): void {
    const tapTime = performance.now();
    const delta = tapTime - this.nextExpectedClickTime;
    // Map delta to [-250, 250] range
    const normalizedDelta = ((delta + 250) % 500) - 250;

    this.calibratorTaps.push(normalizedDelta);
    this.calibratorPad.innerText = `TAP ON THE BEAT (${this.calibratorTaps.length}/8)`;

    if (this.calibratorTaps.length >= 8) {
      // Calculate average offset
      const sum = this.calibratorTaps.reduce((acc, v) => acc + v, 0);
      const avg = Math.round(sum / this.calibratorTaps.length);
      const clamped = Math.max(-100, Math.min(150, avg));

      this.latencySlider.value = clamped.toString();
      this.latencySliderVal.innerText = `${clamped}ms`;
      storage.saveSettings({ audioOffsetMs: clamped });
      audio.setLatencyOffset(clamped);
      this.updateOffsetLabels();

      this.calibratorPad.innerText = `CALIBRATED: ${clamped}ms! TAP TO RETEST`;
      this.calibratorTaps = [];
    }
  }

  private closeCalibrator(): void {
    if (this.calibratorInterval !== null) {
      clearInterval(this.calibratorInterval);
      this.calibratorInterval = null;
    }
    this.hideAllScreens();
    this.menuScreen.classList.add('active');
  }

  // --- Real-time In-Game HUD Updates ---

  public updateHUD(score: number, combo: number, groove: number, multiplier: number): void {
    this.hudScore.innerText = score.toLocaleString();
    this.hudCombo.innerText = combo.toString();
    this.hudMultiplier.innerText = `${multiplier}x`;

    this.grooveFill.style.width = `${Math.min(100, Math.max(0, groove))}%`;
    this.grooveText.innerText = `${Math.round(groove)}%`;

    if (groove >= 100) {
      this.grooveFill.classList.add('fever');
    } else {
      this.grooveFill.classList.remove('fever');
    }
  }

  public updateGenre(genre: GenreTheme): void {
    this.hudGenreName.innerText = genre.name;
    this.hudBpm.innerText = `${genre.bpm} BPM`;
  }

  public updateTimingNeedle(result: JudgmentResult): void {
    // Map deltaMs [-100ms .. +100ms] to [0% .. 100%]
    const clamped = Math.max(-100, Math.min(100, result.deltaMs));
    const percent = 50 + (clamped / 100) * 50;
    this.timingMarker.style.left = `${percent}%`;

    const color =
      result.rating === 'PERFECT'
        ? '#00ffff'
        : result.rating === 'GREAT'
        ? '#ffeb3b'
        : result.rating === 'GOOD'
        ? '#ff9800'
        : '#ff1744';

    this.timingMarker.style.backgroundColor = color;
    this.timingLabel.style.color = color;
    this.timingLabel.innerText = result.label;
  }

  // --- Post-Run Diagnostics Screen ---

  public showDiagnostics(diag: PerformanceDiagnostics): void {
    this.hudElement.classList.remove('active');
    this.hideAllScreens();
    this.gameoverScreen.classList.add('active');

    const rankEl = document.getElementById('diag-rank')!;
    const scoreEl = document.getElementById('diag-score')!;
    const masteryEl = document.getElementById('diag-genre-mastery')!;
    const accEl = document.getElementById('diag-accuracy')!;
    const maxComboEl = document.getElementById('diag-maxcombo')!;
    const meanDeltaEl = document.getElementById('diag-meandelta')!;
    const breakdownEl = document.getElementById('diag-breakdown')!;

    rankEl.innerText = diag.rank;
    scoreEl.innerText = `${diag.finalScore.toLocaleString()} PTS`;
    masteryEl.innerText = diag.genreMastery;
    accEl.innerText = `${diag.accuracyPercent}%`;
    maxComboEl.innerText = diag.maxCombo.toString();

    const sign = diag.meanDeltaMs > 0 ? '+' : '';
    meanDeltaEl.innerText = `${sign}${diag.meanDeltaMs}ms ${
      diag.meanDeltaMs > 10 ? '(Late)' : diag.meanDeltaMs < -10 ? '(Early)' : '(Locked In!)'
    }`;
    breakdownEl.innerText = `${diag.perfectCount} / ${diag.greatCount} / ${diag.missCount}`;
  }
}
