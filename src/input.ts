// Beat Runner - Cross-Platform Unified Input Manager (Laptop Keyboard + Mobile Touch)

export type PlayerActionType = 'move_left' | 'move_right' | 'set_lane' | 'pulse' | 'jump' | 'pause';

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
  private swipeThreshold = 35; // Pixels
  private touchHandledAsSwipe = false;

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
    this.dispatch(event);
  }

  private dispatch(event: PlayerInputEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  private setupKeyboardListeners(): void {
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
   * Attaches touch listeners directly to the interactive Canvas/Container with passive: false
   * to eliminate mobile tap latency and prevent accidental browser navigation/zoom.
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

        // Optional early tap detection if bottom action button was not tapped
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
        const now = performance.now();

        // Check if movement exceeds swipe threshold
        if (!this.touchHandledAsSwipe) {
          if (Math.abs(deltaX) > this.swipeThreshold && Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (deltaX < 0) {
              this.dispatch({ type: 'move_left', timestamp: now });
            } else {
              this.dispatch({ type: 'move_right', timestamp: now });
            }
            this.touchHandledAsSwipe = true;
          } else if (deltaY < -this.swipeThreshold) {
            // Upward swipe -> Jump
            this.dispatch({ type: 'jump', timestamp: now });
            this.touchHandledAsSwipe = true;
          }
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

        // If it wasn't a swipe, treat as a direct 3-lane tap!
        if (!this.touchHandledAsSwipe) {
          const rect = element.getBoundingClientRect();
          const relativeX = this.touchStartX - rect.left;
          const relativeY = this.touchStartY - rect.top;
          const width = rect.width;
          const height = rect.height;
          const now = performance.now();

          // If tapped in lower 22% of screen, trigger a Beat Pulse/Jump
          if (relativeY > height * 0.78) {
            this.dispatch({ type: 'jump', timestamp: now });
            return;
          }

          // Otherwise determine which lane was tapped (0 = Left 33%, 1 = Mid 33%, 2 = Right 33%)
          const colWidth = width / 3;
          let tappedLane = 1;
          if (relativeX < colWidth) {
            tappedLane = 0;
          } else if (relativeX > colWidth * 2) {
            tappedLane = 2;
          }

          this.dispatch({ type: 'set_lane', targetLane: tappedLane, timestamp: now });
        }
      },
      { passive: false }
    );
  }

  public triggerHaptic(durationMs = 25): void {
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
