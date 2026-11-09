# Design System Proposal

## Implemented Phase 2 Foundation

The current base tokens in `css/main.css` are:

| Token | Current value | Role |
| --- | --- | --- |
| `--brand-gold` | `#9e7921` | Most frequent sampled gold pixels in the logo |
| `--gold` | `#d1b166` | Lighter accessible emphasis/focus color |
| `--brand-green` | `#0d4923` | Most frequent sampled green pixels in the logo |
| `--brand-green-strong` | `#1b5630` | Secondary green |
| `--page` | `#242624` | Main gray background |
| `--panel` | `#303230` | Section surface |
| `--card` | `#3a3c3a` | Raised gray surface |
| `--card-2` | `#252725` | Deep charcoal surface |
| `--muted` | `#c0c3bf` | Secondary copy |
| `--line` | `#484b48` | Borders/dividers |

`css/modern-system.css` is loaded after the base and page styles on active pages. Phase 2 consolidated shared tokens and interaction states there. The system font stack remains the baseline; no external font dependency was added.

## Proposed Direction

- Use gray for the main surfaces, gold for primary emphasis, black/charcoal for depth, and LSL green for secondary buttons and selected states.
- Logo color sampling found frequent opaque values `#9E7921` (gold) and `#0D4923` (green). `--gold: #D1B166` is a lighter text/focus accent so small UI text retains contrast.
- Preserve distinct team/championship colors where they identify real league teams or winning seasons; they are not general interface colors.
- Define semantic tokens for text, surface levels, border, focus, success, warning, error, and selected/disabled states. Green uses `#0D4923` / `#1B5630`; selected controls use green while primary actions remain gold.
- Establish a compact radius scale and apply it consistently to tables, buttons, fields, cards, and dialogs.
- Preserve Inter-Madrasah page colors as an explicit exception. Site-wide overrides are scoped to `body:not(.imt-blue-page)`.
- Keep the current system font stack as baseline. A new typeface should be selected only after checking license, performance, offline behavior, and whether it can be locally bundled.
- Provide accessible focus rings, reduced-motion support, adequate contrast, and responsive touch targets.
- Prefer restrained transitions for state changes and progressive entrance animation; do not animate large areas continuously when it affects scroll/performance.

## Phase 2 Foundation Notes

- Shared controls have consistent focus, disabled, selected, hover, and invalid-field treatment, with IMST excluded from shared dark-theme selectors.
- Numeric displays use tabular lining numerals, shared transitions use duration/easing tokens, and reduced-motion overrides remain active.
- Existing page-specific styles remain authoritative where more specific; resolving every legacy conflict belongs to the page redesign phases.
- Detailed page transitions, modal semantics, and bracket geometry still require their later page-specific verification.
