# aw-widgets

ART WTR custom widgets for Zoho Creator dashboards.

## What lives here

Self-contained HTML widgets hosted on GitHub Pages, embedded into Zoho Creator pages via External Hosting widget configuration.

## Live URL pattern

`https://artwtr.github.io/aw-widgets/[widget-name].html`

## Widgets

| Widget | File | Purpose |
|---|---|---|
| Ledger Lifecycle | `ledger-lifecycle.html` | 3-column display: Review / Verify / Send with rounded badges |

## Guardrails

Per `AW_WIDGETS_Foundation_Decision.md`:
- Display-only — no writes, no workflow triggers
- Calls Creator JS API only — never external APIs directly
- No secrets in widget code
- Uses logged-in user's Creator session for auth

## Development

Push commits to `main` branch — GitHub Pages auto-deploys within ~30 seconds.

## Maintainer

Token-based push access by Claude (Anthropic) on behalf of Nishant Mittal (ART WTR Beverages).
