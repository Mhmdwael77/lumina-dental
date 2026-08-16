<div align="center">

# 🦷 Lumina Dental

### A premium, one‑page website for a modern luxury dental clinic

Editorial art‑direction · an immersive 3D tooth · a cinematic scroll experience — built as a portfolio‑quality marketing site.

<br/>

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r185-000000?style=for-the-badge&logo=three.js&logoColor=white)
![GSAP](https://img.shields.io/badge/GSAP-3-88CE02?style=for-the-badge&logo=greensock&logoColor=white)

<br/>

![Lumina Dental — Hero](docs/screenshots/hero.png)

</div>

---

## ✨ Overview

**Lumina Dental** is a single‑page, editorial website designed to feel like a high‑end creative agency built it for a luxury dental clinic — not a generic medical template. The centrepiece is a **realistic 3D tooth** rendered in WebGL that reacts to the cursor and choreographs with the scroll, wrapped in a smooth, cinematic page experience.

> ⚠️ **Demo project.** All names, reviews, doctor profile, and imagery are fictional placeholders for presentation purposes — not a real clinic.

---

## 🌟 Features

- 🦷 **Immersive 3D hero** — a real molar (`GLB`) rendered with **React Three Fiber / Three.js**, studio lighting, warm‑enamel material, damped cursor parallax and a gentle idle spin.
- 🎬 **Cinematic scroll** — **GSAP ScrollTrigger** + **Lenis** smooth scrolling drive pinned sections, a scroll‑controlled horizontal gallery, and the tooth’s scroll choreography — all with a single source of scroll truth (no conflicts).
- 🧩 **Interactive sections** — draggable **Before / After** slider (mouse · touch · keyboard), a **testimonials carousel** (next / prev / swipe / keyboard), a scroll‑driven **patient‑journey timeline**, an elegant **FAQ accordion**, and a scroll‑activated **“Why choose us.”**
- 📅 **Booking form** — client‑side validation, accessible error/focus handling, and a success state (front‑end demo, no backend).
- 📱 **Fully responsive** — verified at **375 / 390 / 414px** through desktop with **zero horizontal overflow**.
- ♿ **Accessible** — semantic HTML, one `h1` + ordered headings, labelled controls, visible focus rings, and full `prefers-reduced-motion` support.
- 🔎 **SEO‑ready** — metadata, Open Graph / Twitter cards, and **`Dentist` JSON‑LD** structured data.
- ⚡ **Performance‑minded** — the WebGL render loop **pauses when the hero scrolls off‑screen**, the 3D model is lazy‑loaded, and animations are transform‑based.

---

## 🖼️ A visual walkthrough

The whole page, section by section.

### Hero
![Hero](docs/screenshots/hero.png)

### Brand Statement
![Brand Statement](docs/screenshots/brand-statement.png)

### Trust Statistics
![Trust Statistics](docs/screenshots/trust-statistics.png)

### Treatments — editorial interactive list
![Treatments](docs/screenshots/treatments.png)

### Featured Treatment
![Featured Treatment](docs/screenshots/featured-treatment.png)

### Before / After
![Before / After](docs/screenshots/before-after.png)

### Meet the Doctor
![Doctor](docs/screenshots/doctor.png)

### Why Choose Us — scroll‑activated
![Why Choose Us](docs/screenshots/why-choose-us.png)

### Clinic Experience — scroll‑controlled horizontal gallery
![Clinic Experience](docs/screenshots/clinic-experience.png)

### Testimonials
![Testimonials](docs/screenshots/testimonials.png)

### Patient Journey
![Patient Journey](docs/screenshots/patient-journey.png)

### Booking
![Booking](docs/screenshots/booking.png)

### Contact / Location
![Contact](docs/screenshots/contact.png)

### FAQ
![FAQ](docs/screenshots/faq.png)

### Final CTA
![Final CTA](docs/screenshots/final-cta.png)

### Footer
![Footer](docs/screenshots/footer.png)

### 📱 On mobile

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/mobile-hero.png" width="240" alt="Mobile — Hero"/><br/><sub>Hero</sub></td>
    <td align="center"><img src="docs/screenshots/mobile-treatments.png" width="240" alt="Mobile — Treatments"/><br/><sub>Treatments</sub></td>
    <td align="center"><img src="docs/screenshots/mobile-why.png" width="240" alt="Mobile — Why Us"/><br/><sub>Why Choose Us</sub></td>
    <td align="center"><img src="docs/screenshots/mobile-booking.png" width="240" alt="Mobile — Booking"/><br/><sub>Booking</sub></td>
  </tr>
</table>

---

## 🛠️ Tech Stack

| Area | Technology |
| --- | --- |
| Framework | **Next.js 16** (App Router) · **React 19** |
| Language | **TypeScript 5** |
| Styling | **Tailwind CSS 4** |
| 3D | **Three.js** `r0.185` · **@react-three/fiber 9** · **@react-three/drei 10** |
| Animation | **GSAP 3** (ScrollTrigger) · **Lenis 1** (smooth scroll) · **Framer Motion 13** |
| Icons | **lucide-react** |
| Fonts | Playfair Display (serif) · Inter (sans) — self‑hosted via `next/font` |

---

## 📋 Requirements

Before running the project you need:

| Requirement | Version |
| --- | --- |
| **Node.js** | `>= 18.18` (recommended **20 LTS** or newer) |
| **npm** | `>= 9` (ships with Node — or use `pnpm` / `yarn`) |
| **Browser** | Any modern browser with **WebGL** enabled (for the 3D hero) |
| **OS** | Windows · macOS · Linux |

> All application dependencies are declared in [`package.json`](package.json) and locked in [`package-lock.json`](package-lock.json) — a single `npm install` restores everything.

---

## 🚀 Getting Started

```bash
# 1) Clone
git clone https://github.com/Mhmdwael77/lumina-dental.git
cd lumina-dental

# 2) Install dependencies
npm install

# 3) Run the dev server
npm run dev
```

Then open **[http://localhost:3000](http://localhost:3000)** 🎉

### 📜 Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server on `0.0.0.0:3000` (accessible on your LAN) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run clean:tooth` | Regenerate the cleaned tooth `GLB` from the source mesh |

---

## 📁 Project Structure

```
lumina-dental/
├─ app/
│  ├─ fonts/              # self-hosted variable fonts (Playfair, Inter)
│  ├─ globals.css         # design tokens, base styles, keyframes
│  ├─ layout.tsx          # metadata + JSON-LD + SmoothScroll provider
│  └─ page.tsx            # composes every section
├─ components/
│  ├─ 3d/                 # ToothScene, ToothModel (React Three Fiber)
│  ├─ layout/             # Navbar, Footer
│  ├─ providers/          # SmoothScroll (Lenis + GSAP)
│  ├─ sections/           # every page section (Hero → Final CTA)
│  └─ ui/                 # CountUp, Grain, Portrait
├─ lib/                   # constants, animation config, helpers
├─ public/models/         # tooth.glb (served 3D asset)
├─ scripts/               # tooth-mesh cleanup utility
└─ docs/screenshots/      # images used in this README
```

---

## ♿ Accessibility & ⚡ Performance

- **Reduced motion** — every scroll animation, the tooth’s motion, and the smooth scroller are disabled/simplified when the visitor prefers reduced motion.
- **Keyboard** — the booking form, carousel, before/after slider, FAQ, and all links/buttons are fully keyboard operable with visible focus rings.
- **No layout shift** — animations use `transform` / `opacity` only.
- **3D efficiency** — the model is code‑split (loads only in the browser) and the render loop halts once the hero leaves the viewport.

---

## 📝 Notes

- **Placeholder visuals** — treatment previews, the clinic gallery, the doctor portrait, and the map are art‑directed CSS gradients/SVG. They’re built to be swapped 1:1 for real photography (drop images in and point the data at them).
- **The 3D tooth** lives at `public/models/tooth.glb`; the loader is generic, so any artist‑authored tooth GLB can replace it at the same path.
- **Backend** — the booking form and the `/admin` dashboard talk to a real FastAPI service in [`../backend`](../backend); see the [project‑level README](../README.md) for full‑stack setup. This file only covers the `frontend/` package.

---

<div align="center">

Designed & built as a portfolio piece. · **Demo content — not a real clinic.**

</div>
