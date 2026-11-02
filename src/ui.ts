// Beat Runner - Subway Surfers Musical Chase Arcade UI Manager

import { game, PerformanceDiagnostics } from './game.ts';
import { GENRES, GenreId, GENRE_ORDER, GenreTheme } from './genres.ts';
import { storage, AVAILABLE_SKINS, AVAILABLE_INSTRUMENTS } from './storage.ts';
import { input } from './input.ts';
import { audio } from './audio.ts';
import { ICONS } from './icons.ts';

export class UIManager {
  // Screens & Modals
  private lobbyScreen!: HTMLElement;
  private hudElement!: HTMLElement;
  private countdownOverlay!: HTMLElement;
  private countdownText!: HTMLElement;
  private modalWorlds!: HTMLElement;
  private modalGarage!: HTMLElement;
  private modalDojo!: HTMLElement;
  private modalPause!: HTMLElement;
  private modalGameover!: HTMLElement;

  // Lobby Header Elements
  private lobbyRankVal!: HTMLElement;
  private lobbyBestStreak!: HTMLElement;
  private lobbyCoinCount!: HTMLElement;
  private lobbyOffsetLabel!: HTMLElement;
  private lobbyActiveGenreBadge!: HTMLElement;
  private garageBadgeCount!: HTMLElement;

  // HUD Elements
  private hudScore!: HTMLElement;
  private hudMultiplier!: HTMLElement;
  private hudSessionCoins!: HTMLElement;
  private hudGenreName!: HTMLElement;
  private hudBpm!: HTMLElement;
  private hudGrooveText!: HTMLElement;
  private hudGrooveFill!: HTMLElement;
  private hudSequenceName!: HTMLElement;
  private hudSequenceNotes!: HTMLElement;
  private hudNotesList!: HTMLElement;
  private hudMissionText!: HTMLElement;
  private hudTempoRadar!: HTMLElement;
  private stemChips: HTMLElement[] = [];

  // Calibrator State
  private calibratorPad!: HTMLElement;
  private latencySlider!: HTMLInputElement;
  private latencySliderVal!: HTMLElement;
  private calibratorInterval: number | null = null;
  private calibratorTaps: number[] = [];
  private nextExpectedClickTime = 0;

  // Active Stage
  private selectedStageGenre: GenreId = 'synthwave';
  private isSoundMuted = false;

  constructor() {
    this.cacheDOMElements();
    this.injectSVGIcons();
    this.setupEventListeners();
    this.updateLobbyTelemetry();
    this.populateWorldsGrid();
    this.populateGarageGrid();
  }

  private cacheDOMElements(): void {
    this.lobbyScreen = document.getElementById('lobby-screen')!;
    this.hudElement = document.getElementById('game-hud')!;
    this.countdownOverlay = document.getElementById('countdown-overlay')!;
    this.countdownText = document.getElementById('countdown-text')!;
    this.modalWorlds = document.getElementById('modal-worlds')!;
    this.modalGarage = document.getElementById('modal-garage')!;
    this.modalDojo = document.getElementById('modal-dojo')!;
    this.modalPause = document.getElementById('modal-pause')!;
    this.modalGameover = document.getElementById('modal-gameover')!;

    this.lobbyRankVal = document.getElementById('lobby-rank-val')!;
    this.lobbyBestStreak = document.getElementById('lobby-best-streak')!;
    this.lobbyCoinCount = document.getElementById('lobby-coin-count')!;
    this.lobbyOffsetLabel = document.getElementById('lobby-offset-label')!;
    this.lobbyActiveGenreBadge = document.getElementById('lobby-active-genre-badge')!;
    this.garageBadgeCount = document.getElementById('garage-badge-count')!;

    this.hudScore = document.getElementById('hud-score')!;
    this.hudMultiplier = document.getElementById('hud-multiplier')!;
    this.hudSessionCoins = document.getElementById('hud-session-coins')!;
    this.hudGenreName = document.getElementById('hud-genre-name')!;
    this.hudBpm = document.getElementById('hud-bpm')!;
    this.hudGrooveText = document.getElementById('hud-groove-text')!;
    this.hudGrooveFill = document.getElementById('hud-groove-fill')!;
    this.hudSequenceName = document.getElementById('hud-sequence-name')!;
    this.hudSequenceNotes = document.getElementById('hud-sequence-notes')!;
    this.hudNotesList = document.getElementById('hud-notes-list')!;
    this.hudMissionText = document.getElementById('hud-mission-text')!;
    this.hudTempoRadar = document.getElementById('hud-tempo-radar')!;

    this.stemChips = [
      document.getElementById('stem-1')!,
      document.getElementById('stem-2')!,
      document.getElementById('stem-3')!,
      document.getElementById('stem-4')!,
    ];

    this.calibratorPad = document.getElementById('calibrator-pad')!;
    this.latencySlider = document.getElementById('latency-slider') as HTMLInputElement;
    this.latencySliderVal = document.getElementById('latency-slider-val')!;
  }

