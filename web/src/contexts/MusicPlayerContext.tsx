import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useInstance } from "@/contexts/InstanceContext";
import {
  type InstanceMusicMode,
  type InstanceMusicTrack,
  isPlayableTrack,
  normalizeMusicVolume,
  parseInstanceSiteConfig,
  resolveMusicConfig,
} from "@/lib/instance-content";

const PREFS_KEY = "memos-music-player";

/** What a visitor chose in the top bar, kept per browser. */
interface MusicPrefs {
  mode?: InstanceMusicMode;
  muted?: boolean;
  volume?: number;
  trackId?: string;
  playlistKey?: string;
  /** The visitor switched the music off; nothing starts by itself until they press play again. */
  off?: boolean;
}

const readPrefs = (): MusicPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : undefined;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as MusicPrefs) : {};
  } catch {
    return {};
  }
};

const writePrefs = (prefs: MusicPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Playback still works without storage.
  }
};

interface MusicPlayerContextValue {
  /** The admin switched music on and listed at least one track. */
  available: boolean;
  tracks: InstanceMusicTrack[];
  current?: InstanceMusicTrack;
  /** Index of the current track in `tracks`. */
  index: number;
  playing: boolean;
  muted: boolean;
  volume: number;
  mode: InstanceMusicMode;
  currentTime: number;
  duration: number;
  toggle: () => void;
  playAt: (trackIndex: number) => void;
  next: () => void;
  previous: () => void;
  seek: (ratio: number) => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  setMode: (mode: InstanceMusicMode) => void;
  /** Stop and keep the music off for this visitor. */
  turnOff: () => void;
  /** Forget this visitor's choices, back to the admin's settings. */
  resetPrefs: () => void;
  /** Loudness of the low end right now, 0 to 1; 0 when it cannot be measured. Effects pulse to it. */
  getEnergy: () => number;
  /** Fills `out` with the loudness of `out.length` bands, low to high, 0 to 1; false when it cannot be measured. */
  getSpectrum: (out: Float32Array) => boolean;
}

const noop = () => {};

// Without a provider (tests, isolated renders) there is simply nothing to play.
const EMPTY_PLAYER: MusicPlayerContextValue = {
  available: false,
  tracks: [],
  index: 0,
  playing: false,
  muted: true,
  volume: 0.3,
  mode: "random",
  currentTime: 0,
  duration: 0,
  toggle: noop,
  playAt: noop,
  next: noop,
  previous: noop,
  seek: noop,
  toggleMute: noop,
  setVolume: noop,
  setMode: noop,
  turnOff: noop,
  resetPrefs: noop,
  getEnergy: () => 0,
  getSpectrum: () => false,
};

const MusicPlayerContext = createContext<MusicPlayerContextValue>(EMPTY_PLAYER);
type MusicEffectsValue = Pick<MusicPlayerContextValue, "playing" | "muted" | "volume" | "getEnergy" | "getSpectrum" | "resetPrefs"> & {
  getPlaybackProgress: () => number;
};
// Animation consumers do not need React updates for every playback-clock tick.
const MusicEffectsContext = createContext<MusicEffectsValue>({
  playing: false,
  muted: true,
  volume: 0.3,
  getEnergy: EMPTY_PLAYER.getEnergy,
  getSpectrum: EMPTY_PLAYER.getSpectrum,
  resetPrefs: noop,
  getPlaybackProgress: () => 0,
});

const shuffle = (values: number[]) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

/** The play order for a mode; a random order starts with `first` when given, so changing mode never jumps away. */
const buildQueue = (count: number, mode: InstanceMusicMode, first?: number): number[] => {
  const indexes = Array.from({ length: count }, (_, index) => index);
  if (mode === "sequential") return indexes;
  if (mode === "reverse") return indexes.reverse();
  const shuffled = shuffle(indexes);
  if (first === undefined) return shuffled;
  return [first, ...shuffled.filter((index) => index !== first)];
};

