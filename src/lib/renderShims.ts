/**
 * pdf.js touches `DOMMatrix` at module scope while loading. Browsers provide
 * it natively; pdf.js's own Node fallback pulls it from `@napi-rs/canvas`, a
 * native binary that can't ship inside Convex's bundled JS.
 *
 * Text extraction never renders anything, so identity stubs satisfy module
 * initialization — the same polyfill approach pdf.js uses, minus the native
 * dependency. Must run before pdf-parse is first imported.
 *
 * The methods take no declared parameters on purpose: callers may pass
 * arguments (JS ignores extras) and the stub only has to answer `this`.
 */
export function installRenderShims(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.DOMMatrix !== "undefined") return;

  class StubDOMMatrix {
    constructor() {}
    multiplySelf() {
      return this;
    }
    preMultiplySelf() {
      return this;
    }
    multiply() {
      return this;
    }
    translate() {
      return this;
    }
    scale() {
      return this;
    }
    rotate() {
      return this;
    }
    invertSelf() {
      return this;
    }
  }

  globals.DOMMatrix = StubDOMMatrix;
}
