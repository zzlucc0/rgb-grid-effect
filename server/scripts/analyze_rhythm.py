#!/usr/bin/env python3
import json, sys
from pathlib import Path

try:
    import librosa
    import numpy as np
except Exception as e:
    print(json.dumps({"ok": False, "error": f"import failed: {e}"}))
    sys.exit(1)


def safe_float(x, default=0.0):
    try:
        if hasattr(x, 'item'):
            x = x.item()
        return float(x)
    except Exception:
        return default


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "wav path required"}))
        sys.exit(2)
    wav = Path(sys.argv[1])
    y, sr = librosa.load(str(wav), sr=22050, mono=True)
    duration = safe_float(librosa.get_duration(y=y, sr=sr))

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    downbeats = beat_times[::4] if len(beat_times) else []

    # HPSS: split audio into harmonic (tonal/vocal) and percussive (drum) components
    y_harm, y_perc = librosa.effects.hpss(y)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_env_harm = librosa.onset.onset_strength(y=y_harm, sr=sr)
    onset_env_perc = librosa.onset.onset_strength(y=y_perc, sr=sr)
    rms = librosa.feature.rms(y=y)[0]
    rms_harm = librosa.feature.rms(y=y_harm)[0]
    rms_perc = librosa.feature.rms(y=y_perc)[0]
    rms_times = librosa.times_like(rms, sr=sr)

    window = 8.0
    segments = []
    start = 0.0
    while start < max(duration, window):
        end = min(duration, start + window)
        beat_count = int(np.sum((beat_times >= start) & (beat_times < end)))
        mask = (rms_times >= start) & (rms_times < end)
        avg_rms = safe_float(np.mean(rms[mask])) if np.any(mask) else 0.0
        density = beat_count / max(1.0, end - start)
        energy = 'high' if avg_rms > 0.14 or density > 2.2 else ('mid' if avg_rms > 0.07 or density > 1.2 else 'low')
        label = 'intro' if start < 8 else ('chorus' if energy == 'high' else ('verse' if energy == 'mid' else 'break'))
        drag_ratio = 0.28 if label == 'chorus' else (0.18 if label == 'verse' else 0.12)
        segments.append({
            'start': round(start, 3),
            'end': round(end, 3),
            'beatCount': beat_count,
            'density': round(density, 3),
            'avgRms': round(avg_rms, 4),
            'energy': energy,
            'label': label,
            'dragRatio': drag_ratio,
            'phraseRadius': 250 if label == 'chorus' else (220 if label == 'verse' else 190)
        })
        start += window

    # Normalise per-segment RMS to [0,1] so chart knows the relative loudness across the full song
    _seg_rms = [s['avgRms'] for s in segments]
    _rms_min = min(_seg_rms) if _seg_rms else 0.0
    _rms_max = max(_seg_rms) if _seg_rms else 1.0
    _rms_span = max(_rms_max - _rms_min, 1e-6)
    for _i, _seg in enumerate(segments):
        _seg['energyNorm'] = round((_seg['avgRms'] - _rms_min) / _rms_span, 3)
        _prev_rms = segments[_i - 1]['avgRms'] if _i > 0 else _seg['avgRms']
        _delta = _seg['avgRms'] - _prev_rms
        _seg['gradient'] = 'rising' if _delta > 0.008 else ('falling' if _delta < -0.008 else 'stable')

    # HPSS segment enrichment: add harmonicRatio, sustainRatio, vocalHeavy, relabel drum-only 'chorus' as 'drop'
    for _seg in segments:
        _s, _e = _seg['start'], _seg['end']
        _mask = (rms_times >= _s) & (rms_times < _e)
        if np.any(_mask):
            _rh = safe_float(np.mean(rms_harm[_mask]))
            _rp = safe_float(np.mean(rms_perc[_mask]))
            _total = _rh + _rp + 1e-8
            _harmRatio = round(_rh / _total, 3)
            _sustainRatio = round(safe_float(np.mean((rms_harm[_mask] > rms_perc[_mask]).astype(float))), 3)
        else:
            _harmRatio = 0.5
            _sustainRatio = 0.5
        _vocalHeavy = bool(_harmRatio > 0.52 and _sustainRatio > 0.42)
        _seg['harmonicRatio'] = _harmRatio
        _seg['sustainRatio'] = _sustainRatio
        _seg['vocalHeavy'] = _vocalHeavy
        # Relabel high-energy sections with no vocal presence as 'drop' (pure drum / EDM drop)
        if _seg['label'] == 'chorus' and not _vocalHeavy:
            _seg['label'] = 'drop'
            _seg['dragRatio'] = 0.08

    onset_sample = [round(safe_float(v), 5) for v in onset_env[: min(256, len(onset_env))]]
    # Per-beat onset strength (total, harmonic, percussive) — all normalised 0-1 song-wide
    _onset_max = float(np.max(onset_env)) if len(onset_env) > 0 else 1.0
    _harm_max = float(np.max(onset_env_harm)) if len(onset_env_harm) > 0 else 1.0
    _perc_max = float(np.max(onset_env_perc)) if len(onset_env_perc) > 0 else 1.0
    _onset_norm = onset_env / max(_onset_max, 1e-6)
    _harm_norm = onset_env_harm / max(_harm_max, 1e-6)
    _perc_norm = onset_env_perc / max(_perc_max, 1e-6)
    beat_strengths = [round(float(_onset_norm[min(int(f), len(_onset_norm) - 1)]), 4) for f in beat_frames[:5000]]
    harmonic_strengths = [round(float(_harm_norm[min(int(f), len(_harm_norm) - 1)]), 4) for f in beat_frames[:5000]]
    percussive_strengths = [round(float(_perc_norm[min(int(f), len(_perc_norm) - 1)]), 4) for f in beat_frames[:5000]]

    # Vocal/melody off-beat onsets: harmonic onsets that don't land on a beat
    _voc_frames = librosa.onset.onset_detect(y=y_harm, sr=sr, units='frames')
    _voc_times = librosa.frames_to_time(_voc_frames, sr=sr)
    vocal_onsets = []
    for _vt in _voc_times:
        _vf = safe_float(_vt)
        if _vf < 1.5:
            continue
        if len(beat_times) > 0 and float(np.min(np.abs(beat_times - _vf))) < 0.12:
            continue
        vocal_onsets.append(round(_vf, 3))

    print(json.dumps({
        'ok': True,
        'duration': round(duration, 3),
        'bpm': round(safe_float(tempo, 122.0), 2),
        'beats': [round(safe_float(t), 3) for t in beat_times[:5000]],
        'downbeats': [round(safe_float(t), 3) for t in downbeats[:2000]],
        'meter': 4,
        'segments': segments,
        'onsetSample': onset_sample,
        'beatStrengths': beat_strengths,
        'harmonicStrengths': harmonic_strengths,
        'percussiveStrengths': percussive_strengths,
        'vocalOnsets': vocal_onsets[:2000],
    }))


if __name__ == '__main__':
    main()