/** Logarithmic 60 Hz–8 kHz bands, weighted by bin overlap so narrow bass bands never shift the following bands. */
const fillBands = (levels: Uint8Array, out: Float32Array, sampleRate: number) => {
  const count = out.length;
  const binHz = sampleRate / (levels.length * 2);
  const minimumHz = Math.max(60, binHz);
  const maximumHz = Math.min(8000, (levels.length - 1) * binHz);
  const range = maximumHz / minimumHz;
  for (let band = 0; band < count; band++) {
    const start = (minimumHz * range ** (band / count)) / binHz;
    const end = (minimumHz * range ** ((band + 1) / count)) / binHz;
    let squared = 0;
    let weight = 0;
    for (let bin = Math.floor(start); bin < Math.min(levels.length, Math.ceil(end)); bin++) {
      const overlap = Math.max(0, Math.min(end, bin + 1) - Math.max(start, bin));
      const level = levels[bin] / 255;
      squared += level * level * overlap;
      weight += overlap;
    }
    const loudness = weight > 0 ? Math.sqrt(squared / weight) : 0;
    const tilt = 1 + (0.35 * band) / Math.max(1, count - 1);
    out[band] = Math.min(1, Math.max(0, (loudness - 0.06) / 0.94) ** 0.8 * tilt);
  }
};

