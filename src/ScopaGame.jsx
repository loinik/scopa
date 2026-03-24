import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { mkDeck, shuffle, isScopa, score, cmpScore, enricoAI } from './game/logic';
import { play, preloadAll } from './game/audioManager';
import { useWebHaptics } from "web-haptics/react";
import {
    CW, CH, SUIT_SY, VAL_SX, BACK_SX, BACK_SY,
    TSLOTS, EH_XS, EH_Y, NH_XS, NH_Y,
    SLOT_1, SLOT_2, BTN_T, BTN_D, BTN_X, BTN_Q, OVL_TAKE, OVL_DISCARD,
    EBADGE, NBADGE,
} from './game/constants';

import en from './locales/en.js';
import it from './locales/it.js';
import kk from './locales/kk.js';
import uk from './locales/uk.js';
import ru from './locales/ru.js';
import fr from './locales/fr.js';
import de from './locales/de.js';

const LOCALES = { en, it, kk, uk, ru, fr, de };

// --- Card Deal and Flip audio ---
const BASE = import.meta.env.BASE_URL + 'sound/';

const dealAudioFiles = [
    BASE + 'Card_Deal01_SFX.mp3',
    BASE + 'Card_Deal02_SFX.mp3',
];
const flipAudioFiles = [
    BASE + 'CardFlip01_SFX.mp3',
    BASE + 'CardFlip02_SFX.mp3',
    BASE + 'CardFlip03_SFX.mp3',
    BASE + 'CardFlip04_SFX.mp3',
    BASE + 'CardFlip05_SFX.mp3',
];

const scopaAudio = {
    en: {
        player: [
            'NETVO019_en_SFX.mp3',
            'NETVO020_en_SFX.mp3',
            'NETVO021_en_SFX.mp3',
            'NETVO023_en_SFX.mp3',
            'NETVO023x_en_SFX.mp3',
        ],
        enemy: [
            'ETVO19_en_SFX.mp3',
            'ETVO20_en_SFX.mp3',
            'ETVO21_en_SFX.mp3',
            'ETVO22_en_SFX.mp3',
            'ETVO23_en_SFX.mp3',
        ],
    },
};

function playDealAudio() {
    const url = dealAudioFiles[Math.floor(Math.random() * dealAudioFiles.length)];
    play(url, 0.75);
}

function playFlipAudio() {
    const url = flipAudioFiles[Math.floor(Math.random() * flipAudioFiles.length)];
    play(url, 0.75);
}


function detectLocale(propLocale) {
    if (propLocale && LOCALES[propLocale]) return propLocale;
    const saved = localStorage.getItem('scopa_lang');
    if (saved && LOCALES[saved]) return saved;
    const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (lang.startsWith('fr')) return 'fr';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('uk')) return 'uk';
    if (lang.startsWith('kk')) return 'kk';
    if (lang.startsWith('ru')) return 'ru';
    if (lang.startsWith('it')) return 'it';
    return 'en';
}