  private injectSVGIcons(): void {
    const iconMap: Record<string, string> = {
      'icon-rank-crown': ICONS.trophy,
      'icon-high-trophy': ICONS.star,
      'icon-lobby-coin': ICONS.beatCoin,
      'icon-lobby-calibrate': ICONS.calibrate,
      'icon-lobby-sound': ICONS.volume,
      'icon-tab-worlds': ICONS.worlds,
      'icon-tab-garage': ICONS.garage,
      'icon-tab-dojo': ICONS.dojo,
      'icon-play-giant': ICONS.play,
      'icon-hud-pause': ICONS.pause,
      'icon-groove-flame': ICONS.flame,
      'icon-hud-star': ICONS.star,
      'icon-hud-coin': ICONS.beatCoin,
      'icon-lobby-fullscreen': ICONS.fullscreen,
      'icon-mobile-left': ICONS.left,
      'icon-mobile-right': ICONS.right,
      'icon-mobile-slide': ICONS.slide,
      'icon-mobile-jump': ICONS.jump,
      'icon-modal-worlds': ICONS.worlds,
      'icon-close-worlds': ICONS.close,
      'icon-modal-garage': ICONS.garage,
      'icon-garage-coin': ICONS.beatCoin,
      'icon-close-garage': ICONS.close,
      'icon-modal-dojo': ICONS.dojo,
      'icon-close-dojo': ICONS.close,
      'icon-dojo-train': ICONS.play,
      'icon-pause-resume': ICONS.play,
      'icon-pause-restart': ICONS.replay,
      'icon-pause-home': ICONS.home,
      'icon-diag-coin': ICONS.beatCoin,
      'icon-diag-replay': ICONS.replay,
      'icon-diag-home': ICONS.home,
    };

    for (const [id, svgHtml] of Object.entries(iconMap)) {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = svgHtml;
      }
    }
  }

  private setupEventListeners(): void {
    // 1. Play Button (Triggers 3-2-1 Countdown & Launches Run)
    document.getElementById('btn-play-endless')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.startRunWithCountdown('ENDLESS', this.selectedStageGenre);
    });

    // 2. Bottom Dock Tabs
    document.getElementById('btn-tab-worlds')?.addEventListener('click', () => {
      audio.playTabSwitch();
      this.openModal(this.modalWorlds);
    });

    document.getElementById('btn-tab-garage')?.addEventListener('click', () => {
      audio.playTabSwitch();
      this.populateGarageGrid();
      this.openModal(this.modalGarage);
    });

    document.getElementById('btn-tab-dojo')?.addEventListener('click', () => {
      audio.playTabSwitch();
      this.openModal(this.modalDojo);
    });

    // 3. Modal Close Buttons
    document.getElementById('btn-close-worlds')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalWorlds);
    });

    document.getElementById('btn-close-garage')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalGarage);
    });

    document.getElementById('btn-close-dojo')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalDojo);
    });

    // 4. Quick Header Controls
    document.getElementById('btn-quick-calibrate')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.openModal(this.modalDojo);
    });

    document.getElementById('btn-quick-audio')?.addEventListener('click', () => {
      this.isSoundMuted = !this.isSoundMuted;
      audio.setMasterVolume(this.isSoundMuted ? 0 : 0.85);
      const btn = document.getElementById('icon-lobby-sound');
      if (btn) btn.innerHTML = this.isSoundMuted ? ICONS.mute : ICONS.volume;
      audio.playButtonPop();
    });

    // 5. In-Game Pause
    document.getElementById('btn-pause-game')?.addEventListener('click', () => {
      audio.playButtonPop();
      game.pause();
      this.openModal(this.modalPause);
    });

    document.getElementById('btn-resume-run')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalPause);
      game.resume();
    });

    document.getElementById('btn-restart-from-pause')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalPause);
      this.startRunWithCountdown(game.mode, game.currentGenre.id);
    });

    document.getElementById('btn-quit-to-lobby')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalPause);
      this.returnToLobby();
    });

    // 6. Post-Run Podium Actions
    document.getElementById('btn-restart-run')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalGameover);
      this.startRunWithCountdown(game.mode, game.currentGenre.id);
    });

    document.getElementById('btn-return-lobby')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalGameover);
      this.returnToLobby();
    });

    // 7. Pulse Dojo Start
    document.getElementById('btn-start-pulse-dojo')?.addEventListener('click', () => {
      audio.playButtonPop();
      this.closeModal(this.modalDojo);
      this.startRunWithCountdown('PULSE_DOJO', 'jazz');
    });

    // 8. Calibrator Pad & Slider
    this.calibratorPad.addEventListener('click', () => this.handleCalibratorTap());
    this.latencySlider.addEventListener('input', () => {
      const val = parseInt(this.latencySlider.value, 10);
      this.latencySliderVal.innerText = `${val}ms`;
      storage.saveSettings({ audioOffsetMs: val });
      audio.setLatencyOffset(val);
      this.lobbyOffsetLabel.innerText = `${val}ms`;
    });

    // 9. Tactile Mobile Steer, Jump & Slide Buttons (Zero Latency pointerdown/touchstart)
    input.bindActionButton(document.getElementById('mobile-left-btn'), 'move_left');
    input.bindActionButton(document.getElementById('mobile-right-btn'), 'move_right');
    input.bindActionButton(document.getElementById('mobile-slide-btn'), 'slide');
    input.bindActionButton(document.getElementById('mobile-pulse-btn'), 'jump');

    // Hide mobile swipe guide on first action or after 4 seconds
    const swipeGuide = document.getElementById('mobile-swipe-guide');
    input.registerCallback(() => {
      if (swipeGuide && !swipeGuide.classList.contains('dismissed')) {
        swipeGuide.classList.add('dismissed');
      }
    });

    // 10. Fullscreen Mode Toggle for Mobile & Web
    const fsBtn = document.getElementById('btn-quick-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        audio.playButtonPop();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      });
    }

    // 11. Mobile Auto-Pause on Incoming Call / App Switch
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state === 'PLAYING') {
        game.pause();
        this.openModal(this.modalPause);
      }
    });

    // 12. Mobile Orientation Advisory (Suggests Portrait for Subway Surfers Gameplay)
    const checkOrientation = () => {
      const hint = document.getElementById('orientation-hint');
      const isMobile = window.innerWidth <= 900 || 'ontouchstart' in window;
      const isLandscape = window.innerWidth > window.innerHeight;
      if (hint && isMobile && isLandscape && !hint.dataset.dismissed) {
        hint.style.display = 'flex';
      } else if (hint) {
        hint.style.display = 'none';
      }
    };
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    document.getElementById('btn-close-orientation')?.addEventListener('click', () => {
      const hint = document.getElementById('orientation-hint');
      if (hint) {
        hint.style.display = 'none';
        hint.dataset.dismissed = 'true';
      }
    });
    setTimeout(checkOrientation, 1000);
  }

  public updateLobbyTelemetry(): void {
    const coins = storage.getCoins();
    this.lobbyCoinCount.innerText = coins.toLocaleString();
    const garageCoins = document.getElementById('garage-coin-count');
    if (garageCoins) garageCoins.innerText = coins.toLocaleString();

    const synthRecord = storage.getRecord('synthwave');
    this.lobbyBestStreak.innerText = (synthRecord.maxCombo || 0).toString();
    this.lobbyRankVal.innerText = synthRecord.bestRank
      ? `RANK ${synthRecord.bestRank}`
      : 'NOVICE • LVL 1';

    this.garageBadgeCount.innerText = `${AVAILABLE_INSTRUMENTS.length}`;

    const offset = storage.getSettings().audioOffsetMs;
    this.lobbyOffsetLabel.innerText = `${offset}ms`;
    this.latencySlider.value = offset.toString();
    this.latencySliderVal.innerText = `${offset}ms`;

    const g = GENRES[this.selectedStageGenre];
    const inst = storage.getEquippedInstrument();
    this.lobbyActiveGenreBadge.innerText = `${g.name.toUpperCase()} • ${g.bpm} BPM • ${inst.name.toUpperCase()}`;
  }

  private openModal(modal: HTMLElement): void {
    this.closeAllModals();
    modal.classList.add('active');

    if (modal === this.modalDojo) {
      this.startCalibratorMetronome();
    }
  }

  private closeModal(modal: HTMLElement): void {
    modal.classList.remove('active');
    if (modal === this.modalDojo) {
      this.stopCalibratorMetronome();
    }
  }

  private closeAllModals(): void {
    this.modalWorlds.classList.remove('active');
    this.modalGarage.classList.remove('active');
    this.modalDojo.classList.remove('active');
    this.modalPause.classList.remove('active');
    this.modalGameover.classList.remove('active');
    this.stopCalibratorMetronome();
  }

  private async startRunWithCountdown(
    mode: 'ENDLESS' | 'STAGE' | 'PULSE_DOJO',
    genreId: GenreId
  ): Promise<void> {
    await audio.init();
    this.closeAllModals();
    this.lobbyScreen.classList.remove('active');
    this.hudElement.classList.remove('active');

    game.setMode(mode, genreId);

    this.countdownOverlay.classList.add('active');
    const counts = ['3', '2', '1', 'PLAY!'];

    for (let i = 0; i < counts.length; i++) {
      this.countdownText.innerText = counts[i];
      this.countdownText.style.animation = 'none';
      void this.countdownText.offsetHeight;
      this.countdownText.style.animation = 'countdown-pop 0.45s var(--ease-spring)';

      if (i < 3) {
        audio.playCountdownTick();
      } else {
        audio.playCountdownGo();
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.countdownOverlay.classList.remove('active');
    this.hudElement.classList.add('active');
    game.start();
  }

  public returnToLobby(): void {
    game.state = 'MENU';
    audio.stopPlayback();
    this.closeAllModals();
    this.hudElement.classList.remove('active');
    this.lobbyScreen.classList.add('active');
    this.updateLobbyTelemetry();
  }

  private populateWorldsGrid(): void {
    const container = document.getElementById('worlds-grid');
    if (!container) return;
    container.innerHTML = '';

    for (const genreId of GENRE_ORDER) {
      const g = GENRES[genreId];
      const record = storage.getRecord(genreId);
      const isSelected = genreId === this.selectedStageGenre;

      const card = document.createElement('div');
      card.className = `world-card ${isSelected ? 'active-selected' : ''}`;
      card.innerHTML = `
        <div>
          <div class="world-card-name">${g.name}</div>
          <div class="world-card-meta">${g.bpm} BPM • ${g.timeSignature.join('/')}</div>
        </div>
        <div style="font-size: 11px; color: #94a3b8; line-height: 1.3;">${g.description}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span class="world-card-rank">RANK: ${record.bestRank || 'C'}</span>
          <button class="btn-arcade-action btn-select-world" data-genre="${genreId}" style="padding: 6px 14px; font-size: 11px;">
            ${isSelected ? 'READY' : 'SELECT'}
          </button>
        </div>
      `;

      card.querySelector('.btn-select-world')?.addEventListener('click', () => {
        audio.playButtonPop();
        this.selectedStageGenre = genreId;
        this.updateLobbyTelemetry();
        this.populateWorldsGrid();
        this.closeModal(this.modalWorlds);
        this.startRunWithCountdown('STAGE', genreId);
      });

      container.appendChild(card);
    }
  }

  /**
   * Populates the Studio Modal with Beat's 6 Magical Instruments + 5 Soundboards
   */
  private populateGarageGrid(): void {
    const container = document.getElementById('garage-skins-grid');
    if (!container) return;
    container.innerHTML = '';

    const equippedInstrument = storage.getEquippedInstrument();

    const instHeader = document.createElement('div');
    instHeader.className = 'studio-section-title';
    instHeader.innerText = '🎵 BEAT’S MAGICAL INSTRUMENTS (TAP TO EQUIP & HEAR)';
    container.appendChild(instHeader);

    for (const inst of AVAILABLE_INSTRUMENTS) {
      const isSelected = equippedInstrument.id === inst.id;
      const card = document.createElement('div');
      card.className = `skin-card ${isSelected ? 'equipped' : ''}`;
      card.innerHTML = `
        <div class="skin-info">
          <div class="skin-name" style="color: ${inst.color}">♪ ${inst.name} <span style="font-size: 11px; opacity: 0.75;">(${inst.subtitle})</span></div>
          <div class="skin-desc">${inst.description}</div>
        </div>
        <div class="skin-actions">
          ${
            isSelected
              ? `<span style="font-family: var(--font-display); font-size: 12px; color: #4ade80; font-weight: 800;">ACTIVE</span>`
              : `<button class="btn-arcade-action btn-select-inst" data-inst="${inst.id}" style="padding: 6px 14px; font-size: 11px;">SELECT</button>`
          }
        </div>
      `;

      card.addEventListener('click', async () => {
        await audio.init();
        storage.equipInstrument(inst.id);
        audio.playSequenceCompleteChord(['C', 'E', 'G', 'C'], inst.id);
        this.updateLobbyTelemetry();
        this.populateGarageGrid();
      });

      container.appendChild(card);
    }

    const boardHeader = document.createElement('div');
    boardHeader.className = 'studio-section-title';
    boardHeader.style.marginTop = '10px';
    boardHeader.innerText = '🛹 SOUNDBOARD SKINS';
    container.appendChild(boardHeader);

    const coins = storage.getCoins();
    const equippedSkin = storage.getEquippedSkin();

    for (const skin of AVAILABLE_SKINS) {
      const isUnlocked = storage.isSkinUnlocked(skin.id);
      const isEquipped = equippedSkin.id === skin.id;

      const card = document.createElement('div');
      card.className = `skin-card ${isEquipped ? 'equipped' : ''}`;

      let actionHtml = '';
      if (isEquipped) {
        actionHtml = `<span style="font-family: var(--font-display); font-size: 12px; color: #4ade80; font-weight: 800;">EQUIPPED</span>`;
      } else if (isUnlocked) {
        actionHtml = `<button class="btn-arcade-secondary btn-equip-skin" data-id="${skin.id}" style="padding: 6px 16px; font-size: 11px;">EQUIP</button>`;
      } else {
        const canAfford = coins >= skin.cost;
        actionHtml = `<button class="btn-arcade-action btn-unlock-skin" data-id="${skin.id}" style="padding: 6px 14px; font-size: 11px; ${
          !canAfford ? 'opacity: 0.6;' : ''
        }">
          ♪ ${skin.cost}
        </button>`;
      }

      card.innerHTML = `
        <div class="skin-info">
          <div class="skin-name" style="color: ${skin.primaryColor}">${skin.name}</div>
          <div class="skin-desc">${skin.description}</div>
        </div>
        <div class="skin-actions">${actionHtml}</div>
      `;

      card.querySelector('.btn-equip-skin')?.addEventListener('click', () => {
        audio.playButtonPop();
        storage.equipSkin(skin.id);
        this.populateGarageGrid();
      });

      card.querySelector('.btn-unlock-skin')?.addEventListener('click', () => {
        if (storage.unlockSkin(skin.id)) {
          audio.playCoinPickup();
          this.updateLobbyTelemetry();
          this.populateGarageGrid();
        } else {
          audio.playButtonPop();
        }
      });

      container.appendChild(card);
    }
  }

  private startCalibratorMetronome(): void {
    this.calibratorTaps = [];
    this.calibratorPad.innerText = 'TAP TO THE BEAT (0/8)';

    this.nextExpectedClickTime = performance.now() + 500;
    this.calibratorInterval = window.setInterval(() => {
      this.nextExpectedClickTime = performance.now();
      audio.playCountdownTick();

      this.calibratorPad.classList.add('pulse');
      setTimeout(() => this.calibratorPad.classList.remove('pulse'), 90);
    }, 500);
  }

  private handleCalibratorTap(): void {
    const tapTime = performance.now();
    const delta = tapTime - this.nextExpectedClickTime;
    const normalizedDelta = ((delta + 250) % 500) - 250;

    this.calibratorTaps.push(normalizedDelta);
    this.calibratorPad.innerText = `TAP TO THE BEAT (${this.calibratorTaps.length}/8)`;

    if (this.calibratorTaps.length >= 8) {
      const sum = this.calibratorTaps.reduce((acc, v) => acc + v, 0);
      const avg = Math.round(sum / this.calibratorTaps.length);
      const clamped = Math.max(-100, Math.min(150, avg));

      this.latencySlider.value = clamped.toString();
      this.latencySliderVal.innerText = `${clamped}ms`;
      storage.saveSettings({ audioOffsetMs: clamped });
      audio.setLatencyOffset(clamped);
      this.lobbyOffsetLabel.innerText = `${clamped}ms`;

      this.calibratorPad.innerText = `SYNCED: ${clamped}ms! TAP TO RETEST`;
      this.calibratorTaps = [];
      audio.playCoinPickup();
    }
  }

  private stopCalibratorMetronome(): void {
    if (this.calibratorInterval !== null) {
      clearInterval(this.calibratorInterval);
      this.calibratorInterval = null;
    }
  }

  // --- Real-time In-Game HUD Telemetry ---

  public updateHUD(score: number, _combo: number, groove: number, multiplier: number): void {
    this.hudScore.innerText = score.toLocaleString().padStart(6, '0');
    this.hudMultiplier.innerText = `${multiplier}x`;

    this.hudGrooveFill.style.width = `${Math.min(100, Math.max(0, groove))}%`;
    this.hudGrooveText.innerText = `${Math.round(groove)}%`;

    if (groove >= 100) {
      this.hudGrooveFill.classList.add('fever');
    } else {
      this.hudGrooveFill.classList.remove('fever');
    }

    // Dynamic Soundtrack Stem Chips
    this.stemChips[0].classList.toggle('active', true);
    this.stemChips[1].classList.toggle('active', groove >= 15);
    this.stemChips[2].classList.toggle('active', groove >= 40);
    this.stemChips[3].classList.toggle('active', groove >= 70);

    // Update Musical Sequence Progress (e.g. C -> E -> G -> C)
    if (this.hudSequenceName && this.hudSequenceNotes) {
      this.hudSequenceName.innerText = `${game.activeSequence.name.toUpperCase()}:`;
      this.hudSequenceNotes.innerHTML = game.activeSequence.notes
        .map((n, idx) =>
          idx < game.sequenceStepIndex
            ? `<span class="seq-note-hit">${n}</span>`
            : idx === game.sequenceStepIndex
            ? `<span class="seq-note-next">${n}</span>`
            : `<span class="seq-note-pending">${n}</span>`
        )
        .join(' → ');
    }

    // Update Notes Collected History (e.g. "C · D · E · G")
    if (this.hudNotesList) {
      this.hudNotesList.innerText =
        game.collectedNotesHistory.length > 0
          ? game.collectedNotesHistory.join(' · ')
          : 'COLLECT NOTES!';
    }

    // Update Active Musical Challenge Mission
    if (this.hudMissionText) {
      this.hudMissionText.innerText = `${game.activeMission.title} (${game.missionProgress}/${game.activeMission.targetCount})`;
    }

    // Update Officer Tempo Chase Radar
    if (this.hudTempoRadar) {
      if (game.tempoState === 'lunging') {
        this.hudTempoRadar.innerText = '🚨 OFFICER TEMPO: DANGER CLOSE!';
        this.hudTempoRadar.style.color = '#ff1744';
      } else if (game.tempoState === 'dancing') {
        this.hudTempoRadar.innerText = '🕺 OFFICER TEMPO: DANCING!';
        this.hudTempoRadar.style.color = '#00f3ff';
      } else if (game.tempoState === 'frustrated') {
        this.hudTempoRadar.innerText = '😤 OFFICER TEMPO: OUTSMARTED!';
        this.hudTempoRadar.style.color = '#4ade80';
      } else {
        this.hudTempoRadar.innerText = '🚔 OFFICER TEMPO: CHASING';
        this.hudTempoRadar.style.color = '#fbbf24';
      }
    }
  }

  public updateSessionCoins(totalCoins: number): void {
    this.hudSessionCoins.innerText = `♪ +${totalCoins}`;
  }

  public updateGenre(genre: GenreTheme): void {
    this.hudGenreName.innerText = genre.name.toUpperCase();
    this.hudBpm.innerText = `${genre.bpm} BPM`;
  }

  public updateTimingNeedle(): void {
    // Handled diegetically on the Canvas highway by GameRenderer!
  }

  public showDiagnostics(diag: PerformanceDiagnostics): void {
    this.hudElement.classList.remove('active');
    this.openModal(this.modalGameover);

    const rankEl = document.getElementById('diag-rank')!;
    const scoreEl = document.getElementById('diag-score')!;
    const coinsEl = document.getElementById('diag-coins')!;
    const accEl = document.getElementById('diag-accuracy')!;
    const maxComboEl = document.getElementById('diag-maxcombo')!;
    const meanDeltaEl = document.getElementById('diag-meandelta')!;
    const breakdownEl = document.getElementById('diag-breakdown')!;
    const starsEl = document.getElementById('podium-stars')!;

    rankEl.innerText = diag.rank;
    scoreEl.innerText = `${diag.finalScore.toLocaleString()} PTS`;
    coinsEl.innerText = `+${diag.sessionCoins} MUSICAL NOTES COLLECTED`;
    accEl.innerText = `${diag.accuracyPercent}%`;
    maxComboEl.innerText = `${diag.sequencesCompleted} MELODIES (${diag.maxCombo} STREAK)`;

    const sign = diag.meanDeltaMs > 0 ? '+' : '';
    meanDeltaEl.innerText = `${sign}${diag.meanDeltaMs}ms`;
    breakdownEl.innerText = `${diag.perfectCount} / ${diag.greatCount} / ${diag.missCount}`;

    let starCount = 1;
    if (diag.rank === 'S+' || diag.rank === 'S') starCount = 3;
    else if (diag.rank === 'A') starCount = 2;

    starsEl.innerHTML = Array(starCount).fill(ICONS.star).join('');
    this.updateLobbyTelemetry();
  }
}
