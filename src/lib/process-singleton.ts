/**
 * One value per Node process. Next.js can bundle a server module into more
 * than one route chunk; module-level state would then exist once per chunk.
 */
export function processSingleton<T>(name: string, make: () => T): T {
  const store = globalThis as typeof globalThis & {
    __streamlySingletons?: Map<string, unknown>;
  };
  const all = (store.__streamlySingletons ??= new Map<string, unknown>());
  if (!all.has(name)) all.set(name, make());
  return all.get(name) as T;
}