export default function ScopaGame() {
    // Получаем locale через пропсы
    const props = arguments[0] || {};
    const locale = useMemo(() => detectLocale(props.locale), [props.locale]);
    const t = LOCALES[locale] || LOCALES.en;

    // ── Fullscreen handler ──
    useEffect(() => {
        function handleFullscreen(e) {
            const isMac = navigator.platform.toLowerCase().includes('mac');
            if ((isMac && e.metaKey && e.key === 'Enter') || (!isMac && e.altKey && e.key === 'Enter')) {
                const el = canvasRef.current;
                if (el && document.fullscreenElement !== el) {
                    el.requestFullscreen();
                } else if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
            }
        }
        window.addEventListener('keydown', handleFullscreen);
        return () => window.removeEventListener('keydown', handleFullscreen);
    }, []);

    const canvasRef = useRef(null);
    const modalCbRef = useRef(null);
    const modalOpenRef = useRef(false);
    const [modal, setModal] = useState(null);
    const { trigger } = useWebHaptics();

    // ── Resize canvas display size ──
    const resize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const s = Math.min(window.innerWidth / 640, window.innerHeight / 385);
        canvas.style.width = `${640 * s}px`;
        canvas.style.height = `${385 * s}px`;
    }, []);

    useEffect(() => {
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, [resize]);

    useEffect(() => {
        const scopaSfx = Object.values(scopaAudio).flatMap(lang =>
            [...(lang.player ?? []), ...(lang.enemy ?? [])]
        ).map(f => BASE + f);

        preloadAll([...dealAudioFiles, ...flipAudioFiles, ...scopaSfx]);
    }, []);


    // ── Game engine (all canvas logic in one closure) ──
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const FLASH_DURATION = 1250;
        const OVERLAY_COLOR = '#cc0000';

        const imgs = {};
        let G = null;
        let flashVal = 0, flashCol = '#f0c040', flashTxt = '';
        let animId = null;
        let rafAnim = null;
        let enricoTimer = null;
        let mounted = true;

        const selCanvas = document.createElement('canvas');
        selCanvas.width = CW; selCanvas.height = CH;
        const selCtx = selCanvas.getContext('2d');

        const fadeMap = new Map();
        const overlayMap = new Map();

        function ensureAnim(id) {
            if (!fadeMap.has(id)) fadeMap.set(id, { val: 1 });
            if (!overlayMap.has(id)) overlayMap.set(id, { val: 0, target: 0 });
        }
        function addFadeIn(id) {
            fadeMap.set(id, { val: 0 });
            if (!overlayMap.has(id)) overlayMap.set(id, { val: 0, target: 0 });
            scheduleAnim();
        }
        function setOverlayTarget(id, target) {
            if (!overlayMap.has(id)) overlayMap.set(id, { val: 0, target });
            else overlayMap.get(id).target = target;
            scheduleAnim();
        }
        function clearAllOverlays() {
            overlayMap.forEach(a => { a.target = 0; });
            scheduleAnim();
        }
        function scheduleAnim() {
            if (rafAnim || !mounted) return;
            rafAnim = requestAnimationFrame(animTick);
        }
        function animTick() {
            rafAnim = null;
            if (!mounted) return;
            let needMore = false;
            fadeMap.forEach(a => {
                if (a.val < 1) {
                    a.val = Math.min(1, a.val + 0.1);
                    if (a.val < 1) needMore = true;
                }
            });
            overlayMap.forEach(a => {
                if (a.val !== a.target) {
                    a.val += (a.target - a.val) * 0.22;
                    if (Math.abs(a.val - a.target) < 0.004) a.val = a.target;
                    else needMore = true;
                }
            });
            render();
            if (needMore) scheduleAnim();
        }

        // ─────────────────── Image loading ───────────────────
        let loadCount = 0;
        function loadImg(key, src) {
            const img = new Image();
            img.onload = () => { imgs[key] = img; if (++loadCount === 3 && mounted) initGame(); };
            img.src = src;
        }
        loadImg('bg', import.meta.env.BASE_URL + 'video/CAS_Scopa_BG.png');
        loadImg('ovl', import.meta.env.BASE_URL + 'ciftree/CAS_SCPACRD_OVL.png');
        loadImg('cards', import.meta.env.BASE_URL + 'ciftree/CAS_SCPACRD-TXT_OVL.png');

        // ─────────────────── Draw helpers ───────────────────
        function drawCard(c, x, y) {
            ctx.drawImage(imgs.cards, VAL_SX[c.v - 1], SUIT_SY[c.s], CW, CH, x - 2, y - 2, CW, CH);
        }
        function drawCardSelected(c, x, y, redAlpha) {
            selCtx.clearRect(0, 0, CW, CH);
            selCtx.drawImage(imgs.cards, VAL_SX[c.v - 1], SUIT_SY[c.s], CW, CH, 0, 0, CW, CH);
            selCtx.save();
            selCtx.globalCompositeOperation = 'source-atop';
            selCtx.globalAlpha = redAlpha * 0.72;
            selCtx.fillStyle = OVERLAY_COLOR;
            selCtx.fillRect(0, 0, CW, CH);
            selCtx.restore();
            ctx.drawImage(selCanvas, x - 2, y - 2);
        }
        function drawBack(x, y) {
            ctx.drawImage(imgs.cards, BACK_SX, BACK_SY, CW, CH, x - 2, y - 2, CW, CH);
        }
        function drawOvlBtn(ovlSrc, rect, active) {
            if (!active) return;
            ctx.drawImage(imgs.ovl, ovlSrc.sx, ovlSrc.sy, ovlSrc.sw, ovlSrc.sh,
                rect.x, rect.y, ovlSrc.sw, ovlSrc.sh);
        }
        function drawCircBtn(label, b) {
            ctx.save();
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
            ctx.strokeStyle = 'rgba(120,160,40,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.font = 'bold 12px "Palatino Linotype"';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(140,180,60,0.8)';
            ctx.fillText(label, b.x, b.y);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.restore();
        }
        function drawEnricoBadge(pts, sc) {
            const { x, y } = EBADGE, W = 148, H = 62;
            ctx.fillStyle = 'rgba(8,3,0,0.82)';
            ctx.beginPath(); ctx.roundRect(x, y, W, H, 8); ctx.fill();
            ctx.strokeStyle = '#c8960c'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.roundRect(x, y, W, H, 8); ctx.stroke();
            ctx.font = 'bold 18px "Palatino Linotype",Georgia,serif';
            ctx.fillStyle = '#f0c018'; ctx.fillText(t.enrico.toUpperCase(), x + 8, y + 21);
            ctx.fillStyle = '#6a0808';
            ctx.beginPath(); ctx.roundRect(x + 8, y + 28, W - 16, 22, 4); ctx.fill();
            ctx.font = 'bold 14px "Palatino Linotype"';
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
            ctx.fillText(`${pts} pts  ⚡${sc}`, x + W / 2, y + 43);
            ctx.textAlign = 'left';
            ctx.beginPath(); ctx.arc(x + W - 18, y + 20, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#1a4030'; ctx.fill();
            ctx.strokeStyle = '#c8960c'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#20d080';
            ctx.fillText('🎭', x + W - 18, y + 25); ctx.textAlign = 'left';
        }
        function drawNancyBadge(pts, sc) {
            const { x, y } = NBADGE, W = 148, H = 62;
            ctx.fillStyle = 'rgba(8,3,0,0.82)';
            ctx.beginPath(); ctx.roundRect(x, y, W, H, 8); ctx.fill();
            ctx.strokeStyle = '#18c8d0'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.roundRect(x, y, W, H, 8); ctx.stroke();
            ctx.font = 'bold 18px "Palatino Linotype",Georgia,serif';
            ctx.fillStyle = '#18c8d0'; ctx.fillText(t.you.toUpperCase(), x + 8, y + 21);
            ctx.fillStyle = '#0a1850';
            ctx.beginPath(); ctx.roundRect(x + 8, y + 28, W - 16, 22, 4); ctx.fill();
            ctx.font = 'bold 14px "Palatino Linotype"';
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
            ctx.fillText(`${pts} pts  ⚡${sc}`, x + W / 2, y + 43);
            ctx.textAlign = 'left';
            ctx.beginPath(); ctx.arc(x + W - 18, y + 20, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#0a3050'; ctx.fill();
            ctx.strokeStyle = '#18c8d0'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#18c8d0';
            ctx.fillText('🕶️', x + W - 18, y + 25); ctx.textAlign = 'left';
        }

        function isValidCapture(sel, tablesel, table) {
            if (!sel || !tablesel.length) return false;
            if (tablesel.length === 1) return tablesel[0].v === sel.v;
            const sum = tablesel.reduce((a, c) => a + c.v, 0);
            if (sum !== sel.v) return false;
            return !table.some(t => t.v === sel.v);
        }
        function canAnyCapture() {
            if (!G || !G.pH.length || !G.table.length) return false;
            const n = G.table.length;
            for (const card of G.pH) {
                for (const tc of G.table) if (tc.v === card.v) return true;
                for (let mask = 3; mask < (1 << n); mask++) {
                    if ((mask & (mask - 1)) === 0) continue;
                    let sum = 0;
                    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += G.table[i].v;
                    if (sum === card.v) return true;
                }
            }
            return false;
        }

        // ─────────────────── Render ───────────────────
        function render() {
            if (!mounted) return;
            ctx.clearRect(0, 0, 640, 385);
            ctx.drawImage(imgs.bg, 0, 0, 640, 385);

            // SLOT_2 = Enrico's captured pile — visible after his first capture
            // SLOT_1 = Player's captured pile  — visible after player's first TAKE
            if (imgs.ovl) {
                if (G.eTaken) ctx.drawImage(imgs.ovl, 106, 1, 104, 104, SLOT_2.x, SLOT_2.y, SLOT_2.w, SLOT_2.h);
                if (G.pTaken) ctx.drawImage(imgs.ovl, 1, 1, 104, 104, SLOT_1.x, SLOT_1.y, SLOT_1.w, SLOT_1.h);
            }

            for (const c of G.table) {
                const sl = TSLOTS[G.tableSlots[c.id]];
                if (!sl) continue;
                ensureAnim(c.id);
                const fa = fadeMap.get(c.id);
                const oa = overlayMap.get(c.id);
                ctx.save();
                ctx.globalAlpha = fa ? fa.val : 1;
                const redA = oa ? oa.val : 0;
                if (redA > 0.005) drawCardSelected(c, sl.x, sl.y, redA);
                else drawCard(c, sl.x, sl.y);
                ctx.restore();
            }

            for (const c of G.eH) {
                const slotIdx = G.eHandSlots[c.id];
                if (slotIdx === undefined) continue;
                const isPlayed = G.enricoAnim && G.enricoAnim.c.id === c.id;
                if (isPlayed) {
                    ensureAnim(c.id);
                    const fa = fadeMap.get(c.id);
                    const oa = overlayMap.get(c.id);
                    ctx.save();
                    ctx.globalAlpha = fa ? fa.val : 1;
                    const redA = oa ? oa.val : 0;
                    if (redA > 0.005) drawCardSelected(c, EH_XS[slotIdx], EH_Y, redA);
                    else drawCard(c, EH_XS[slotIdx], EH_Y);
                    ctx.restore();
                } else {
                    drawBack(EH_XS[slotIdx], EH_Y);
                }
            }

            const anyTableSel = G.tablesel.length > 0;
            const canTake = G.phase === 'player' && isValidCapture(G.sel, G.tablesel, G.table);
            const tableFull = G.table.length >= 10;
            let canDiscard = false;
            if (G.phase === 'player' && !!G.sel && !anyTableSel && !(tableFull && canAnyCapture())) {
                const sel = G.sel;
                let canCapture = false;
                for (const tc of G.table) {
                    if (tc.v === sel.v) { canCapture = true; break; }
                }
                if (!canCapture && G.table.length > 1) {
                    const n = G.table.length;
                    for (let mask = 3; mask < (1 << n); mask++) {
                        if ((mask & (mask - 1)) === 0) continue;
                        let sum = 0;
                        for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += G.table[i].v;
                        if (sum === sel.v && !G.table.some(t => t.v === sel.v)) { canCapture = true; break; }
                    }
                }
                canDiscard = !canCapture;
            }
            drawOvlBtn(OVL_TAKE, BTN_T, canTake);
            drawOvlBtn(OVL_DISCARD, BTN_D, canDiscard);

            for (const c of G.pH) {
                const slotIdx = G.handSlots[c.id];
                if (slotIdx === undefined) continue;
                ensureAnim(c.id);
                const fa = fadeMap.get(c.id);
                const oa = overlayMap.get(c.id);
                ctx.save();
                ctx.globalAlpha = fa ? fa.val : 1;
                const redA = oa ? oa.val : 0;
                if (redA > 0.005) drawCardSelected(c, NH_XS[slotIdx], NH_Y, redA);
                else drawCard(c, NH_XS[slotIdx], NH_Y);
                ctx.restore();
            }

            drawEnricoBadge(G.totE, G.eSc);
            drawNancyBadge(G.totP, G.pSc);

            if (flashVal > 0) {
                ctx.save();
                ctx.globalAlpha = flashVal / FLASH_DURATION * 0.45;
                ctx.fillStyle = flashCol; ctx.fillRect(0, 0, 640, 385);
                ctx.globalAlpha = Math.min(1, flashVal / (FLASH_DURATION * 0.375));
                ctx.font = 'bold 46px "Palatino Linotype"'; ctx.textAlign = 'center';
                ctx.fillStyle = flashCol; ctx.shadowColor = flashCol; ctx.shadowBlur = 22;
                ctx.fillText(flashTxt, 320, 200);
                ctx.restore();
                flashVal--;
                if (flashVal > 0) animId = requestAnimationFrame(render);
            }
        }

        function playScopaAudio(role) {
            const lang = (locale in scopaAudio) ? locale : 'en';
            const arr = scopaAudio[lang]?.[role] || scopaAudio['en'][role];
            if (!arr?.length) return;
            const url = BASE + arr[Math.floor(Math.random() * arr.length)];
            play(url, 1.0);
        }

        function flash(txt, col, role) {
            flashVal = FLASH_DURATION; flashTxt = txt; flashCol = col || '#f0c040';
            if (txt.includes('SCOPA')) {
                if (role === 'player') playScopaAudio('player');
                else if (role === 'enemy') playScopaAudio('enemy');
                trigger([
                    { duration: 60 },
                    { delay: 60, duration: 60, intensity: 1 },
                ]);
            }
            animId = requestAnimationFrame(render);
        }

        // ─────────────────── Table / hand slot helpers ───────────────────
        function addToTable(c) {
            const used = new Set(Object.values(G.tableSlots));
            let slot = 0;
            while (used.has(slot)) slot++;
            G.table.push(c);
            G.tableSlots[c.id] = slot;
        }
        function removeFromTable(ids) {
            const s = new Set(ids);
            G.table = G.table.filter(t => !s.has(t.id));
            for (const id of ids) delete G.tableSlots[id];
        }
        function addToHand(cards) {
            const used = new Set(Object.values(G.handSlots));
            for (const c of cards) {
                let slot = 0;
                while (used.has(slot)) slot++;
                used.add(slot);
                G.pH.push(c);
                G.handSlots[c.id] = slot;
            }
        }
        function removeFromHand(id) {
            G.pH = G.pH.filter(c => c.id !== id);
            delete G.handSlots[id];
        }
        function addToEnricoHand(cards) {
            const used = new Set(Object.values(G.eHandSlots));
            for (const c of cards) {
                let slot = 0;
                while (used.has(slot)) slot++;
                used.add(slot);
                G.eH.push(c);
                G.eHandSlots[c.id] = slot;
            }
        }
        function removeFromEnricoHand(id) {
            G.eH = G.eH.filter(c => c.id !== id);
            delete G.eHandSlots[id];
        }

        // ─────────────────── Game state ───────────────────
        function dealValid() {
            let deck, table;
            do {
                deck = shuffle(mkDeck());
                const pH = deck.slice(0, 3);
                const eH = deck.slice(3, 6);
                table = deck.slice(6, 10);
                const kings = table.filter(c => c.v === 10).length;
                if (kings < 3) return { deck: deck.slice(10), pH, eH, table };
            } while (true);
        }

        function initGame() {
            const deal = dealValid();
            G = {
                deck: deal.deck,
                pH: [], handSlots: {},
                eH: [], eHandSlots: {}, enricoAnim: null,
                table: [], tableSlots: {},
                pP: [], eP: [], pSc: 0, eSc: 0, totP: 0, totE: 0,
                phase: 'player', sel: null, tablesel: [], lastCap: '', round: 1,
                pTaken: false, eTaken: false,  // captured-pile visibility flags
            };
            addToHand(deal.pH);
            addToEnricoHand(deal.eH);
            G.table = deal.table;
            G.table.forEach((c, i) => { G.tableSlots[c.id] = i; });
            [...G.pH, ...G.eH, ...G.table].forEach(c => {
                fadeMap.set(c.id, { val: 1 });
                overlayMap.set(c.id, { val: 0, target: 0 });
            });
            render();
        }

        // ─────────────────── Actions ───────────────────
        function selCard(c) {
            if (G.phase !== 'player') return;
            trigger([{ duration: 8 }], { intensity: 0.3 });
            playFlipAudio();
            if (G.sel && G.sel.id === c.id) {
                setOverlayTarget(G.sel.id, 0);
                G.tablesel.forEach(tc => setOverlayTarget(tc.id, 0));
                G.sel = null; G.tablesel = [];
            } else {
                if (G.sel) setOverlayTarget(G.sel.id, 0);
                G.tablesel.forEach(tc => setOverlayTarget(tc.id, 0));
                G.tablesel = [];
                G.sel = c;
                setOverlayTarget(c.id, 1);
            }
            render();
        }

        function toggleTableCard(tc) {
            if (!G.sel || G.phase !== 'player') return;
            trigger([{ duration: 8 }], { intensity: 0.3 });
            playFlipAudio();
            const idx = G.tablesel.findIndex(x => x.id === tc.id);
            if (idx >= 0) { G.tablesel.splice(idx, 1); setOverlayTarget(tc.id, 0); }
            else { G.tablesel.push(tc); setOverlayTarget(tc.id, 1); }
            render();
        }

        function doTake() {
            if (!G.sel || !isValidCapture(G.sel, G.tablesel, G.table) || G.phase !== 'player') return;
            trigger([{ duration: 8 }], { intensity: 0.3 });
            playDealAudio();
            const c = G.sel, cap = G.tablesel;
            const sc = isScopa(G.table, cap);
            removeFromTable(cap.map(x => x.id));
            G.pP.push(c, ...cap);
            removeFromHand(c.id);
            G.lastCap = 'p';
            G.pTaken = true;  // player's captured pile is now visible
            clearAllOverlays();
            if (sc) { G.pSc++; flash('⚡ SCOPA!', '#f0c040', 'player'); }
            G.sel = null; G.tablesel = [];
            afterP();
        }

        function doDiscard() {
            if (!G.sel || G.phase !== 'player') return;
            trigger([{ duration: 8 }], { intensity: 0.3 });
            playFlipAudio();
            const sel = G.sel;
            let canCapture = false;
            for (const tc of G.table) {
                if (tc.v === sel.v) { canCapture = true; break; }
            }
            if (!canCapture && G.table.length > 1) {
                const n = G.table.length;
                for (let mask = 3; mask < (1 << n); mask++) {
                    if ((mask & (mask - 1)) === 0) continue;
                    let sum = 0;
                    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += G.table[i].v;
                    if (sum === sel.v && !G.table.some(t => t.v === sel.v)) { canCapture = true; break; }
                }
            }
            if (canCapture) return;
            setOverlayTarget(sel.id, 0);
            addToTable(sel);
            addFadeIn(sel.id);
            removeFromHand(sel.id);
            G.lastCap = ''; G.sel = null; G.tablesel = [];
            afterP();
        }

        function afterP() {
            if (!G.pH.length && !G.eH.length) { redeal(); return; }
            G.phase = 'enrico';
            render();
            enricoTimer = setTimeout(doEnrico, 600 + Math.random() * 900);
        }

        function doEnrico() {
            if (!mounted || G.phase !== 'enrico') return;
            const { c, cap } = enricoAI(G.eH, G.table);
            G.enricoAnim = { c, cap: cap || null };
            playFlipAudio();
            addFadeIn(c.id);
            setOverlayTarget(c.id, 1);
            if (cap) cap.forEach(tc => setOverlayTarget(tc.id, 1));
            render();
            enricoTimer = setTimeout(finishEnrico, 900);
        }

        function finishEnrico() {
            if (!mounted) return;
            const { c, cap } = G.enricoAnim;
            G.enricoAnim = null;
            clearAllOverlays();
            if (cap) {
                playDealAudio();
                const sc = isScopa(G.table, cap);
                removeFromTable(cap.map(x => x.id));
                G.eP.push(c, ...cap);
                G.lastCap = 'e';
                G.eTaken = true;  // Enrico's captured pile is now visible
                if (sc) {
                    G.eSc++;
                    flash('Enrico SCOPA!', '#e07070', 'enemy');
                }
            } else {
                addToTable(c);
                addFadeIn(c.id);
            }
            removeFromEnricoHand(c.id);
            if (!G.pH.length && !G.eH.length) redeal();
            else { G.phase = 'player'; render(); }
        }

        function redeal() {
            if (G.deck.length >= 6) {
                const newCards = G.deck.splice(0, 6);
                G.handSlots = {}; G.pH = [];
                addToHand(newCards.slice(0, 3));
                G.eHandSlots = {}; G.eH = [];
                addToEnricoHand(newCards.slice(3, 6));
                newCards.forEach(c => {
                    fadeMap.set(c.id, { val: 0 });
                    overlayMap.set(c.id, { val: 0, target: 0 });
                });
                G.phase = (G.round === 1) ? 'player' : 'enrico';
                scheduleAnim();
                render();
                if (G.phase === 'enrico') {
                    enricoTimer = setTimeout(doEnrico, 600 + Math.random() * 900);
                }
            } else {
                endRound();
            }
        }

        function endRound() {
            if (G.table.length) {
                (G.lastCap === 'p' ? G.pP : G.eP).push(...G.table);
                G.table = []; G.tableSlots = {};
            }
            const ps = score(G.pP, G.pSc), es = score(G.eP, G.eSc);
            const pts = cmpScore(ps, es);
            G.totP += pts.p; G.totE += pts.e;
            G.phase = 'end';

            const lines = [];
            lines.push(`${t.scoring} ${G.round}`);
            lines.push('─────────────────────────────');
            lines.push(`${t.mostCards}:        ${ps.n} vs ${es.n}   →  ${ps.n > es.n ? t.you + ' +1' : es.n > ps.n ? t.enrico + ' +1' : t.tie}`);
            lines.push(`${t.mostCoins}:        ${ps.den} vs ${es.den}   →  ${ps.den > es.den ? t.you + ' +1' : es.den > ps.den ? t.enrico + ' +1' : t.tie}`);
            lines.push(`${t.settebello}:        ${ps.sb ? t.you + ' ✓' : es.sb ? t.enrico + ' ✓' : '—'}`);
            lines.push(`${t.primiera}:          ${ps.pp} vs ${es.pp}   →  ${ps.pp > es.pp ? t.you + ' +1' : es.pp > ps.pp ? t.enrico + ' +1' : t.tie}`);
            lines.push(`${t.scopas}:            ${ps.sc} vs ${es.sc}   →  ${ps.sc > es.sc ? t.you + ' +1' : es.sc > ps.sc ? t.enrico + ' +1' : t.tie}`);
            lines.push('─────────────────────────────');
            lines.push(`${t.yourTotal}:   ${G.totP}`);
            lines.push(`${t.enricoTotal}: ${G.totE}`);
            showModal(
                `${t.endRound} ${G.round}`,
                lines.join('\n'),
                () => {
                    if (G.round >= 2) {
                        showModal(
                            G.totP > G.totE ? t.youWin : t.enricoWins,
                            `${t.finalScore}: ${t.you} ${G.totP} — ${t.enrico} ${G.totE}`,
                            () => { G.totP = 0; G.totE = 0; G.round = 1; newRound(); }
                        );
                    } else {
                        G.round++;
                        newRound();
                    }
                }
            );
        }

        function newRound() {
            fadeMap.clear();
            overlayMap.clear();
            const deal = dealValid();
            G.deck = deal.deck;
            G.pP = []; G.eP = []; G.pSc = 0; G.eSc = 0; G.lastCap = '';
            G.tableSlots = {}; G.table = [];
            G.handSlots = {}; G.pH = [];
            G.eHandSlots = {}; G.eH = [];
            G.enricoAnim = null;
            G.pTaken = false; G.eTaken = false;  // reset pile visibility for new round
            addToHand(deal.pH);
            addToEnricoHand(deal.eH);
            G.table = deal.table;
            G.table.forEach((c, i) => { G.tableSlots[c.id] = i; });
            [...G.pH, ...G.eH, ...G.table].forEach(c => {
                fadeMap.set(c.id, { val: 1 });
                overlayMap.set(c.id, { val: 0, target: 0 });
            });
            G.sel = null; G.tablesel = [];
            G.phase = (G.round === 1) ? 'player' : 'enrico';
            render();
            if (G.phase === 'enrico') {
                enricoTimer = setTimeout(doEnrico, 600 + Math.random() * 900);
            }
        }

        // ─────────────────── Modal bridge ───────────────────
        function showModal(title, body, cb) {
            modalCbRef.current = cb;
            modalOpenRef.current = true;
            setModal({ title, body });
        }

        // ─────────────────── Input ───────────────────
        function xy(e) {
            const r = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) * (640 / r.width),
                y: (e.clientY - r.top) * (385 / r.height),
            };
        }
        function hit(x, y, rx, ry, rw, rh) {
            return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
        }

        function handleClick(e) {
            if (!G || G.phase !== 'player' || modalOpenRef.current) return;
            const { x, y } = xy(e);
            const anyTableSel = G.tablesel.length > 0;
            const canTake = isValidCapture(G.sel, G.tablesel, G.table);
            const tableFull = G.table.length >= 10;
            const canDiscard = !!G.sel && !anyTableSel && !(tableFull && canAnyCapture());
            if (canTake && hit(x, y, BTN_T.x, BTN_T.y, BTN_T.w, BTN_T.h)) { doTake(); return; }
            if (canDiscard && hit(x, y, BTN_D.x, BTN_D.y, BTN_D.w, BTN_D.h)) { doDiscard(); return; }
            for (const c of G.pH) {
                const slotIdx = G.handSlots[c.id];
                if (slotIdx === undefined) continue;
                if (hit(x, y, NH_XS[slotIdx], NH_Y, CW, CH)) { selCard(c); return; }
            }
            for (const c of G.table) {
                const s = TSLOTS[G.tableSlots[c.id]];
                if (s && hit(x, y, s.x, s.y, CW, CH) && G.sel) { toggleTableCard(c); return; }
            }
        }

        function handleMouseMove(e) {
            if (!G || G.phase !== 'player') { canvas.style.cursor = 'default'; return; }
            const { x, y } = xy(e);
            const anyTableSel = G.tablesel.length > 0;
            const canTake = isValidCapture(G.sel, G.tablesel, G.table);
            const tableFull = G.table.length >= 10;
            const canDiscard = !!G.sel && !anyTableSel && !(tableFull && canAnyCapture());
            let cur = 'default';
            for (const c of G.pH) {
                const slotIdx = G.handSlots[c.id];
                if (slotIdx === undefined) continue;
                if (hit(x, y, NH_XS[slotIdx], NH_Y - 12, CW, CH + 12)) { cur = 'pointer'; break; }
            }
            if (cur === 'default') {
                if (canTake && hit(x, y, BTN_T.x, BTN_T.y, BTN_T.w, BTN_T.h)) cur = 'pointer';
                if (canDiscard && hit(x, y, BTN_D.x, BTN_D.y, BTN_D.w, BTN_D.h)) cur = 'pointer';
                if (G.sel) {
                    for (const c of G.table) {
                        const s = TSLOTS[G.tableSlots[c.id]];
                        if (s && hit(x, y, s.x, s.y, CW, CH)) { cur = 'pointer'; break; }
                    }
                }
            }
            canvas.style.cursor = cur;
        }

        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('mousemove', handleMouseMove);

        return () => {
            mounted = false;
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('mousemove', handleMouseMove);
            if (animId) cancelAnimationFrame(animId);
            if (rafAnim) cancelAnimationFrame(rafAnim);
            if (enricoTimer) clearTimeout(enricoTimer);
        };
    }, [setModal]);

    // ── Modal OK handler (React side) ──
    const handleModalOk = useCallback(() => {
        trigger([{ duration: 8 }], { intensity: 0.3 });
        const cb = modalCbRef.current;
        modalCbRef.current = null;
        modalOpenRef.current = false;
        setModal(null);
        if (cb) cb();
    }, []);

    return (
        <div style={{ position: 'relative', lineHeight: 0 }}>
            <canvas
                ref={canvasRef}
                width={640}
                height={385}
                style={{ display: 'block', imageRendering: 'pixelated', cursor: 'default' }}
            />
            {modal && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(4,2,10,0.97)',
                    border: '2px solid #b89820',
                    borderRadius: 10,
                    padding: '18px 24px',
                    textAlign: 'center',
                    zIndex: 20,
                    minWidth: 270,
                    fontFamily: "'Palatino Linotype', Georgia, serif",
                    color: '#d4a017',
                }}>
                    <h2 style={{ fontSize: 18, fontWeight: 400, marginBottom: 8, color: '#f0c040' }}>
                        {modal.title}
                    </h2>
                    <pre style={{
                        fontSize: 12, color: '#c09848',
                        whiteSpace: 'pre-wrap', marginBottom: 12,
                        textAlign: 'left', lineHeight: 1.8,
                    }}>
                        {modal.body}
                    </pre>
                    <button
                        onClick={handleModalOk}
                        style={{
                            padding: '7px 20px',
                            background: 'linear-gradient(160deg,#5a2000,#9a5808)',
                            color: '#fffae0',
                            border: '1px solid #c89820',
                            borderRadius: 12,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 13,
                            letterSpacing: '.5px',
                        }}
                    >
                        {t.continue}
                    </button>
                </div>
            )}
        </div>
    );
}