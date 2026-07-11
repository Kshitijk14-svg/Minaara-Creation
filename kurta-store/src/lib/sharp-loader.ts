import path from 'path';
import { createRequire } from 'node:module';

// sharp is a native addon, and Turbopack's dev bundler statically analyzes
// even require('sharp') / import('sharp') calls, fails to resolve the native
// binding, and silently stubs the module to {} instead of erroring (even with
// serverExternalPackages set). A createRequire anchored to the project's
// package.json resolves through Node's own loader at runtime — invisible to
// bundler static analysis under both Turbopack (dev) and webpack (build).
let sharpModule: typeof import('sharp') | null = null;
export function loadSharp(): typeof import('sharp') {
  if (!sharpModule) {
    let mod: unknown;
    try {
      const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'));
      mod = nodeRequire('sharp');
    } catch (err) {
      throw new Error(
        `sharp failed to load: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const resolved =
      typeof mod === 'function' ? mod : (mod as { default?: unknown })?.default;
    if (typeof resolved !== 'function') {
      throw new Error('sharp failed to load: module resolved but is not callable (bundler stub?)');
    }
    sharpModule = resolved as typeof import('sharp');
  }
  return sharpModule;
}
