# Beat Runner 🎵🏃‍♂️

**Beat Runner** is a cross-platform (mobile & laptop) web-based endless rhythm runner game. Players travel along a beat-synchronized musical highway, steer between lanes to collect notes, dodge dissonance barriers, and maintain micro-rhythmic accuracy as shifting musical genres transform the audiovisual world and rhythmic patterns.

---

## 🌟 Features

- **Cross-Platform Responsive Experience**:
  - **Laptop / Desktop**: Wide 3D-perspective highway with keyboard shortcuts (`A/D/Arrows`, `Space/W/Up`, `S/Down`, `1/2/3` direct lane selection).
  - **Mobile / Tablet**: Zero-latency touch controls with 3-column lane tapping, touch swipe steering/jumping, and dedicated on-screen Beat Pulse action.
- **5 Rhythmic Genre Worlds**:
  - **Neon Synthwave** (`116 BPM`, 4/4 Straight): 4-on-the-floor pulse anchors & outrun synth aesthetics.
  - **Midnight Funk** (`104 BPM`, 16th Groove): Syncopation, off-beat "and" pickups, and ghost notes.
  - **Velvet Jazz** (`128 BPM`, Triplet Swing): Swung 8th notes (`67%` swing ratio), walking bass, and ride cymbal pocket.
  - **Tropical Clave** (`112 BPM`, 3-3-2 Polyrhythm): Tresillo clave accents and Afrobeat polyrhythmic patterns.
  - **Cyber Drum & Bass** (`170 BPM`, Breakbeat): High-speed motor timing and amen break syncopation.
- **Procedural Web Audio Engine**:
  - Fully synthesized instruments (drums, bass, leads, note chimes, and dissonance clashes) — 100% self-contained with no external audio file downloads.
  - **Dynamic 4-Stem Layering**: Stems unmute dynamically as you build your Groove combo (`1x` Kick $\rightarrow$ `2x` Percussion $\rightarrow$ `3x` Bassline $\rightarrow$ `4x` Lead Arp / Fever Mode).
- **Musical Skill Training & Diagnostics**:
  - Precision timing judgment: `PERFECT` ($\pm 35\text{ ms}$), `GREAT` ($\pm 70\text{ ms}$), `GOOD` ($\pm 115\text{ ms}$), and `MISS`.
  - **Interactive Latency Calibrator**: Metronome-based 8-tap tool to calibrate Bluetooth headphone or device latency offset.
  - Post-run musical analysis showing overall rank (`S+` to `C`), timing accuracy %, average millisecond offset, and streak consistency.
- **Game Modes**:
  - **Endless Odyssey**: Survive through seamless Genre Shift portals every 32 bars.
  - **Genre Stages**: Select and practice individual genres.
  - **Pulse Dojo**: Ear-training drills and internal clock stability tests.

---

## 🎮 Controls

### Laptop / Desktop
| Action | Key(s) |
| :--- | :--- |
| **Move Left / Right** | `A` / `D` or `◀` / `▶` |
| **Jump (Over Lasers)** | `Space` / `W` / `▲` |
| **Pulse Action** | `S` / `▼` |
| **Direct Lane Select** | `1` (Left), `2` (Center), `3` (Right) |
| **Pause** | `Escape` or `P` |

### Mobile / Tablet
| Action | Gesture |
| :--- | :--- |
| **Steer / Lane Hit** | Tap left, center, or right third of screen |
| **Swipe Steer** | Swipe Left / Right |
| **Jump** | Swipe Up or tap bottom `⚡ BEAT PULSE / JUMP` zone |

---

## 🛠 Tech Stack

- **Engine & Language**: TypeScript, HTML5 Canvas 2D, Web Audio API
- **Tooling & Bundler**: Vite
- **Testing**: Vitest

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
git clone https://github.com/Sebastian220206/beat-runner.git
cd beat-runner
npm install
```

### Development Server
```bash
npm run dev
```

### Run Unit Tests
```bash
npm run test
```

### Production Build
```bash
npm run build
```

---

## 📄 License
MIT
