// audioManager.js
// Web Audio API–based sound manager with buffer caching and gain control.
// Replaces new Audio() calls; safe to call before files are loaded (queues silently).

let ctx = null;
const bufferCache = new Map(); // url → AudioBuffer
const pending = new Map();     // url → Promise<AudioBuffer>

function getCtx() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Some browsers suspend the context until a user gesture.
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

/**
 * Pre-load a sound file into the cache.
 * Safe to call multiple times with the same URL.
 * @param {string} url
 * @returns {Promise<AudioBuffer>}
 */
export function preload(url) {
    if (bufferCache.has(url)) return Promise.resolve(bufferCache.get(url));
    if (pending.has(url))     return pending.get(url);

    const promise = fetch(url)
        .then(r => r.arrayBuffer())
        .then(ab => getCtx().decodeAudioData(ab))
        .then(buf => {
            bufferCache.set(url, buf);
            pending.delete(url);
            return buf;
        })
        .catch(err => {
            pending.delete(url);
            console.warn('[audioManager] preload failed:', url, err);
            return null;
        });

    pending.set(url, promise);
    return promise;
}

/**
 * Play a cached buffer immediately.
 * If buffer isn't ready yet, loads it first then plays.
 * @param {string} url
 * @param {number} [volume=1]
 */
export function play(url, volume = 1) {
    const ac = getCtx();

    function _play(buf) {
        if (!buf) return;
        const src  = ac.createBufferSource();
        const gain = ac.createGain();
        src.buffer = buf;
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ac.destination);
        src.start(0);
    }

    if (bufferCache.has(url)) {
        _play(bufferCache.get(url));
    } else {
        preload(url).then(_play);
    }
}

/**
 * Pre-load an array of URLs in parallel.
 * Call this once at app startup to warm the cache.
 * @param {string[]} urls
 * @returns {Promise<void>}
 */
export function preloadAll(urls) {
    return Promise.all(urls.map(preload)).then(() => {});
}