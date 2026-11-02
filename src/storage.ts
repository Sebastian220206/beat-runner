// Beat Runner - LocalStorage Persistent Settings, Musical Notes, Magical Instruments & Hovercraft Garage

export type InstrumentId = 'piano' | 'synth' | 'guitar' | 'marimba' | 'flute' | 'bells';

export interface MagicalInstrument {
  id: InstrumentId;
  name: string;
  subtitle: string;
  description: string;
  color: string;
}

export const AVAILABLE_INSTRUMENTS: MagicalInstrument[] = [
  {
    id: 'piano',
    name: 'Grand Piano',
    subtitle: 'Acoustic Harmonic Keys',
    description: 'Warm concert grand piano resonance with crisp hammer harmonics.',
    color: '#00f3ff',
  },
  {
    id: 'synth',
    name: 'Neon Synthesizer',
    subtitle: 'Analog Sawtooth Lead',
    description: 'Vibrant polyphonic analog synth lead with sweeping filter envelope.',
    color: '#ff2a85',
  },
  {
    id: 'guitar',
    name: 'Electric Guitar',
    subtitle: 'Plucked Harmonic Strings',
    description: 'Expressive plucked string resonance that cuts through the railway beat.',
    color: '#f59e0b',
  },
  {
    id: 'marimba',
    name: 'Resonant Marimba',
    subtitle: 'Warm Wooden Mallets',
    description: 'Percussive rosewood bars tuned with rich 4th-harmonic overtones.',
    color: '#22c55e',
  },
  {
    id: 'flute',
    name: 'Crystal Flute',
    subtitle: 'Airy Vibrato Wind',
    description: 'Silky, breathy wind melody with expressive shimmer vibrato.',
    color: '#38bdf8',
  },
  {
    id: 'bells',
    name: 'Starlight Bells',
    subtitle: 'FM Chime Glockenspiel',
    description: 'Bright metallic chime harmonics that ring across the silent city.',
    color: '#c084fc',
  },
];

export interface GenreRecord {
  highScore: number;
  maxCombo: number;
  bestAccuracy: number;
  runsCount: number;
  bestRank?: 'S+' | 'S' | 'A' | 'B' | 'C';
}

export interface UserSettings {
  audioOffsetMs: number; // Calibration latency offset in ms
  musicVolume: number;
  sfxVolume: number;
  vibrationEnabled: boolean;
  showTimingDiagnostics: boolean;
  equippedInstrument: InstrumentId;
}

export interface GameStats {
  totalRuns: number;
  totalNotesHit: number;
  totalPerfects: number;
  totalGreats: number;
  totalGoods: number;
  totalMisses: number;
  totalCoinsEarned: number;
}

export interface HovercraftSkin {
  id: string;
  name: string;
  description: string;
  cost: number;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  trailColor: string;
}

export const AVAILABLE_SKINS: HovercraftSkin[] = [
  {
    id: 'interceptor',
    name: 'Outrun Interceptor',
    description: 'Beat’s signature neon cyan soundboard with magenta bass thrusters.',
    cost: 0,
    primaryColor: '#00f3ff',
    secondaryColor: '#ff007f',
    glowColor: '#00ffffaa',
    trailColor: '#00f3ff',
  },
  {
    id: 'funk_cruiser',
    name: 'Gold Funk Cruiser',
    description: 'Gold-plated 16th-groove glider with electric violet shock absorb.',
    cost: 250,
    primaryColor: '#ffd700',
    secondaryColor: '#8a2be2',
    glowColor: '#ffaa00aa',
    trailColor: '#fbbf24',
  },
  {
    id: 'blue_phantom',
    name: 'Blue Note Phantom',
    description: 'Swung midnight brass board tuned for silky-smooth triplet cornering.',
    cost: 500,
    primaryColor: '#60a5fa',
    secondaryColor: '#f5d77f',
    glowColor: '#3b82f6aa',
    trailColor: '#93c5fd',
  },
  {
    id: 'emerald_viper',
    name: 'Emerald Viper',
    description: 'Bioluminescent polyrhythmic soundboard from the tropical clave biome.',
    cost: 800,
    primaryColor: '#00e676',
    secondaryColor: '#ff5722',
    glowColor: '#00ff88aa',
    trailColor: '#34d399',
  },
  {
    id: 'cyber_wing',
    name: 'Cyber Glitch Wing',
    description: 'High-velocity 170 BPM breakbeat board that leaves Officer Tempo in the dust.',
    cost: 1200,
    primaryColor: '#39ff14',
    secondaryColor: '#ff0055',
    glowColor: '#39ff14aa',
    trailColor: '#f43f5e',
  },
];

