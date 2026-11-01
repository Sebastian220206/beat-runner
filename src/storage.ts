// Beat Runner - LocalStorage Persistent Settings & High Scores

export interface GenreRecord {
  highScore: number;
  maxCombo: number;
  bestAccuracy: number;
  runsCount: number;
}

export interface UserSettings {
  audioOffsetMs: number; // Calibration latency offset in ms
  musicVolume: number;
  sfxVolume: number;
  vibrationEnabled: boolean;
  showTimingDiagnostics: boolean;
}

export interface GameStats {
  totalRuns: number;
  totalNotesHit: number;
  totalPerfects: number;
  totalGreats: number;
  totalGoods: number;
  totalMisses: number;
}

const SETTINGS_KEY = 'beat_runner_settings';
const RECORDS_KEY = 'beat_runner_records';
const STATS_KEY = 'beat_runner_stats';

const DEFAULT_SETTINGS: UserSettings = {
  audioOffsetMs: 0,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  vibrationEnabled: true,
  showTimingDiagnostics: true,
};

const DEFAULT_STATS: GameStats = {
  totalRuns: 0,
  totalNotesHit: 0,
  totalPerfects: 0,
  totalGreats: 0,
  totalGoods: 0,
  totalMisses: 0,
};

export class StorageManager {
  private settings: UserSettings;
  private records: Record<string, GenreRecord>;
  private stats: GameStats;

  constructor() {
    this.settings = this.loadSettings();
    this.records = this.loadRecords();
    this.stats = this.loadStats();
  }

  private loadSettings(): UserSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Could not read settings from localStorage', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  public saveSettings(newSettings: Partial<UserSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage', e);
    }
  }

  public getSettings(): UserSettings {
    return { ...this.settings };
  }

  private loadRecords(): Record<string, GenreRecord> {
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Could not read records from localStorage', e);
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
      }
    );
  }

  public recordRun(
    genreOrMode: string,
    score: number,
    combo: number,
    accuracy: number
  ): { isNewHighScore: boolean; isNewBestAccuracy: boolean } {
    const existing = this.getRecord(genreOrMode);
    const isNewHighScore = score > existing.highScore;
    const isNewBestAccuracy = accuracy > existing.bestAccuracy;

    this.records[genreOrMode] = {
      highScore: Math.max(existing.highScore, score),
      maxCombo: Math.max(existing.maxCombo, combo),
      bestAccuracy: Math.max(existing.bestAccuracy, accuracy),
      runsCount: existing.runsCount + 1,
    };

    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records));
    } catch (e) {
      console.warn('Could not save records to localStorage', e);
    }

    return { isNewHighScore, isNewBestAccuracy };
  }

  private loadStats(): GameStats {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        return { ...DEFAULT_STATS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Could not read stats from localStorage', e);
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

    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
    } catch (e) {
      console.warn('Could not save stats to localStorage', e);
    }
  }

  public getStats(): GameStats {
    return { ...this.stats };
  }
}

export const storage = new StorageManager();
