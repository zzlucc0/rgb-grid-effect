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

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    rms = librosa.feature.rms(y=y)[0]
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

    onset_sample = [round(safe_float(v), 5) for v in onset_env[: min(256, len(onset_env))]]

    print(json.dumps({
        'ok': True,
        'duration': round(duration, 3),
        'bpm': round(safe_float(tempo, 122.0), 2),
        'beats': [round(safe_float(t), 3) for t in beat_times[:5000]],
        'segments': segments,
        'onsetSample': onset_sample,
    }))


if __name__ == '__main__':
    main()
