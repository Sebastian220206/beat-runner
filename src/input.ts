// Beat Runner - Cross-Platform Unified Input Manager (Laptop Keyboard + Mobile Touch)

export type PlayerActionType =
  | 'move_left'
  | 'move_right'
  | 'set_lane'
  | 'pulse'
  | 'jump'
  | 'slide'
  | 'pause';

export interface PlayerInputEvent {
  type: PlayerActionType;
  targetLane?: number; // 0, 1, 2 for 'set_lane'
  timestamp: number; // High-precision performance.now()
}

export type InputCallback = (event: PlayerInputEvent) => void;

export class InputManager {
  private callbacks: InputCallback[] = [];
  private touchStartX = 0;
  private touchStartY = 0;
  private isTouching = false;
  private swipeThreshold = 26; // Snappy threshold in CSS pixels
  private touchHandledAsSwipe = false;
  private lastTapTimestamp = 0;

  constructor() {
    this.setupKeyboardListeners();
  }

  public registerCallback(cb: InputCallback): void {
    this.callbacks.push(cb);
  }

  public unregisterCallback(cb: InputCallback): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  public handleActionDirectly(event: PlayerInputEvent): void {
    this.triggerHaptic(18);
    this.dispatch(event);
  }

  private dispatch(event: PlayerInputEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  private setupKeyboardListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      // Avoid triggering when user is in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const now = performance.now();

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          this.dispatch({ type: 'move_left', timestamp: now });
          break;

        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          this.dispatch({ type: 'move_right', timestamp: now });
          break;

        case 'Space':
        case 'KeyW':
        case 'ArrowUp':
          e.preventDefault();
          this.dispatch({ type: 'jump', timestamp: now });
          break;

        case 'KeyS':
        case 'ArrowDown':
          e.preventDefault();
          this.dispatch({ type: 'slide', timestamp: now });
          break;

        case 'KeyF':
        case 'ShiftLeft':
        case 'ShiftRight':
          e.preventDefault();
          this.dispatch({ type: 'pulse', timestamp: now });
          break;

        case 'Digit1':
        case 'Numpad1':
          e.preventDefault();
          this.dispatch({ type: 'set_lane', targetLane: 0, timestamp: now });
          break;

        case 'Digit2':
        case 'Numpad2':
          e.preventDefault();
          this.dispatch({ type: 'set_lane', targetLane: 1, timestamp: now });
          break;

        case 'Digit3':
        case 'Numpad3':
          e.preventDefault();
          this.dispatch({ type: 'set_lane', targetLane: 2, timestamp: now });
          break;

        case 'Escape':
        case 'KeyP':
          e.preventDefault();
          this.dispatch({ type: 'pause', timestamp: now });
          break;
      }
    });
  }

  /**
   * Binds an interactive mobile button to dispatch immediately on pointerdown/touchstart
   * with zero latency (eliminating mobile 300ms click delay).
   */
  public bindActionButton(element: HTMLElement | null, action: PlayerActionType): void {
    if (!element) return;

    const trigger = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleActionDirectly({ type: action, timestamp: performance.now() });
      element.classList.add('touch-active');
      setTimeout(() => element.classList.remove('touch-active'), 140);
    };

    element.addEventListener('pointerdown', trigger);
    element.addEventListener('touchstart', trigger, { passive: false });
  }

  /**
   * Attaches fluid Subway Surfers swipe & tap controls directly to the interactive Canvas/Container
   * with passive: false to eliminate mobile tap latency, prevent bounce scrolling, and enable
   * fluid continuous gesture chaining without lifting the finger.
   */
  public attachTouchControls(element: HTMLElement): void {
    element.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length === 0) return;
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.isTouching = true;
        this.touchHandledAsSwipe = false;

        e.preventDefault();
      },
      { passive: false }
    );

    element.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (!this.isTouching || e.touches.length === 0) return;
        e.preventDefault();

        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        const now = performance.now();

        // 1. Horizontal Swipes (Left / Right Lane Switch)
        if (absX > this.swipeThreshold && absX > absY * 1.15) {
          if (deltaX < 0) {
            this.dispatch({ type: 'move_left', timestamp: now });
          } else {
            this.dispatch({ type: 'move_right', timestamp: now });
          }
          this.triggerHaptic(18);
          // Re-anchor start point so the player can chain another swipe without lifting thumb!
          this.touchStartX = touch.clientX;
          this.touchStartY = touch.clientY;
          this.touchHandledAsSwipe = true;
        }
        // 2. Vertical Swipes (Up = Jump, Down = Slide)
        else if (absY > this.swipeThreshold && absY > absX * 1.15) {
          if (deltaY < 0) {
            this.dispatch({ type: 'jump', timestamp: now });
          } else {
            this.dispatch({ type: 'slide', timestamp: now });
          }
          this.triggerHaptic(18);
          // Re-anchor start point for smooth chained jump -> slide or slide -> lane switch
          this.touchStartX = touch.clientX;
          this.touchStartY = touch.clientY;
          this.touchHandledAsSwipe = true;
        }
      },
      { passive: false }
    );

    element.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        if (!this.isTouching) return;
        e.preventDefault();
        this.isTouching = false;

        // If finger wasn't dragged past swipe threshold, treat as an accurate tap
        if (!this.touchHandledAsSwipe) {
          const now = performance.now();
          const rect = element.getBoundingClientRect();
          const relativeX = this.touchStartX - rect.left;
          const width = rect.width;

          // Double tap check: activates pulse / double jump / fever
          if (now - this.lastTapTimestamp < 290) {
            this.dispatch({ type: 'pulse', timestamp: now });
            this.triggerHaptic(25);
            this.lastTapTimestamp = 0;
            return;
          }
          this.lastTapTimestamp = now;

          // Three-column lane tap: Left 1/3 -> Lane 0, Center 1/3 -> Lane 1, Right 1/3 -> Lane 2
          const colWidth = width / 3;
          let tappedLane = 1;
          if (relativeX < colWidth) {
            tappedLane = 0;
          } else if (relativeX > colWidth * 2) {
            tappedLane = 2;
          }

          this.dispatch({ type: 'set_lane', targetLane: tappedLane, timestamp: now });
          this.triggerHaptic(15);
        }
      },
      { passive: false }
    );
  }

  public triggerHaptic(durationMs = 20): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(durationMs);
      } catch {
        // Ignored if browser permissions restrict vibration
      }
    }
  }
}

export const input = new InputManager();
