# 📋 Requirements — Lumina Dental

Everything you need to install and run this project.

> This is a **Node.js / Next.js** project, so dependencies are declared in
> [`package.json`](package.json) and locked in [`package-lock.json`](package-lock.json).
> There is **no `requirements.txt`** (that is a Python convention). Running
> `npm install` installs every package listed below automatically.

---

## 🖥️ System Requirements

| Requirement | Minimum | Recommended |
| --- | --- | --- |
| **Node.js** | `18.18` | **20 LTS** or newer |
| **npm** | `9` | latest (bundled with Node) — or `pnpm` / `yarn` |
| **Browser** | any modern browser | Chrome / Edge / Firefox / Safari with **WebGL** enabled (for the 3D hero) |
| **Operating System** | — | Windows · macOS · Linux |
| **Disk space** | ~400 MB (after `npm install`) | — |

Check your versions:

```bash
node -v
npm -v
```

---

## 📦 Runtime Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `next` | `16.3.0` | React framework (App Router) |
| `react` | `19.2.8` | UI library |
| `react-dom` | `19.2.8` | React DOM renderer |
| `three` | `^0.185.1` | WebGL 3D engine (the tooth) |
| `@react-three/fiber` | `^9.7.0` | React renderer for Three.js |
| `@react-three/drei` | `^10.7.8` | Helpers for R3F (Environment, ContactShadows, useGLTF…) |
| `gsap` | `^3.15.0` | Animation + ScrollTrigger |
| `lenis` | `^1.3.26` | Smooth scrolling |
| `framer-motion` | `^13.1.0` | Micro-interactions |
| `lucide-react` | `^1.31.0` | Icons |

## 🧰 Dev Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `typescript` | `^5` | Types |
| `tailwindcss` | `^4` | Styling |
| `@tailwindcss/postcss` | `^4` | Tailwind PostCSS plugin |
| `eslint` | `^9` | Linting |
| `eslint-config-next` | `16.3.0` | Next.js ESLint rules |
| `@types/node` | `^20` | Node type definitions |
| `@types/react` | `^19` | React type definitions |
| `@types/react-dom` | `^19` | React DOM type definitions |
| `@types/three` | `^0.185.4` | Three.js type definitions |

---

## 🚀 Install & Run

```bash
# 1) Clone the repository
git clone https://github.com/Mhmdwael77/lumina-dental.git
cd lumina-dental

# 2) Install all dependencies (from package.json)
npm install

# 3) Start the development server
npm run dev
```

Then open **http://localhost:3000**

### Other commands

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # run ESLint
```
