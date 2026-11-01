// Beat Runner - Main Application Lifecycle & 60/120fps Animation Loop

import { game } from './game.ts';
import { GameRenderer } from './renderer.ts';
import { UIManager } from './ui.ts';
import { input } from './input.ts';
import { audio } from './audio.ts';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Game canvas not found');
    return;
  }

  // 1. Initialize Canvas 2D Renderer
  const renderer = new GameRenderer(canvas);

  // 2. Attach Mobile Touch Handlers to Canvas
  input.attachTouchControls(canvas);

  // 3. Initialize UI Manager
  const ui = new UIManager();

  // 4. Connect Game Engine Events to Renderer & UI
  game.onJudgment = (result, lane) => {
    renderer.addJudgmentPopup(result, lane);
    ui.updateTimingNeedle(result);
    if (result.rating === 'PERFECT') {
      renderer.triggerShockwave();
    }
  };

  game.onScoreChange = (score, combo, groove, multiplier) => {
    ui.updateHUD(score, combo, groove, multiplier);
  };

  game.onGenreChange = (genre) => {
    ui.updateGenre(genre);
  };

  game.onGameOver = (diagnostics) => {
    ui.showDiagnostics(diagnostics);
  };

  // 5. Pre-warm AudioContext on First User Tap/Key
  const unlockAudio = () => {
    audio.init();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // 6. High-Performance Animation Loop
  let lastTime = performance.now();

  function gameLoop(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap dt to prevent spiraling on tab switch
    lastTime = now;

    if (game.state === 'PLAYING') {
      game.update(dt);
    }

    const currentBeat = audio.getCurrentBeat();
    renderer.render(game, currentBeat, dt);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
