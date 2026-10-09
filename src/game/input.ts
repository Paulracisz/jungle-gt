export interface Controls {
  steer: number; // -1 left .. +1 right
  throttle: number; // 0 or 1
  brake: number; // 0 or 1
}

const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ',
]);

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}

/**
 * Keyboard mapping:
 *   Left / Right  steer        Space (or Up)  accelerate
 *   Z (or Down)   brake / reverse
 * Z sits under the left hand, next to the thumb that rests on the space bar.
 */
export class Input {
  private down = new Set<string>();
  onPress?: (code: string) => void;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) this.onPress?.(e.code);
    this.down.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private onBlur = (): void => {
    this.down.clear();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  controls(): Controls {
    const d = this.down;
    return {
      steer: (d.has('ArrowRight') ? 1 : 0) - (d.has('ArrowLeft') ? 1 : 0),
      throttle: d.has('Space') || d.has('ArrowUp') ? 1 : 0,
      brake: d.has('KeyZ') || d.has('ArrowDown') ? 1 : 0,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
