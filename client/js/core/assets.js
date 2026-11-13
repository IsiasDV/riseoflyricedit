// Asset preloader driven by a manifest: { images: [url, ...], ... }.
// Reports progress 0..1. Missing/failed files are non-fatal (warn and count as
// done) so maps can be loaded before their art has been supplied.
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { gameVolume } from '../state/settings.js';

const LOADERS = {
  images: (url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  }),
  // Resolves to the glTF root scene (clone with SkeletonUtils before use).
  // glTF clips are kept on `scene.animations`.
  models: async (url) => {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.animations = gltf.animations;
    return gltf.scene;
  },
  // Raw bytes for WebAudio (decoded lazily by SpatialAudio).
  sounds: async (url) => {
    const r = await fetch(url);
    return r.ok ? r.arrayBuffer() : null;
  },
  // Preloaded HTMLAudioElement; play via playAudio().
  audio: (url) => new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('canplaythrough', () => resolve(a), { once: true });
    a.addEventListener('error', () => resolve(null), { once: true });
    a.src = url;
    a.load();
  })
};

export function playAudio(loaded, url, volume = 1) {
  const a = loaded?.audio?.[url];
  if (!a) return;
  a.currentTime = 0;
  a.volume = Math.min(1, volume * gameVolume());
  a.play().catch(() => { /* autoplay blocked; ignore */ });
}

export async function loadAssets(manifest = {}, onProgress = () => {}) {
  const jobs = [];
  for (const [type, urls] of Object.entries(manifest)) {
    const loader = LOADERS[type];
    if (!loader) {
      console.warn(`[assets] no loader for asset type "${type}"`);
      continue;
    }
    for (const url of urls) jobs.push({ type, url, loader });
  }

  const loaded = {};
  let done = 0;
  onProgress(jobs.length ? 0 : 1);
  await Promise.all(jobs.map(async ({ type, url, loader }) => {
    let result = null;
    try { result = await loader(url); } catch { /* handled below */ }
    if (!result) console.warn(`[assets] failed to load ${url}`);
    (loaded[type] ||= {})[url] = result;
    done++;
    onProgress(done / jobs.length);
  }));
  return loaded;
}
