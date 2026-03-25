# RGB Grid Effect — Heavy Pixel Cyberpunk UI Redesign Plan

_Date: 2026-03-25_

## Goal

Rebuild the game's visual identity toward a **heavy pixel-art cyberpunk arcade** style inspired by the provided reference image, while **strictly preserving gameplay logic**.

## Hard Scope Boundary

Allowed:
- HTML structure for UI-only wrappers
- CSS, fonts, palettes, overlays, decorative layers
- Canvas rendering visuals only
- DOM-only status / HUD / countdown / judgement / combo presentation
- Purely visual particle / glitch / bloom / CRT effects

Not allowed:
- Note timing
- Hit windows / judgement math
- Score/combo rules
- Chart generation / policy
- Input mapping and gameplay controls
- Playback sync / orchestrator logic
- Backend APIs or analysis pipeline

## Art Direction

### Target vibe
- Heavy pixel arcade
- Dirty cyberpunk signage
- CRT scanline / phosphor / bloom
- Glitch smears and horizontal streaks
- Thick judgement banners
- Loud but readable combo celebration
- Industrial, not clean glassmorphism

### Visual pillars
1. **Chunky pixel display type** for critical play feedback
2. **Neon edge glow** with cyan / magenta / amber separation
3. **Screen grime**: scanlines, noise, worn panel texture
4. **Arcade plate composition**: segmented modules instead of web panels
5. **High-impact judgement states** with layered burst + smear + outline
6. **Readable playfield first** — effects must not obscure notes

## Palette

### Base
- Void black: `#04050a`
- Blue-black steel: `#0b1020`
- Panel black: `rgba(8, 10, 18, 0.88)`
- Dust white: `#d9ecff`

### Primary accents
- Ice cyan: `#5af6ff`
- Hot magenta: `#ff4fae`
- Toxic violet: `#9c6bff`
- Warning amber: `#ffc94d`
- Error red: `#ff5a6b`

### Semantic mapping
- Perfect → cyan / white / bloom
- Good → magenta-violet blend
- Miss → red with broken scanline smear
- Combo → cyan + magenta dual-tone banner
- Countdown → oversized pixel digits with horizontal trail

## Typography

### Display / arcade
- Press Start 2P for critical labels, countdown, judgement, combo landmarks

### Utility / system
- Rajdhani for setup controls and secondary readouts

## Delivery Plan

### Commit 1 — UI foundation
- Replace clean HUD/panel styling with heavier arcade panel language
- Add CRT/noise/glow overlays
- Redesign setup screen shell, action buttons, status bar, pause shell
- Improve background world layer to feel more industrial and pixel-cyber

### Commit 2 — Feedback layer
- Rebuild judgement presentation as banner-like pixel feedback
- Upgrade combo celebration system
- Redesign countdown / START presentation
- Add hit-flash and UI-only streak effects

### Commit 3 — Playfield skin
- Redraw note presentation style without touching note mechanics
- Upgrade approach circles / rings / hit bursts
- Add stronger playfield framing and focus lighting

### Commit 4 — Polish
- Unify loading / ready / paused / system states
- Balance effect intensity for readability
- Final consistency pass on color, motion, overlays, and layering

## Guardrails

### Readability rules
- Notes remain visually dominant over VFX
- Background contrast stays lower than active targets
- Judgement banners must decay quickly enough not to cover upcoming notes
- Combo celebration intensity scales with combo milestones, not every single hit

### Logic safety rules
- Do not alter timing constants
- Do not alter score formulas
- Do not alter state-machine transitions
- Do not alter note spawn conditions or chart data
- Restrict `game.js` edits to render-path / DOM presentation code only

## File Targets

Primary:
- `index.html`
- `rgb-effect.js`
- `game.js` (presentation only)

Optional additions:
- UI helper CSS blocks within `index.html`
- Decorative asset snippets / SVGs if needed

## Success Criteria

- The game feels immediately more like a **heavy pixel cyberpunk arcade cabinet**
- Feedback has more **juice** without hurting readability
- The UI no longer reads like a generic neon web app
- Gameplay behavior remains unchanged
