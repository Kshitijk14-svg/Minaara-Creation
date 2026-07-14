// sharp is a native addon, and both of Next's bundlers mishandle a plain
// require('sharp')/import('sharp') for it:
//  - Turbopack (dev) statically analyzes even those calls, fails to resolve
//    the native binding, and silently stubs the module to {} instead of
//    erroring — even with serverExternalPackages set.
//  - Webpack (prod build) has special handling for node:module's
//    createRequire(): when it can't statically resolve the argument passed
//    to it, it substitutes the whole call with `void 0` instead of leaving
//    it alone ("module.createRequire failed parsing argument" at build
//    time), so the resulting require function is undefined at runtime
//    ("(void 0) is not a function").
// `new Function(...)`-constructed requires don't work either: `new Function`
// always evaluates its body in *global* scope, and Node's `require` is only
// ever a local injected into each CJS module's wrapper — never a true
// global — so a global-scope `require` lookup throws "require is not
// defined" regardless of bundler. Direct `eval`, unlike `new Function` (or
// indirect eval), runs in the *caller's* lexical scope, so `eval('require')`
// resolves this module's own local `require` binding — the same one the
// bundler already leaves untouched for other externalized packages (see
// serverExternalPackages in next.config.ts). Because the specifier lives
// inside a string, neither bundler's static import-graph analysis ever
// sees a literal `require('sharp')` token to stub out or rewrite.
let sharpModule: typeof import('sharp') | null = null;
export function loadSharp(): typeof import('sharp') {
  if (!sharpModule) {
    let mod: unknown;
    try {
      // Safe: the eval'd string is a hardcoded literal ('require'), never
      // interpolated or derived from input — this only reads the module's
      // own local `require` binding, it doesn't execute untrusted code.
      // eslint-disable-next-line no-eval
      const dynamicRequire = eval('require') as (specifier: string) => unknown;
      mod = dynamicRequire('sharp');
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
