import { useRef, useEffect, useState, useCallback } from 'react';
import { mkDeck, shuffle, isScopa, score, cmpScore, enricoAI } from './game/logic';
import bgUrl from './assets/CAS_Scopa_BG.png';
import ovlUrl from './assets/CAS_SCPACRD_OVL.png';
import cardsUrl from './assets/CAS_SCPACRD-TXT_OVL.png';
import {
    CW, CH, SUIT_SY, VAL_SX, BACK_SX, BACK_SY,
    TSLOTS, EH_XS, EH_Y, NH_XS, NH_Y,
    SLOT_1, SLOT_2, BTN_T, BTN_D, BTN_X, BTN_Q, OVL_TAKE, OVL_DISCARD,
    EBADGE, NBADGE,
} from './game/constants';

export default function ScopaGame() {
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
    const [modal, setModal] = useState(null); // { title, body }

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

    // ── Game engine (all canvas logic in one closure) ──
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Config
        const FLASH_DURATION = 1250; // Flash duration in frames
        const OVERLAY_COLOR = '#cc0000'; // Overlay color for selected cards

        const imgs = {};
        let G = null;
        let flashVal = 0, flashCol = '#f0c040', flashTxt = '';
        let animId = null;
        let rafAnim = null;
        let enricoTimer = null;
        let mounted = true;

        // ── Off-screen canvas for clipped red overlay (source-atop compositing) ──
        const selCanvas = document.createElement('canvas');
        selCanvas.width = CW; selCanvas.height = CH;
        const selCtx = selCanvas.getContext('2d');

        // ── Per-card animation maps ──
        // fadeMap    : id → { val: 0..1 }               — fade-in alpha
        // overlayMap : id → { val: 0..1, target: 0|1 }  — red overlay
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
        loadImg('bg', bgUrl);
        loadImg('ovl', ovlUrl);
        loadImg('cards', cardsUrl);

        // ─────────────────── Draw helpers ───────────────────
        function drawCard(c, x, y) {
            // -2,-2: shifts within the sprite to include the shadow pixels on all edges
            ctx.drawImage(imgs.cards, VAL_SX[c.v - 1], SUIT_SY[c.s], CW, CH, x - 2, y - 2, CW, CH);
        }
        // Draw card with red overlay clipped to its own non-transparent pixels (no bleed on shadows).
        // Uses an off-screen canvas so source-atop only affects the card pixels, not the background.
        function drawCardSelected(c, x, y, redAlpha) {
            selCtx.clearRect(0, 0, CW, CH);
            selCtx.drawImage(imgs.cards, VAL_SX[c.v - 1], SUIT_SY[c.s], CW, CH, 0, 0, CW, CH);
            selCtx.save();
            selCtx.globalCompositeOperation = 'source-atop';
            selCtx.globalAlpha = redAlpha * 0.72;  // 0.72 → noticeably dark
            selCtx.fillStyle = OVERLAY_COLOR;
            selCtx.fillRect(0, 0, CW, CH);
            selCtx.restore();
            ctx.drawImage(selCanvas, x - 2, y - 2);
        }
        function drawBack(x, y) {
            ctx.drawImage(imgs.cards, BACK_SX, BACK_SY, CW, CH, x - 2, y - 2, CW, CH);
        }
        // Buttons: completely invisible when not active
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
            ctx.fillStyle = '#f0c018'; ctx.fillText('ENRICO', x + 8, y + 21);
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
            ctx.fillStyle = '#18c8d0'; ctx.fillText('NANCY', x + 8, y + 21);
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
            // Per Scopa rules: can't use a multi-card combination if a single
            // card of the same value exists on the table — you must take that instead.
            return !table.some(t => t.v === sel.v);
        }
        // Does ANY hand card have a possible capture on the current table?
        function canAnyCapture() {
            if (!G || !G.pH.length || !G.table.length) return false;
            const n = G.table.length;
            for (const card of G.pH) {
                for (const tc of G.table) if (tc.v === card.v) return true;
                for (let mask = 3; mask < (1 << n); mask++) {
                    if ((mask & (mask - 1)) === 0) continue; // single-bit masks already checked above
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

            // Deck indicators — hidden when the draw pile is exhausted
            if (G.deck.length > 0 && imgs.ovl) {
                ctx.drawImage(imgs.ovl, 106, 1, 104, 104, SLOT_2.x, SLOT_2.y, SLOT_2.w, SLOT_2.h);
                ctx.drawImage(imgs.ovl, 1, 1, 104, 104, SLOT_1.x, SLOT_1.y, SLOT_1.w, SLOT_1.h);
            }

            // Table cards — each card is fixed to its assigned slot; slots never shift on capture/deal
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

            // Enrico hand — fixed slots; played card shown face-up during his turn animation
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

            // Buttons: invisible until active; DISCARD off when table cards selected or table full + capture exists
            const anyTableSel = G.tablesel.length > 0;
            const canTake = G.phase === 'player' && isValidCapture(G.sel, G.tablesel, G.table);
            const tableFull = G.table.length >= 10;
            let canDiscard = false;
            if (G.phase === 'player' && !!G.sel && !anyTableSel && !(tableFull && canAnyCapture())) {
                // Discard allowed only if selected card cannot capture (single or multi-card)
                const sel = G.sel;
                let canCapture = false;
                // Single card match
                for (const tc of G.table) {
                    if (tc.v === sel.v) { canCapture = true; break; }
                }
                // Multi-card match
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
            //   drawCircBtn('✕', BTN_X);
            //   drawCircBtn('?', BTN_Q);

            // Nancy's hand — each card fixed to its assigned slot
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

            // Score badges
            drawEnricoBadge(G.totE, G.eSc);
            drawNancyBadge(G.totP, G.pSc);

            // Info text
            //   ctx.font = '10px "Palatino Linotype"'; ctx.fillStyle = 'rgba(200,180,100,0.7)';
            //   ctx.fillText(`Mazzo: ${G.deck.length}`,  SLOT_1.x,      SLOT_1.y - 5);
            //   ctx.fillText(`Carte: ${G.pP.length}`,    SLOT_1.x + 70, SLOT_1.y - 5);

            // Enrico thinking indicator
            //   if (G.phase === 'enrico') {
            //     ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(150, 8, 130, 18);
            //     ctx.font = 'italic 11px "Palatino Linotype"'; ctx.fillStyle = '#e08060';
            //     ctx.fillText('Enrico pensa…', 153, 20);
            //   }

            // Flash overlay
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

        function flash(t, c) {
            flashVal = FLASH_DURATION; flashTxt = t; flashCol = c || '#f0c040';
            animId = requestAnimationFrame(render);
        }

        // ─────────────────── Table slot helpers ───────────────────
        // Each card on the table occupies a fixed TSLOTS index so positions never shift.
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
        function initGame() {
            G = {
                deck: shuffle(mkDeck()),
                pH: [], handSlots: {},
                eH: [], eHandSlots: {}, enricoAnim: null,
                table: [], tableSlots: {},
                pP: [], eP: [], pSc: 0, eSc: 0, totP: 0, totE: 0,
                phase: 'player', sel: null, tablesel: [], lastCap: '', round: 1,
            };
            addToHand(G.deck.splice(0, 3));
            addToEnricoHand(G.deck.splice(0, 3));
            G.table = G.deck.splice(0, 4);
            G.table.forEach((c, i) => { G.tableSlots[c.id] = i; });
            // Game start: all cards appear immediately (no fade-in)
            [...G.pH, ...G.eH, ...G.table].forEach(c => {
                fadeMap.set(c.id, { val: 1 });
                overlayMap.set(c.id, { val: 0, target: 0 });
            });
            render();
        }

        // ─────────────────── Actions ───────────────────
        function selCard(c) {
            if (G.phase !== 'player') return;
            if (G.sel && G.sel.id === c.id) {
                // Deselect
                setOverlayTarget(G.sel.id, 0);
                G.tablesel.forEach(tc => setOverlayTarget(tc.id, 0));
                G.sel = null; G.tablesel = [];
            } else {
                // Switch selection
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
            const idx = G.tablesel.findIndex(x => x.id === tc.id);
            if (idx >= 0) { G.tablesel.splice(idx, 1); setOverlayTarget(tc.id, 0); }
            else { G.tablesel.push(tc); setOverlayTarget(tc.id, 1); }
            render();
        }

        function doTake() {
            if (!G.sel || !isValidCapture(G.sel, G.tablesel, G.table) || G.phase !== 'player') return;
            const c = G.sel, cap = G.tablesel;
            const sc = isScopa(G.table, cap);  // check BEFORE removing — board must be empty after
            removeFromTable(cap.map(x => x.id));
            G.pP.push(c, ...cap);
            removeFromHand(c.id);
            G.lastCap = 'p';
            clearAllOverlays();
            if (sc) { G.pSc++; flash('⚡ SCOPA!', '#f0c040'); }
            G.sel = null; G.tablesel = [];
            afterP();
        }

        function doDiscard() {
            if (!G.sel || G.phase !== 'player') return;
            // New rule: cannot discard a card if it can capture (single or multi-card)
            // Check if selected card can capture anything
            const sel = G.sel;
            let canCapture = false;
            // Single card match
            for (const tc of G.table) {
                if (tc.v === sel.v) { canCapture = true; break; }
            }
            // Multi-card match
            if (!canCapture && G.table.length > 1) {
                const n = G.table.length;
                for (let mask = 3; mask < (1 << n); mask++) {
                    if ((mask & (mask - 1)) === 0) continue; // skip single-bit masks
                    let sum = 0;
                    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += G.table[i].v;
                    if (sum === sel.v && !G.table.some(t => t.v === sel.v)) { canCapture = true; break; }
                }
            }
            if (canCapture) return; // Cannot discard if capture possible
            setOverlayTarget(sel.id, 0);
            addToTable(sel);
            addFadeIn(sel.id);  // new card on table fades in
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
            // Fade the played card in face-up, add red overlay
            addFadeIn(c.id);
            setOverlayTarget(c.id, 1);
            // Highlight the table cards being captured
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
                const sc = isScopa(G.table, cap);
                removeFromTable(cap.map(x => x.id));
                G.eP.push(c, ...cap);
                G.lastCap = 'e';
                if (sc) { G.eSc++; flash('Enrico SCOPA!', '#e07070'); }
            } else {
                addToTable(c);
                addFadeIn(c.id);
            }
            removeFromEnricoHand(c.id);
            if (!G.pH.length && !G.eH.length) redeal();
            else { G.phase = 'player'; render(); }
        }

        // Mid-round redeal: table stays intact, only new hands are dealt
        function redeal() {
            if (G.deck.length >= 6) {
                const newCards = G.deck.splice(0, 6);
                G.handSlots = {}; G.pH = [];
                addToHand(newCards.slice(0, 3));
                G.eHandSlots = {}; G.eH = [];
                addToEnricoHand(newCards.slice(3, 6));
                // New hand cards fade in
                newCards.forEach(c => {
                    fadeMap.set(c.id, { val: 0 });
                    overlayMap.set(c.id, { val: 0, target: 0 });
                });
                G.phase = 'player';
                scheduleAnim();
                render();
            } else {
                endRound();
            }
        }

        function endRound() {
            // End of round: remaining table cards now go to last capturer
            if (G.table.length) {
                (G.lastCap === 'p' ? G.pP : G.eP).push(...G.table);
                G.table = []; G.tableSlots = {};
            }
            const ps = score(G.pP, G.pSc), es = score(G.eP, G.eSc);
            const pts = cmpScore(ps, es);
            G.totP += pts.p; G.totE += pts.e;
            G.phase = 'end';

            const L = (a, b, n) => `${n}: ${a} vs ${b}  →  ${a > b ? 'Nancy +1' : b > a ? 'Enrico +1' : 'pari'}`;
            showModal(
                `Fine Round ${G.round}`,
                [
                    L(ps.n, es.n, 'Carte'),
                    L(ps.den, es.den, 'Denari'),
                    `Settebello: ${ps.sb ? 'Nancy ✓' : 'Enrico ✓'}`,
                    L(ps.pp, es.pp, 'Primiera'),
                    L(ps.sc, es.sc, 'Scope'),
                    '─────────────────────────',
                    `Nancy ${G.totP}  —  Enrico ${G.totE}`,
                ].join('\n'),
                () => {
                    if (G.round >= 2) {
                        showModal(
                            G.totP > G.totE ? '🏆 Nancy Vince!' : '💀 Enrico Vince!',
                            `Punteggio: Nancy ${G.totP} — Enrico ${G.totE}`,
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
            G.deck = shuffle(mkDeck());
            G.pP = []; G.eP = []; G.pSc = 0; G.eSc = 0; G.lastCap = '';
            G.tableSlots = {}; G.table = [];
            G.handSlots = {}; G.pH = [];
            G.eHandSlots = {}; G.eH = [];
            G.enricoAnim = null;
            addToHand(G.deck.splice(0, 3));
            addToEnricoHand(G.deck.splice(0, 3));
            G.table = G.deck.splice(0, 4);
            G.table.forEach((c, i) => { G.tableSlots[c.id] = i; });
            [...G.pH, ...G.eH, ...G.table].forEach(c => {
                fadeMap.set(c.id, { val: 1 });
                overlayMap.set(c.id, { val: 0, target: 0 });
            });
            G.sel = null; G.tablesel = [];
            // Alternate first turn: round 1 player, round 2 Enrico
            if (G.round === 1) {
                G.phase = 'player';
                render();
            } else {
                G.phase = 'enrico';
                render();
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
    }, [setModal]); // setModal is stable

    // ── Modal OK handler (React side) ──
    const handleModalOk = useCallback(() => {
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
                        Continua
                    </button>
                </div>
            )}
        </div>
    );
}
