# Design System

## Base

- **1rem = 18px**
- **Body font:** Atkinson Hyperlegible

---

## Icons

- **Library:** Heroicons (`heroicons.com`)
- **Variants:** Outline (default), Solid (emphasis)
- **Size:** 24px (1.333rem)
- **Stroke width:** 1.5px (outline variant default)
- **Color:** Inherits from mode text token (`#222222` light, `#D3D3D3` dark)

---

## Modes

### High-contrast light mode (`light-mode`)

> Optimised for low-vision users — AAA contrast throughout.

| Token | Value |
|---|---|
| Background | `#FAFAFA` |
| Text | `#222222` |
| Link | `#004CA3` |
| Link hover | `#02254F` |
| Link underline | 1px → 2px on hover |
| Button background | `#004CA3` |
| Button text | `#FFFFFF` |
| Button background hover | `#02254F` |
| Button text hover | `#FFFFFF` |

> Links are inline text elements; buttons are filled interactive controls with padding and shape.

---

### Low-contrast dark mode (`dark-mode`)

> Optimised for Autistic / ADHD users.

| Token | Value |
|---|---|
| Background | `#0D1228` |
| Text | `#D3D3D3` |
| Link | `#C98C00` |
| Link hover | `#FFD982` |
| Link underline | 1px → 2px on hover |
| Button background | `#C98C00` |
| Button text | `#0D1228` |
| Button background hover | `#A67200` |
| Button text hover | `#141A34` |

> Links are inline text elements; buttons are filled interactive controls with padding and shape.

---

### Dyslexic mode (`dyslexic-mode`)

> Font and layout adjustments for readability across dyslexia variants.

| Token | Value |
|---|---|
| Font | Comic Sans MS |
| Font size | ×1.2 multiplier |
| Line height | ×1.2 multiplier |
| Text box max-width | 600px–900px, scaled to balance with heading sizes |
| Word spacing | unset |
| Letter spacing | 1px |
