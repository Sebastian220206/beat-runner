// Beat Runner - Genre Definitions & Audiovisual Themes

export type GenreId = 'synthwave' | 'funk' | 'jazz' | 'clave' | 'dnb';

export interface GenreTheme {
  id: GenreId;
  name: string;
  subtitle: string;
  bpm: number;
  timeSignature: [number, number]; // [beatsPerBar, beatValue] e.g. [4, 4]
  swingRatio: number; // 0.5 = straight, 0.67 = jazz swing
  baseNoteFrequency: number; // Root frequency in Hz (e.g. 146.83 for D3)
  scale: number[]; // Semitone intervals from root (e.g. [0, 3, 5, 7, 10] for minor pentatonic)
  drumStyle: 'linn' | 'funk' | 'jazz' | 'afro' | 'breakbeat';
  colors: {
    primary: string;
    secondary: string;
    glow: string;
    highway: string;
    highwayBorder: string;
    grid: string;
    skyTop: string;
    skyBottom: string;
    fog: string;
    player: string;
    playerGlow: string;
    note: string;
    pulseRing: string;
    barrier: string;
  };
  rhythmPatterns: {
    name: string;
    subdivisions: number[]; // In fractional beats within a bar (0 to 3.75 for 4/4)
    laneDistribution: number[]; // Target lanes (0 = Left, 1 = Center, 2 = Right)
    actionRequired?: ('move' | 'pulse' | 'jump')[];
  }[];
  description: string;
  skillFocus: string;
}