const SETTINGS_KEY = 'beat_runner_settings';
const RECORDS_KEY = 'beat_runner_records';
const STATS_KEY = 'beat_runner_stats';
const COINS_KEY = 'beat_runner_coins';
const GARAGE_KEY = 'beat_runner_garage';

const DEFAULT_SETTINGS: UserSettings = {
  audioOffsetMs: 0,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  vibrationEnabled: true,
  showTimingDiagnostics: true,
  equippedInstrument: 'piano',
};

const DEFAULT_STATS: GameStats = {
  totalRuns: 0,
  totalNotesHit: 0,
  totalPerfects: 0,
  totalGreats: 0,
  totalGoods: 0,
  totalMisses: 0,
  totalCoinsEarned: 0,
};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback
  }
  return null;
}

function safeSetItem(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch {
    // fallback
  }
}

export class StorageManager {
  private settings: UserSettings;
  private records: Record<string, GenreRecord>;
  private stats: GameStats;
  private coins = 0;
  private equippedSkinId = 'interceptor';
  private unlockedSkinIds: string[] = ['interceptor'];

  constructor() {
    this.settings = this.loadSettings();
    this.records = this.loadRecords();
    this.stats = this.loadStats();
    this.loadEconomyAndGarage();
  }

  private loadSettings(): UserSettings {
    const raw = safeGetItem(SETTINGS_KEY);
    if (raw) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch {
        // fallback
      }
    }
    return { ...DEFAULT_SETTINGS };
  }

  public saveSettings(newSettings: Partial<UserSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    safeSetItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  public getSettings(): UserSettings {
    return { ...this.settings };
  }

  public getEquippedInstrument(): MagicalInstrument {
    const inst = AVAILABLE_INSTRUMENTS.find((i) => i.id === this.settings.equippedInstrument);
    return inst || AVAILABLE_INSTRUMENTS[0];
  }

  public equipInstrument(instrumentId: InstrumentId): void {
    this.saveSettings({ equippedInstrument: instrumentId });
  }

  private loadRecords(): Record<string, GenreRecord> {
    const raw = safeGetItem(RECORDS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return {};
  }

  public getRecord(genreOrMode: string): GenreRecord {
    return (
      this.records[genreOrMode] || {
        highScore: 0,
        maxCombo: 0,
        bestAccuracy: 0,
        runsCount: 0,
        bestRank: undefined,
      }
    );
  }

  public recordRun(
    genreOrMode: string,
    score: number,
    combo: number,
    accuracy: number,
    rank?: 'S+' | 'S' | 'A' | 'B' | 'C'
  ): { isNewHighScore: boolean; isNewBestAccuracy: boolean } {
    const existing = this.getRecord(genreOrMode);
    const isNewHighScore = score > existing.highScore;
    const isNewBestAccuracy = accuracy > existing.bestAccuracy;

    this.records[genreOrMode] = {
      highScore: Math.max(existing.highScore, score),
      maxCombo: Math.max(existing.maxCombo, combo),
      bestAccuracy: Math.max(existing.bestAccuracy, accuracy),
      runsCount: existing.runsCount + 1,
      bestRank: rank || existing.bestRank,
    };

    safeSetItem(RECORDS_KEY, JSON.stringify(this.records));
    return { isNewHighScore, isNewBestAccuracy };
  }

  private loadStats(): GameStats {
    const raw = safeGetItem(STATS_KEY);
    if (raw) {
      try {
        return { ...DEFAULT_STATS, ...JSON.parse(raw) };
      } catch {
        // fallback
      }
    }
    return { ...DEFAULT_STATS };
  }

  public incrementStats(statsDelta: Partial<GameStats>): void {
    this.stats.totalRuns += statsDelta.totalRuns || 0;
    this.stats.totalNotesHit += statsDelta.totalNotesHit || 0;
    this.stats.totalPerfects += statsDelta.totalPerfects || 0;
    this.stats.totalGreats += statsDelta.totalGreats || 0;
    this.stats.totalGoods += statsDelta.totalGoods || 0;
    this.stats.totalMisses += statsDelta.totalMisses || 0;
    this.stats.totalCoinsEarned += statsDelta.totalCoinsEarned || 0;

    safeSetItem(STATS_KEY, JSON.stringify(this.stats));
  }

  public getStats(): GameStats {
    return { ...this.stats };
  }

  // --- Musical Notes Currency & Garage Economy ---

  private loadEconomyAndGarage(): void {
    const storedCoins = safeGetItem(COINS_KEY);
    if (storedCoins !== null) {
      this.coins = Math.max(0, parseInt(storedCoins, 10) || 0);
    } else {
      this.coins = 50; // Starter notes gift
    }

    const storedGarage = safeGetItem(GARAGE_KEY);
    if (storedGarage) {
      try {
        const parsed = JSON.parse(storedGarage);
        if (parsed.equippedSkinId) this.equippedSkinId = parsed.equippedSkinId;
        if (Array.isArray(parsed.unlockedSkinIds)) {
          this.unlockedSkinIds = Array.from(new Set(['interceptor', ...parsed.unlockedSkinIds]));
        }
      } catch {
        // fallback
      }
    }
  }

  private saveGarage(): void {
    safeSetItem(
      GARAGE_KEY,
      JSON.stringify({
        equippedSkinId: this.equippedSkinId,
        unlockedSkinIds: this.unlockedSkinIds,
      })
    );
  }

  public getCoins(): number {
    return this.coins;
  }

  public addCoins(amount: number): number {
    if (amount <= 0) return this.coins;
    this.coins += amount;
    this.incrementStats({ totalCoinsEarned: amount });
    safeSetItem(COINS_KEY, this.coins.toString());
    return this.coins;
  }

  public spendCoins(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.coins < amount) return false;
    this.coins -= amount;
    safeSetItem(COINS_KEY, this.coins.toString());
    return true;
  }

  public getEquippedSkin(): HovercraftSkin {
    const skin = AVAILABLE_SKINS.find((s) => s.id === this.equippedSkinId);
    return skin || AVAILABLE_SKINS[0];
  }

  public getUnlockedSkinIds(): string[] {
    return [...this.unlockedSkinIds];
  }

  public isSkinUnlocked(skinId: string): boolean {
    return this.unlockedSkinIds.includes(skinId);
  }

  public equipSkin(skinId: string): boolean {
    if (!this.isSkinUnlocked(skinId)) return false;
    this.equippedSkinId = skinId;
    this.saveGarage();
    return true;
  }

  public unlockSkin(skinId: string): boolean {
    const skin = AVAILABLE_SKINS.find((s) => s.id === skinId);
    if (!skin) return false;
    if (this.isSkinUnlocked(skinId)) return true;
    if (this.spendCoins(skin.cost)) {
      this.unlockedSkinIds.push(skinId);
      this.equippedSkinId = skinId;
      this.saveGarage();
      return true;
    }
    return false;
  }
}

export const storage = new StorageManager();