const isSameOrigin = (url: string) => {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

/**
 * Owns the one audio element behind the top-bar player, so music carries on from page to page. The playlist, its
 * order and whether it starts muted come from the admin (System settings); each visitor can mute, change the order
 * or switch the music off, which is remembered in this browser.
 */
export const MusicPlayerProvider = ({ children }: { children: ReactNode }) => {
  const { generalSetting } = useInstance();
  const config = useMemo(
    () => resolveMusicConfig(parseInstanceSiteConfig(generalSetting?.customPagesJson ?? ""), generalSetting?.musicConfigJson),
    [generalSetting],
  );
  const tracks = useMemo(() => config.tracks.filter(isPlayableTrack), [config]);
  const available = config.enabled && tracks.length > 0;
  const [prefs, setPrefs] = useState<MusicPrefs>(readPrefs);
  const mode = prefs.mode ?? config.mode;
  const muted = prefs.muted ?? config.defaultMuted;
  const volume = normalizeMusicVolume(prefs.volume, config.defaultVolume);
  // A small, non-security fingerprint invalidates a saved track when any playlist detail changes.
  const playlistKey = useMemo(() => {
    const content = JSON.stringify(tracks);
    let first = 2166136261;
    let second = 5381;
    for (let offset = 0; offset < content.length; offset++) {
      const code = content.charCodeAt(offset);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second, 33) ^ code;
    }
    return `${tracks.length}:${first >>> 0}:${second >>> 0}`;
  }, [tracks]);
  const [queue, setQueue] = useState<number[]>([]);
  const [queueKey, setQueueKey] = useState("");
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedUrlRef = useRef<string | undefined>(undefined);
  const wantsPlayRef = useRef(false);
  const autoplayAttemptedRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelsRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const analysisTimeRef = useRef(-Infinity);
  const energyCacheRef = useRef({ at: -Infinity, value: 0 });
  const bandsCacheRef = useRef(new Map<number, { at: number; values: Float32Array }>());
  const advanceRef = useRef<() => void>(noop);
  const queueRef = useRef<number[]>([]);
  const positionRef = useRef(0);
  const previousPlaylistRef = useRef(prefs.playlistKey);
  const mediaPrefsRef = useRef({ muted, volume });
  const lastAudibleVolumeRef = useRef(volume > 0 ? volume : config.defaultVolume || 0.3);
  const loadedPlaylistRef = useRef<string | undefined>(undefined);
  const index = queue[position] ?? 0;
  // Nothing is current until the play order is dealt, so autoplay never starts on a track it then jumps away from.
  const current = available && queue.length === tracks.length && queueKey === playlistKey ? tracks[index] : undefined;
  const hasCurrent = Boolean(current);

  const updatePrefs = useCallback((patch: MusicPrefs) => {
    setPrefs((previous) => {
      const nextPrefs = { ...previous, ...patch };
      writePrefs(nextPrefs);
      return nextPrefs;
    });
  }, []);

  useEffect(() => {
    mediaPrefsRef.current = { muted, volume };
    if (volume > 0) lastAudibleVolumeRef.current = volume;
    if (audioRef.current) {
      audioRef.current.muted = muted;
      audioRef.current.volume = volume;
    }
  }, [muted, volume]);

  useEffect(() => {
    queueRef.current = queue;
    positionRef.current = position;
  }, [queue, position]);

  // A fresh order whenever the playlist or the mode changes, keeping the current track where it can.
  useEffect(() => {
    if (tracks.length === 0) {
      setQueue([]);
      setPosition(0);
      return;
    }
    const playlistChanged = previousPlaylistRef.current !== undefined && previousPlaylistRef.current !== playlistKey;
    const playingIndex = queueRef.current[positionRef.current];
    const savedIndex =
      mode !== "random" && prefs.playlistKey === playlistKey ? tracks.findIndex((track) => track.id === prefs.trackId) : -1;
    let keep: number | undefined;
    if (mode === "random" && (playlistChanged || playingIndex === undefined || playingIndex >= tracks.length)) {
      const candidates = tracks
        .map((track, trackIndex) => ({ id: track.id, index: trackIndex }))
        .filter((track) => tracks.length === 1 || track.id !== prefs.trackId);
      keep = candidates[Math.floor(Math.random() * candidates.length)].index;
    } else if (playlistChanged) {
      keep = 0;
    } else if (playingIndex !== undefined && playingIndex < tracks.length) {
      keep = playingIndex;
    } else if (savedIndex >= 0) {
      keep = savedIndex;
    }
    const nextQueue = buildQueue(tracks.length, mode, keep);
    setQueue(nextQueue);
    setPosition(keep === undefined ? 0 : Math.max(0, nextQueue.indexOf(keep)));
    setQueueKey(playlistKey);
    previousPlaylistRef.current = playlistKey;
  }, [tracks.length, playlistKey, mode]);

  useEffect(() => {
    if (current && (prefs.trackId !== current.id || prefs.playlistKey !== playlistKey)) {
      updatePrefs({ trackId: current.id, playlistKey });
    }
  }, [current?.id, playlistKey, prefs.trackId, prefs.playlistKey, updatePrefs]);

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      audio.volume = mediaPrefsRef.current.volume;
      audio.muted = mediaPrefsRef.current.muted;
      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
      audio.addEventListener("loadedmetadata", () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("ended", () => advanceRef.current());
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  // Measuring loudness routes playback through Web Audio, which silences cross-origin files without CORS, so it is
  // only wired up when every track comes from this site. It also needs a user gesture, so only gestures call this.
  const ensureAnalyser = useCallback(() => {
    if (analyserRef.current || typeof AudioContext === "undefined" || !tracks.every((track) => isSameOrigin(track.url))) {
      void audioContextRef.current?.resume();
      return;
    }
    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(getAudio());
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      levelsRef.current = new Uint8Array(analyser.frequencyBinCount);
      analysisTimeRef.current = -Infinity;
      bandsCacheRef.current.clear();
    } catch {
      // Without an analyser the music plays all the same; effects just do not pulse.
    }
  }, [getAudio, tracks]);

  const startPlayback = useCallback(() => {
    const audio = getAudio();
    wantsPlayRef.current = true;
    return audio.play();
  }, [getAudio]);

  // Load the current track; once the visitor (or autoplay) has started, moving on keeps the music going.
  useEffect(() => {
    if (!current || (loadedUrlRef.current === current.url && loadedPlaylistRef.current === playlistKey)) return;
    const audio = getAudio();
    loadedUrlRef.current = current.url;
    loadedPlaylistRef.current = playlistKey;
    audio.src = current.url;
    setCurrentTime(0);
    setDuration(0);
    if (wantsPlayRef.current) void audio.play().catch(() => undefined);
  }, [current, getAudio, playlistKey]);

  // Autoplay on arrival. A muted start is always allowed; with sound, browsers wait for the first click or key.
  useEffect(() => {
    if (!available || !config.autoplay) {
      autoplayAttemptedRef.current = false;
      return;
    }
    if (autoplayAttemptedRef.current || prefs.off || !current) return;
    autoplayAttemptedRef.current = true;
    const audio = getAudio();
    audio.muted = muted;
    let cancelled = false;
    let started = false;
    const onFirstGesture = () => {
      if (cancelled || !audio.paused) return;
      ensureAnalyser();
      void startPlayback().then(
        () => {
          started = true;
        },
        () => undefined,
      );
    };
    void startPlayback().then(
      () => {
        started = true;
      },
      () => {
        if (cancelled) return;
        window.addEventListener("pointerdown", onFirstGesture, { once: true });
        window.addEventListener("keydown", onFirstGesture, { once: true });
      },
    );
    return () => {
      cancelled = true;
      if (!started) autoplayAttemptedRef.current = false;
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
    // Only on arrival or when the admin switches music on; later changes are the visitor's own doing.
  }, [available, config.autoplay, hasCurrent]);

  useEffect(() => {
    if (!available) {
      wantsPlayRef.current = false;
      audioRef.current?.pause();
    }
  }, [available]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const move = useCallback(
    (direction: 1 | -1) => {
      const count = queue.length;
      if (count === 0) return;
      const nextPosition = position + direction;
      let nextQueue = queue;
      let wrapped = ((nextPosition % count) + count) % count;
      if (nextPosition >= count && mode === "random") {
        // A random round is over: deal a new order that does not open with the song that just played.
        nextQueue = [...buildQueue(count, "random").filter((value) => value !== index), index];
        wrapped = 0;
        setQueue(nextQueue);
      }
      setPosition(wrapped);
      // The same song again (a one-song list) does not reload, so restart it by hand.
      if (nextQueue[wrapped] === index && audioRef.current) {
        audioRef.current.currentTime = 0;
        if (wantsPlayRef.current) void audioRef.current.play().catch(() => undefined);
      }
    },
    [index, mode, position, queue],
  );

  useEffect(() => {
    advanceRef.current = () => move(1);
  }, [move]);

  const toggle = useCallback(() => {
    if (!current) return;
    ensureAnalyser();
    const audio = getAudio();
    if (audio.paused) {
      updatePrefs({ off: false });
      void startPlayback().catch(() => undefined);
    } else {
      wantsPlayRef.current = false;
      audio.pause();
    }
  }, [current, ensureAnalyser, getAudio, startPlayback, updatePrefs]);

  const playAt = useCallback(
    (trackIndex: number) => {
      const target = queue.indexOf(trackIndex);
      if (target < 0) return;
      ensureAnalyser();
      updatePrefs({ off: false });
      wantsPlayRef.current = true;
      if (target === position) {
        void startPlayback().catch(() => undefined);
      } else {
        setPosition(target);
      }
    },
    [ensureAnalyser, position, queue, startPlayback, updatePrefs],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      ensureAnalyser();
      updatePrefs({ off: false });
      wantsPlayRef.current = true;
      move(direction);
    },
    [ensureAnalyser, move, updatePrefs],
  );

  const seek = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = Math.min(1, Math.max(0, ratio)) * duration;
    },
    [duration],
  );

  const toggleMute = useCallback(() => {
    ensureAnalyser();
    const nextMuted = !(muted || volume === 0);
    getAudio().muted = nextMuted;
    if (!nextMuted && volume === 0) {
      const restored = lastAudibleVolumeRef.current;
      getAudio().volume = restored;
      updatePrefs({ muted: false, volume: restored });
    } else {
      updatePrefs({ muted: nextMuted });
    }
  }, [ensureAnalyser, getAudio, muted, volume, updatePrefs]);

  const setVolume = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
      ensureAnalyser();
      const nextVolume = normalizeMusicVolume(value);
      const audio = getAudio();
      audio.volume = nextVolume;
      audio.muted = nextVolume === 0;
      updatePrefs({ volume: nextVolume, muted: nextVolume === 0 });
    },
    [ensureAnalyser, getAudio, updatePrefs],
  );

  const setMode = useCallback((nextMode: InstanceMusicMode) => updatePrefs({ mode: nextMode }), [updatePrefs]);

  const turnOff = useCallback(() => {
    wantsPlayRef.current = false;
    audioRef.current?.pause();
    updatePrefs({ off: true });
  }, [updatePrefs]);

  const resetPrefs = useCallback(() => {
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      // Nothing saved to forget.
    }
    setPrefs({});
  }, []);

  const readFrequencyData = useCallback(() => {
    const analyser = analyserRef.current;
    const levels = levelsRef.current;
    if (!analyser || !levels || !audioRef.current || audioRef.current.paused || audioRef.current.muted) return null;
    const now = performance.now();
    // The button, open panel and particles share one FFT snapshot, at most 30/s.
    if (now - analysisTimeRef.current >= 1000 / 30) {
      analyser.getByteFrequencyData(levels);
      analysisTimeRef.current = now;
    }
    return levels;
  }, []);

  const getEnergy = useCallback(() => {
    const levels = readFrequencyData();
    if (!levels) return 0;
    if (energyCacheRef.current.at === analysisTimeRef.current) return energyCacheRef.current.value;
    // The lowest eighth of the spectrum carries the beat.
    const bins = Math.max(1, Math.floor(levels.length / 8));
    let sum = 0;
    for (let bin = 0; bin < bins; bin++) sum += levels[bin];
    const value = sum / bins / 255;
    energyCacheRef.current = { at: analysisTimeRef.current, value };
    return value;
  }, [readFrequencyData]);

  const getSpectrum = useCallback(
    (out: Float32Array) => {
      const analyser = analyserRef.current;
      const levels = levelsRef.current;
      const audio = audioRef.current;
      if (!analyser || !levels || !audio) return false;
      const measured = readFrequencyData();
      if (!measured) {
        out.fill(0);
        return true;
      }
      let cached = bandsCacheRef.current.get(out.length);
      if (!cached) {
        cached = { at: -Infinity, values: new Float32Array(out.length) };
        bandsCacheRef.current.set(out.length, cached);
      }
      if (cached.at !== analysisTimeRef.current) {
        fillBands(measured, cached.values, analyser.context.sampleRate);
        cached.at = analysisTimeRef.current;
      }
      out.set(cached.values);
      return true;
    },
    [readFrequencyData],
  );

  const getPlaybackProgress = useCallback(() => {
    const audio = audioRef.current;
    return audio && Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0;
  }, []);

  const effectsValue = useMemo<MusicEffectsValue>(
    () => ({ playing, muted, volume, getEnergy, getSpectrum, resetPrefs, getPlaybackProgress }),
    [playing, muted, volume, getEnergy, getSpectrum, resetPrefs, getPlaybackProgress],
  );

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      available,
      tracks,
      current,
      index,
      playing,
      muted,
      volume,
      mode,
      currentTime,
      duration,
      toggle,
      playAt,
      next: () => step(1),
      previous: () => step(-1),
      seek,
      toggleMute,
      setVolume,
      setMode,
      turnOff,
      resetPrefs,
      getEnergy,
      getSpectrum,
    }),
    [
      available,
      current,
      currentTime,
      duration,
      getEnergy,
      getSpectrum,
      index,
      mode,
      muted,
      volume,
      playAt,
      playing,
      resetPrefs,
      seek,
      setMode,
      setVolume,
      step,
      toggle,
      toggleMute,
      tracks,
      turnOff,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      <MusicEffectsContext.Provider value={effectsValue}>{children}</MusicEffectsContext.Provider>
    </MusicPlayerContext.Provider>
  );
};

export const useMusicPlayer = () => useContext(MusicPlayerContext);
export const useMusicEffects = () => useContext(MusicEffectsContext);
