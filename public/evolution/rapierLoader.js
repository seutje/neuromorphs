const RAPIER_CDN_URL =
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';

let rapierPromise = null;

function isNodeEnvironment() {
  const nodeProcess = globalThis?.process;
  return (
    Boolean(nodeProcess?.versions?.node) &&
    nodeProcess.release?.name === 'node'
  );
}

export async function loadRapier() {
  if (!rapierPromise) {
    rapierPromise = (async () => {
      const module = isNodeEnvironment()
        ? await import('@dimforge/rapier3d-compat')
        : await import(RAPIER_CDN_URL);
      const rapier = module?.default ?? module;
      if (!rapier) {
        throw new Error('Failed to load Rapier physics module.');
      }
      if (typeof rapier.init === 'function') {
        await rapier.init();
      }
      return rapier;
    })();
  }
  return rapierPromise;
}

export { RAPIER_CDN_URL };
