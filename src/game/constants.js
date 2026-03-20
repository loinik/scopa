// ── Spritesheet layout ──
export const CW = 58, CH = 90;
export const SUIT_SY = { '$': 1, 'X': 92, 'C': 183, 'B': 274 };
export const VAL_SX = [1, 60, 119, 178, 237, 296, 355, 414, 473, 532];
export const BACK_SX = 532, BACK_SY = 365;

// ── Table 5×2 slot coords (center-out) ──
export const TSLOTS = [
    { x: 229, y: 104 }, { x: 359, y: 104 }, // initial top row
    { x: 229, y: 196 }, { x: 359, y: 196 }, // initial bot row
    { x: 294, y: 104 }, { x: 294, y: 196 }, // col2 center
    { x: 164, y: 104 }, { x: 164, y: 196 }, // col0 left
    { x: 424, y: 104 }, { x: 424, y: 196 }, // col4 right
];

// ── Character positions ──
export const EH_XS = [212, 294, 376], EH_Y = 4;   // Enrico 3 backs (brown zone)
export const NH_XS = [212, 294, 376], NH_Y = 295;  // Nancy  3 cards (teal zone)

// ── Right UI panel ──
export const SLOT  = { x: 14,  y: 266, w: 104, h: 104 };  // player deck indicator
export const SLOT_1 = { x: 14,  y: 266, w: 104, h: 104 };  // player deck indicator
export const SLOT_2 = { x: 521, y: 14,  w: 104, h: 104 };  // opponent deck indicator
// w/h match the OVL sprite sizes (TAKE=90, DISCARD=119)
export const BTN_T = { x: 538, y: 153, w: 90, h: 34 };
export const BTN_D = { x: 538, y: 197, w: 119, h: 34 };
// OVL source rects for the buttons
export const OVL_TAKE = { sx: 1, sy: 106, sw: 90, sh: 34 };
export const OVL_DISCARD = { sx: 92, sy: 106, sw: 90, sh: 34 };
export const BTN_X = { x: 12, y: 173, r: 16 };
export const BTN_Q = { x: 12, y: 218, r: 16 };

// ── Score badge positions ──
export const EBADGE = { x: 8, y: 8 };
export const NBADGE = { x: 484, y: 316 };