export const GENRES: Record<GenreId, GenreTheme> = {
  synthwave: {
    id: 'synthwave',
    name: 'Neon Synthwave',
    subtitle: 'Straight 4/4 Drive & Outrun Pulse',
    bpm: 116,
    timeSignature: [4, 4],
    swingRatio: 0.5, // Straight 8th notes
    baseNoteFrequency: 146.83, // D3
    scale: [0, 3, 5, 7, 10, 12, 15, 17], // D Minor Pentatonic / Aeolian
    drumStyle: 'linn',
    colors: {
      primary: '#ff007f', // Neon Magenta
      secondary: '#00f3ff', // Cyan
      glow: '#ff00b7',
      highway: '#120b24',
      highwayBorder: '#ff007f',
      grid: '#00e5ff33',
      skyTop: '#080117',
      skyBottom: '#2d083d',
      fog: '#150628',
      player: '#00ffff',
      playerGlow: '#00ffffaa',
      note: '#ffeb3b',
      pulseRing: '#ff007f',
      barrier: '#ff1744',
    },
    rhythmPatterns: [
      {
        name: 'Four-on-the-Floor Pulse',
        subdivisions: [0, 1, 2, 3],
        laneDistribution: [1, 1, 1, 1],
      },
      {
        name: 'Eighth-Note Arp Run',
        subdivisions: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
        laneDistribution: [0, 1, 2, 1, 0, 1, 2, 1],
      },
      {
        name: 'Backbeat Jump & Weave',
        subdivisions: [0, 1, 2, 3],
        laneDistribution: [0, 1, 2, 1],
        actionRequired: ['move', 'pulse', 'move', 'jump'],
      },
    ],
    description: 'Steady driving pulse with straight eighth-note subdivisions. Build internal clock stability with 4-on-the-floor kick anchors.',
    skillFocus: 'Pulse consistency, straight subdivision accuracy, and backbeat snare timing.',
  },

  funk: {
    id: 'funk',
    name: 'Midnight Funk',
    subtitle: '16th-Note Syncopation & Off-Beat Pocket',
    bpm: 104,
    timeSignature: [4, 4],
    swingRatio: 0.52, // Slight humanized funk pocket
    baseNoteFrequency: 130.81, // C3
    scale: [0, 3, 5, 6, 7, 10, 12, 15], // C Blues / Dorian
    drumStyle: 'funk',
    colors: {
      primary: '#ffaa00', // Electric Gold
      secondary: '#8a2be2', // Royal Purple
      glow: '#ffa500',
      highway: '#140c1e',
      highwayBorder: '#ffaa00',
      grid: '#ffd70022',
      skyTop: '#070312',
      skyBottom: '#28113b',
      fog: '#160a24',
      player: '#ffcc00',
      playerGlow: '#ffaa00aa',
      note: '#00ffc4',
      pulseRing: '#ff7700',
      barrier: '#e6005c',
    },
    rhythmPatterns: [
      {
        name: 'Syncopated "And" Pickups',
        subdivisions: [0.5, 1.5, 2.5, 3.5],
        laneDistribution: [0, 2, 0, 2],
      },
      {
        name: '16th Funky Weave',
        subdivisions: [0, 0.75, 1.5, 2, 2.75, 3.5],
        laneDistribution: [1, 2, 0, 1, 0, 2],
      },
      {
        name: 'Ghost-Note Pulse Weave',
        subdivisions: [0, 1.25, 2, 2.75],
        laneDistribution: [1, 1, 1, 1],
        actionRequired: ['pulse', 'pulse', 'jump', 'pulse'],
      },
    ],
    description: 'Bouncy syncopated grooves focusing on the upbeat "and" and 16th-note ghost hits. Learn to feel the space between downbeats.',
    skillFocus: 'Syncopation detection, off-beat rhythmic precision, and backbeat micro-timing.',
  },

  jazz: {
    id: 'jazz',
    name: 'Velvet Jazz',
    subtitle: 'Triplet Swing & Walking Bass Pocket',
    bpm: 128,
    timeSignature: [4, 4],
    swingRatio: 0.67, // True triplet swing: beat + 0.667 for offbeats
    baseNoteFrequency: 174.61, // F3
    scale: [0, 2, 4, 5, 7, 9, 10, 11, 12], // F Bebop Dominant
    drumStyle: 'jazz',
    colors: {
      primary: '#4da6ff', // Midnight Blue Brass
      secondary: '#d4af37', // Antique Gold
      glow: '#66b3ff',
      highway: '#0a1020',
      highwayBorder: '#d4af37',
      grid: '#4da6ff26',
      skyTop: '#030814',
      skyBottom: '#102244',
      fog: '#0a152e',
      player: '#f5d77f',
      playerGlow: '#d4af37aa',
      note: '#ffffff',
      pulseRing: '#4da6ff',
      barrier: '#ff5252',
    },
    rhythmPatterns: [
      {
        name: 'Swung Ride Cymbal Motif',
        subdivisions: [0, 0.67, 1, 1.67, 2, 2.67, 3, 3.67],
        laneDistribution: [1, 2, 1, 2, 1, 2, 1, 2],
      },
      {
        name: 'Walking Bass Steps',
        subdivisions: [0, 1, 2, 3],
        laneDistribution: [0, 1, 2, 1],
      },
      {
        name: 'Triplet Accent Stabs',
        subdivisions: [0, 1.67, 2, 3.33],
        laneDistribution: [1, 2, 0, 1],
        actionRequired: ['pulse', 'move', 'pulse', 'jump'],
      },
    ],
    description: 'Swung eighth-note feel with walking bass lines and ride cymbal accents. Train your ear for long-short triplet subdivision timing.',
    skillFocus: 'Swing ratio recognition, triplet timing control, and walking bass navigation.',
  },

  clave: {
    id: 'clave',
    name: 'Tropical Clave',
    subtitle: '3-3-2 Polyrhythm & Afrobeat Syncopation',
    bpm: 112,
    timeSignature: [4, 4],
    swingRatio: 0.5,
    baseNoteFrequency: 164.81, // E3
    scale: [0, 2, 4, 7, 9, 12, 14], // E Major Pentatonic
    drumStyle: 'afro',
    colors: {
      primary: '#00e676', // Vibrant Emerald
      secondary: '#ff5722', // Sunset Coral
      glow: '#00ff88',
      highway: '#081c15',
      highwayBorder: '#00e676',
      grid: '#00e67622',
      skyTop: '#02120d',
      skyBottom: '#0d3829',
      fog: '#082119',
      player: '#ff9800',
      playerGlow: '#ff9800aa',
      note: '#ffeb3b',
      pulseRing: '#00e676',
      barrier: '#f44336',
    },
    rhythmPatterns: [
      {
        name: 'Tresillo 3-3-2 Clave',
        subdivisions: [0, 1.5, 3], // 3 + 3 + 2 sixteenth/eighth grouping in 4/4
        laneDistribution: [0, 1, 2],
      },
      {
        name: 'Son Clave Response',
        subdivisions: [0, 1.5, 3, 4 + 1, 4 + 2], // 2-bar son clave pattern
        laneDistribution: [0, 2, 1, 0, 2],
      },
      {
        name: 'Polyrhythmic Lane Weave',
        subdivisions: [0, 0.75, 1.5, 2.25, 3],
        laneDistribution: [0, 1, 2, 1, 0],
        actionRequired: ['move', 'pulse', 'move', 'pulse', 'jump'],
      },
    ],
    description: 'Driven by the classic 3-3-2 Tresillo pattern and Afrobeat percussive accents. Master cross-rhythms and syncopated counterpoint.',
    skillFocus: 'Polyrhythmic grouping, 3-against-2 pulse feeling, and asymmetric metric accents.',
  },

  dnb: {
    id: 'dnb',
    name: 'Cyber Drum & Bass',
    subtitle: '170 BPM High-Speed Breakbeat & Reese Bass',
    bpm: 170,
    timeSignature: [4, 4],
    swingRatio: 0.5,
    baseNoteFrequency: 110.0, // A2 (deep sub-bass)
    scale: [0, 1, 5, 7, 8, 12, 13], // A Phrygian Dark Bass Scale
    drumStyle: 'breakbeat',
    colors: {
      primary: '#39ff14', // Acid Green
      secondary: '#ff0033', // Crimson Glitch
      glow: '#39ff14',
      highway: '#0a0a0f',
      highwayBorder: '#39ff14',
      grid: '#39ff1422',
      skyTop: '#020205',
      skyBottom: '#14050b',
      fog: '#0c0205',
      player: '#00f0ff',
      playerGlow: '#00f0ffaa',
      note: '#ffff00',
      pulseRing: '#39ff14',
      barrier: '#ff0055',
    },
    rhythmPatterns: [
      {
        name: 'Amen Breakbeat Signature',
        subdivisions: [0, 1.75, 2.5, 3.25], // Kick on 1, snare syncopation on 2& / 3.25
        laneDistribution: [1, 2, 0, 1],
      },
      {
        name: 'Fast Lane Warp Stream',
        subdivisions: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
        laneDistribution: [0, 1, 2, 2, 1, 0, 1, 2],
      },
      {
        name: 'Half-Time Bass Drop Wave',
        subdivisions: [0, 2],
        laneDistribution: [1, 1],
        actionRequired: ['jump', 'jump'],
      },
    ],
    description: 'High-velocity breakbeats at 170 BPM. Rapid reactions test fast-twitch rhythmic reflexes and syncopated snare catching.',
    skillFocus: 'High-speed motor timing, breakbeat syncopation, and half-time/double-time transitions.',
  },
};

export const GENRE_ORDER: GenreId[] = ['synthwave', 'funk', 'jazz', 'clave', 'dnb'];
