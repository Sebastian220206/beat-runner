// Beat Runner - Responsive HiDPI Perspective Canvas Renderer

import { GameManager, TrackEntity } from './game.ts';
import { GenreTheme } from './genres.ts';
import { JudgmentResult } from './rhythm.ts';
import { storage } from './storage.ts';

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
  scale: number;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  // Viewport metrics
  private width = 800;
  private height = 600;
  private horizonY = 240;
  private strikeY = 480;
  private vanishingX = 400;

  // Effects & Feedback
  private floatingTexts: FloatingText[] = [];
  private particles: Particle[] = [];
  private pulseShockwave = 0; // 0 to 1
  private lastTimingDeltaMs: number | null = null;
  private timingArcOpacity = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = context;
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  public handleResize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.scale(this.dpr, this.dpr);

    this.vanishingX = this.width / 2;
    // Adapt layout for mobile portrait vs desktop landscape
    const isPortrait = this.height > this.width;
    this.horizonY = isPortrait ? this.height * 0.35 : this.height * 0.4;
    this.strikeY = isPortrait ? this.height * 0.78 : this.height * 0.75;
  }

  public addJudgmentPopup(result: JudgmentResult, laneIndex: number): void {
    this.lastTimingDeltaMs = result.deltaMs;
    this.timingArcOpacity = 1.0;

    const laneX = (laneIndex - 1) * (this.width * 0.22);
    const screenX = this.vanishingX + laneX;
    const color =
      result.rating === 'PERFECT'
        ? '#00ffff'
        : result.rating === 'GREAT'
        ? '#ffeb3b'
        : result.rating === 'GOOD'
        ? '#ff9800'
        : '#ff1744';

    this.floatingTexts.push({
      text: result.label,
      x: screenX,
      y: this.strikeY - 45,
      color,
      opacity: 1.0,
      scale: result.rating === 'PERFECT' ? 1.4 : 1.1,
      life: 0.9,
    });

    // Particle burst on note hit
    if (result.rating !== 'MISS') {
      const count = result.rating === 'PERFECT' ? 18 : 10;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 120;
        this.particles.push({
          x: screenX,
          y: this.strikeY - 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          size: 2 + Math.random() * 4,
          color,
          alpha: 1.0,
          life: 0.4 + Math.random() * 0.3,
        });
      }
    }
  }

  public triggerShockwave(): void {
    this.pulseShockwave = 1.0;
  }

  /**
   * Perspective Math: maps (laneNormalized, beatsAhead, heightOffset) to screen (X, Y, scale)
   * laneNormalized: -1.0 (Left), 0.0 (Center), +1.0 (Right)
   * beatsAhead: 0 = at strike bar, positive = in distance towards horizon
   */
  private project3D(
    laneNormalized: number,
    beatsAhead: number,
    heightOffset = 0
  ): { x: number; y: number; scale: number; visible: boolean } {
    if (beatsAhead < -1.5 || beatsAhead > 14) {
      return { x: 0, y: 0, scale: 0, visible: false };
    }

    // Non-linear depth curve for natural highway speed
    const depth = Math.max(0, beatsAhead);
    const perspectiveFactor = 3.6 / (3.6 + depth); // 1.0 at strike, ~0.2 near horizon

    const screenY = this.horizonY + (this.strikeY - this.horizonY) * perspectiveFactor;
    const highwayHalfWidthAtBottom = Math.min(this.width * 0.44, 340);
    const laneSpread = highwayHalfWidthAtBottom * 0.62;

    const screenX = this.vanishingX + laneNormalized * laneSpread * perspectiveFactor;
    const finalY = screenY - heightOffset * perspectiveFactor * 120;

    return {
      x: screenX,
      y: finalY,
      scale: perspectiveFactor,
      visible: true,
    };
  }

  public render(game: GameManager, currentBeat: number, dt: number): void {
    const genre = game.currentGenre;
    // In Lobby / MENU state, create gentle idle scroll so 3D background is live and vibrant
    const activeBeat =
      game.state === 'MENU' ? (performance.now() * 0.001) * (genre.bpm / 60) * 0.6 : currentBeat;

    // 1. Clear & Draw Sky
    this.renderSky(genre, activeBeat);

    // 2. Horizon Neon Sun / Pulse Orb
    this.renderHorizonSun(genre, activeBeat);

    // 3. Audio-Reactive Side Equalizers
    this.renderSideEqualizers(genre, activeBeat);

    // 4. Perspective Highway & Grid Lines
    this.renderHighway(genre, activeBeat, dt);

    // 5. Track Entities (Sorted by distance so furthest are drawn first)
    if (game.state === 'PLAYING' || game.state === 'PAUSED') {
      this.renderEntities(game.entities, activeBeat, genre);
    }

    // 6. Player Runner Hovercraft & Trail
    this.renderPlayer(game, genre);

    // 7. Shockwaves & Particles
    this.renderParticlesAndFX(dt, genre);

    // 8. Floating Feedback Text (PERFECT, GREAT, etc.)
    this.renderFloatingText(dt);

    // 9. Peripheral Groove / Fever Vignette
    if (game.isFever && game.state === 'PLAYING') {
      this.renderFeverAura(genre);
    }
  }

  private renderSky(genre: GenreTheme, _beat: number): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    grad.addColorStop(0, genre.colors.skyTop);
    grad.addColorStop(1, genre.colors.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.horizonY);
  }

  private renderHorizonSun(genre: GenreTheme, beat: number): void {
    const ctx = this.ctx;
    const beatFraction = beat % 1;
    const pulse = 1.0 + Math.sin(beatFraction * Math.PI) * 0.12;

    const sunRadius = Math.min(this.width * 0.12, 70) * pulse;
    const sunGrad = ctx.createRadialGradient(
      this.vanishingX,
      this.horizonY - 15,
      sunRadius * 0.1,
      this.vanishingX,
      this.horizonY - 15,
      sunRadius
    );
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.4, genre.colors.secondary);
    sunGrad.addColorStop(1, `${genre.colors.primary}00`);

    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(this.vanishingX, this.horizonY - 15, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Wireframe sun horizontal blinds
    ctx.strokeStyle = genre.colors.skyTop;
    ctx.lineWidth = 2;
    for (let y = this.horizonY - 15; y < this.horizonY + sunRadius; y += 7) {
      ctx.beginPath();
      ctx.moveTo(this.vanishingX - sunRadius, y);
      ctx.lineTo(this.vanishingX + sunRadius, y);
      ctx.stroke();
    }
  }

  private renderSideEqualizers(genre: GenreTheme, beat: number): void {
    const ctx = this.ctx;
    const barsCount = 12;
    const barWidth = 6;
    const spacing = 10;
    const beatPhase = (beat * 2) % Math.PI;

    ctx.fillStyle = genre.colors.secondary;
    ctx.shadowColor = genre.colors.glow;
    ctx.shadowBlur = 8;

    for (let i = 0; i < barsCount; i++) {
      const h1 = 15 + Math.sin(beatPhase + i * 0.7) * 25 + (i % 3) * 8;
      const leftX = this.width * 0.08 + i * (barWidth + spacing);
      const rightX = this.width * 0.92 - i * (barWidth + spacing);

      ctx.fillRect(leftX, this.horizonY - h1, barWidth, h1);
      ctx.fillRect(rightX, this.horizonY - h1, barWidth, h1);
    }
    ctx.shadowBlur = 0;
  }

  private renderHighway(genre: GenreTheme, currentBeat: number, dt: number): void {
    const ctx = this.ctx;

    // Highway Base Trapezoid
    const bottomP = this.project3D(0, 0);
    const topP = this.project3D(0, 12);
    const leftBottom = this.project3D(-1.6, 0);
    const rightBottom = this.project3D(1.6, 0);
    const leftTop = this.project3D(-1.6, 12);
    const rightTop = this.project3D(1.6, 12);

    ctx.fillStyle = genre.colors.highway;
    ctx.beginPath();
    ctx.moveTo(leftTop.x, topP.y);
    ctx.lineTo(rightTop.x, topP.y);
    ctx.lineTo(rightBottom.x, bottomP.y + 40);
    ctx.lineTo(leftBottom.x, bottomP.y + 40);
    ctx.closePath();
    ctx.fill();

    // Outer Neon Guardrails
    ctx.strokeStyle = genre.colors.highwayBorder;
    ctx.lineWidth = 4;
    ctx.shadowColor = genre.colors.glow;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(leftTop.x, topP.y);
    ctx.lineTo(leftBottom.x, bottomP.y + 40);
    ctx.moveTo(rightTop.x, topP.y);
    ctx.lineTo(rightBottom.x, bottomP.y + 40);
    ctx.stroke();

    // Lane Divider Dashes (between lane 0-1 and 1-2)
    ctx.strokeStyle = genre.colors.grid;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;

    const div1Top = this.project3D(-0.5, 12);
    const div1Bottom = this.project3D(-0.5, 0);
    const div2Top = this.project3D(0.5, 12);
    const div2Bottom = this.project3D(0.5, 0);

    ctx.beginPath();
    ctx.moveTo(div1Top.x, topP.y);
    ctx.lineTo(div1Bottom.x, bottomP.y + 40);
    ctx.moveTo(div2Top.x, topP.y);
    ctx.lineTo(div2Bottom.x, bottomP.y + 40);
    ctx.stroke();

    // Scrolling Beat Lines on Highway
    const startBeatInt = Math.floor(currentBeat);
    for (let b = startBeatInt; b <= startBeatInt + 12; b++) {
      const beatsAhead = b - currentBeat;
      if (beatsAhead < 0) continue;

      const pL = this.project3D(-1.55, beatsAhead);
      const pR = this.project3D(1.55, beatsAhead);
      if (!pL.visible || !pR.visible) continue;

      const isMeasureBar = b % 4 === 0;
      ctx.strokeStyle = isMeasureBar ? genre.colors.primary : genre.colors.secondary;
      ctx.lineWidth = isMeasureBar ? 3 * pL.scale : 1.5 * pL.scale;
      ctx.globalAlpha = pL.scale;

      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Glowing Strike Bar at z = 0
    const strikeL = this.project3D(-1.55, 0);
    const strikeR = this.project3D(1.55, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.shadowColor = genre.colors.glow;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(strikeL.x, strikeL.y);
    ctx.lineTo(strikeR.x, strikeR.y);
    ctx.stroke();

    // Draw Target Reticles on the 3 Lanes
    for (let lane = 0; lane < 3; lane++) {
      const normLane = lane - 1;
      const targetP = this.project3D(normLane, 0);
      ctx.strokeStyle = lane === 1 ? genre.colors.primary : genre.colors.secondary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetP.x, targetP.y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Diegetic Strike-Line Timing Arc (Subway Surfers-style in-world feedback)
    if (this.timingArcOpacity > 0) {
      this.timingArcOpacity = Math.max(0, this.timingArcOpacity - dt * 2.2);
      const arcCenter = this.project3D(0, 0);
      const arcWidth = Math.min(180, this.width * 0.38);
      const arcY = arcCenter.y + 14;

      ctx.save();
      ctx.globalAlpha = this.timingArcOpacity;

      // Arc background pill
      ctx.fillStyle = '#090414dd';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(arcCenter.x - arcWidth / 2, arcY, arcWidth, 10, 5);
      ctx.fill();
      ctx.stroke();

      // Center mark (0ms target)
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arcCenter.x, arcY);
      ctx.lineTo(arcCenter.x, arcY + 10);
      ctx.stroke();

      // Early / Late tick labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EARLY', arcCenter.x - arcWidth * 0.35, arcY - 3);
      ctx.fillText('LATE', arcCenter.x + arcWidth * 0.35, arcY - 3);

      // Indicator Pip
      if (this.lastTimingDeltaMs !== null) {
        const clampedDelta = Math.max(-100, Math.min(100, this.lastTimingDeltaMs));
        const needleX = arcCenter.x + (clampedDelta / 100) * (arcWidth / 2 - 6);
        const pipColor =
          Math.abs(clampedDelta) <= 35 ? '#00ffff' : Math.abs(clampedDelta) <= 70 ? '#ffeb3b' : '#ff9800';

        ctx.fillStyle = pipColor;
        ctx.shadowColor = pipColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(needleX, arcY + 5, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 0;
  }

  private renderEntities(entities: TrackEntity[], currentBeat: number, genre: GenreTheme): void {
    const ctx = this.ctx;

    // Sort entities from furthest away to nearest
    const sorted = [...entities].filter((e) => e.active).sort((a, b) => b.beat - a.beat);

    for (const ent of sorted) {
      const beatsAhead = ent.beat - currentBeat;
      if (beatsAhead > 13 || beatsAhead < -0.8) continue;

      if (ent.type === 'note' && !ent.collected) {
        const normLane = ent.lane - 1;
        const p = this.project3D(normLane, beatsAhead, 0.2);
        if (!p.visible) continue;

        const radius = Math.max(6, 22 * p.scale);

        // Outer glow
        ctx.fillStyle = genre.colors.note;
        ctx.shadowColor = genre.colors.glow;
        ctx.shadowBlur = 14 * p.scale;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Stroboscopic rhythm ring around note
        ctx.strokeStyle = genre.colors.secondary;
        ctx.lineWidth = 2 * p.scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (ent.type === 'pulse' && !ent.cleared) {
        // Pulse Ring spanning across track or lane
        const normLane = ent.lane === -1 ? 0 : ent.lane - 1;
        const p = this.project3D(normLane, beatsAhead, 0.1);
        if (!p.visible) continue;

        const width = (ent.lane === -1 ? 240 : 80) * p.scale;
        const height = 18 * p.scale;

        ctx.strokeStyle = genre.colors.pulseRing;
        ctx.lineWidth = 4 * p.scale;
        ctx.shadowColor = genre.colors.pulseRing;
        ctx.shadowBlur = 16 * p.scale;

        ctx.beginPath();
        ctx.ellipse(p.x, p.y, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffffaa';
        ctx.font = `bold ${Math.max(9, Math.round(14 * p.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('PULSE', p.x, p.y + 4 * p.scale);
        ctx.shadowBlur = 0;
      } else if (ent.type === 'barrier' && !ent.hit) {
        if (ent.isLaser) {
          // Low laser barrier spanning all 3 lanes (must be jumped)
          const pL = this.project3D(-1.5, beatsAhead, 0.15);
          const pR = this.project3D(1.5, beatsAhead, 0.15);
          if (!pL.visible || !pR.visible) continue;

          ctx.strokeStyle = genre.colors.barrier;
          ctx.lineWidth = 6 * pL.scale;
          ctx.shadowColor = genre.colors.barrier;
          ctx.shadowBlur = 18 * pL.scale;

          ctx.beginPath();
          ctx.moveTo(pL.x, pL.y);
          ctx.lineTo(pR.x, pR.y);
          ctx.stroke();

          // Laser WARNING label
          ctx.fillStyle = '#ffffff';
          const midP = this.project3D(0, beatsAhead, 0.35);
          ctx.font = `bold ${Math.max(10, Math.round(16 * midP.scale))}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('▲ JUMP ▲', midP.x, midP.y);
          ctx.shadowBlur = 0;
        } else {
          // Monolithic tall obstacle in one lane
          const normLane = ent.lane - 1;
          const pBase = this.project3D(normLane, beatsAhead, 0);
          const pTop = this.project3D(normLane, beatsAhead, 0.7);
          if (!pBase.visible || !pTop.visible) continue;

          const blockWidth = 65 * pBase.scale;
          const blockHeight = pBase.y - pTop.y;

          ctx.fillStyle = genre.colors.barrier;
          ctx.shadowColor = genre.colors.barrier;
          ctx.shadowBlur = 16 * pBase.scale;

          ctx.fillRect(pBase.x - blockWidth / 2, pTop.y, blockWidth, blockHeight);

          // Danger stripes
          ctx.strokeStyle = '#000000aa';
          ctx.lineWidth = 3 * pBase.scale;
          ctx.beginPath();
          ctx.moveTo(pBase.x - blockWidth / 2, pTop.y + blockHeight * 0.3);
          ctx.lineTo(pBase.x + blockWidth / 2, pTop.y + blockHeight * 0.7);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      } else if (ent.type === 'portal') {
        // Swirling Genre Portal
        const p = this.project3D(0, beatsAhead, 0.5);
        if (!p.visible) continue;

        const portalRadius = 90 * p.scale;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5 * p.scale;
        ctx.shadowColor = genre.colors.secondary;
        ctx.shadowBlur = 25 * p.scale;

        ctx.beginPath();
        ctx.arc(p.x, p.y, portalRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = genre.colors.secondary;
        ctx.font = `bold ${Math.max(11, Math.round(18 * p.scale))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`PORTAL: ${ent.targetGenre.toUpperCase()}`, p.x, p.y - portalRadius - 10);
        ctx.shadowBlur = 0;
      }
    }
  }

  private renderPlayer(game: GameManager, genre: GenreTheme): void {
    const ctx = this.ctx;
    const skin = storage.getEquippedSkin();

    const primaryColor = skin.primaryColor || genre.colors.player;
    const secondaryColor = skin.secondaryColor || genre.colors.secondary;
    const glowColor = skin.glowColor || genre.colors.playerGlow;

    // In Lobby / MENU state, add idle hovering bob and subtle roll
    let currentX = game.currentLaneX;
    let jumpOffset = game.isJumping ? Math.sin(game.jumpProgress * Math.PI) * 0.7 : 0;
    let bankAngle = (game.targetLane - 1 - game.currentLaneX) * 0.35;

    if (game.state === 'MENU') {
      currentX = 0;
      const t = performance.now() * 0.003;
      jumpOffset = 0.2 + Math.sin(t) * 0.12;
      bankAngle = Math.sin(t * 0.8) * 0.08;
    }

    const p = this.project3D(currentX, 0, jumpOffset);
    if (!p.visible) return;

    // Drop Shadow on Highway
    const shadowP = this.project3D(currentX, 0, 0);
    ctx.fillStyle = '#00000088';
    ctx.beginPath();
    ctx.ellipse(shadowP.x, shadowP.y + 4, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Runner Vehicle Body
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(bankAngle);

    // Thruster Jet Glow
    ctx.fillStyle = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 22;

    // Craft Outer Silhouette (Crisp 3D arcade wedge)
    ctx.beginPath();
    ctx.moveTo(0, -24); // Sharp aerodynamic nose
    ctx.lineTo(26, 16); // Right wing tip
    ctx.lineTo(12, 12); // Right thruster notch
    ctx.lineTo(-12, 12); // Left thruster notch
    ctx.lineTo(-26, 16); // Left wing tip
    ctx.closePath();
    ctx.fillStyle = primaryColor;
    ctx.fill();

    // Secondary Accent Wing Decals
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(18, 12);
    ctx.lineTo(8, 10);
    ctx.lineTo(0, -6);
    ctx.lineTo(-8, 10);
    ctx.lineTo(-18, 12);
    ctx.closePath();
    ctx.fill();

    // Canopy glass with specular highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, -4, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private renderParticlesAndFX(dt: number, genre: GenreTheme): void {
    const ctx = this.ctx;

    // Update & draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
      part.alpha = Math.max(0, part.life / 0.5);

      if (part.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = part.color;
      ctx.globalAlpha = part.alpha;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Shockwave effect
    if (this.pulseShockwave > 0) {
      this.pulseShockwave = Math.max(0, this.pulseShockwave - dt * 2.5);
      const waveRadius = (1 - this.pulseShockwave) * (this.width * 0.5);
      ctx.strokeStyle = `${genre.colors.glow}${Math.floor(this.pulseShockwave * 255)
        .toString(16)
        .padStart(2, '0')}`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.vanishingX, this.strikeY, waveRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderFloatingText(dt: number): void {
    const ctx = this.ctx;

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 45 * dt; // Float upwards
      ft.life -= dt;
      ft.opacity = Math.max(0, ft.life / 0.9);

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.fillStyle = ft.color;
      ctx.globalAlpha = ft.opacity;
      ctx.font = `900 ${Math.round(20 * ft.scale)}px "Montserrat", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1.0;
  }

  private renderFeverAura(genre: GenreTheme): void {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(
      this.vanishingX,
      this.height / 2,
      this.width * 0.35,
      this.vanishingX,
      this.height / 2,
      this.width * 0.55
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `${genre.colors.glow}44`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
