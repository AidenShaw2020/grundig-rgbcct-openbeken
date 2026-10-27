#!/usr/bin/env python3
"""Inspect pulse-width encoded captures without assuming an LED chip type."""
import argparse
import configparser
import csv
import json
from pathlib import Path
import zipfile

import numpy as np


def load_runs(path, rate=None, channel=0, invert=False):
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as stream:
            rows = csv.reader(stream)
            next(rows)
            values = np.array([(float(row[0]), int(row[channel + 1])) for row in rows])
        times, levels = values[:, 0], values[:, 1].astype(np.uint8)
        if len(times) < 2 or np.any(np.diff(times) <= 0):
            raise ValueError("CSV needs increasing time in seconds and digital channel columns")
        changes = np.r_[True, levels[1:] != levels[:-1]]
        starts = times[changes]
        levels = levels[changes]
        ends = np.r_[starts[1:], times[-1]]
        return starts, ends, levels ^ int(invert), None
    if path.suffix.lower() == ".sr":
        with zipfile.ZipFile(path) as archive:
            config = configparser.ConfigParser()
            config.read_string(archive.read("metadata").decode())
            device = config["device 1"]
            if device.getint("unitsize", 1) != 1:
                raise ValueError("Only 8-channel, one-byte samples are supported")
            rate = rate or float(device["samplerate"].split()[0])
            names = sorted((name for name in archive.namelist() if name.startswith("logic-1-")),
                           key=lambda name: int(name.rsplit("-", 1)[1]))
            raw = b"".join(archive.read(name) for name in names)
    else:
        raw = path.read_bytes()
        if rate is None:
            rate = json.loads(path.with_suffix(".json").read_text())["samplerate"]
    if not rate or rate <= 0 or not raw:
        raise ValueError("Nonempty samples and a positive sample rate are required")
    levels = ((np.frombuffer(raw, dtype=np.uint8) >> channel) & 1) ^ int(invert)
    changes = np.flatnonzero(levels[1:] != levels[:-1]) + 1
    starts = np.r_[0, changes]
    ends = np.r_[changes, len(levels)]
    return starts / rate, ends / rate, levels[starts], rate


def analyze(starts, ends, levels, threshold_us=None, reset_us=50.0):
    widths = (ends - starts) * 1e6
    internal = np.ones(len(levels), dtype=bool)
    internal[[0, -1]] = False
    highs = widths[(levels == 1) & internal]
    if not len(highs):
        raise ValueError("No complete HIGH pulses found")
    if threshold_us is None:
        ordered = np.sort(np.unique(np.round(highs, 6)))
        if len(ordered) < 2:
            raise ValueError("Cannot infer two pulse classes; supply --threshold-us")
        split = int(np.argmax(np.diff(ordered)))
        threshold_us = float((ordered[split] + ordered[split + 1]) / 2)
    pulses = np.flatnonzero((levels == 1) & internal)
    groups = np.split(pulses, np.flatnonzero(np.diff(starts[pulses]) * 1e6 > reset_us) + 1)
    frames = []
    for group in groups:
        if not len(group):
            continue
        first, last = int(group[0]), int(group[-1])
        bits = (widths[group] > threshold_us).astype(np.uint8)
        usable = len(bits) // 8 * 8
        payload = np.packbits(bits[:usable], bitorder="big").tobytes()
        complete_start = first > 0 and levels[first - 1] == 0 and widths[first - 1] >= reset_us
        complete_end = last + 1 < len(levels) and levels[last + 1] == 0 and widths[last + 1] >= reset_us
        periods = np.diff(starts[group]) * 1e6
        frames.append({
            "start_ms": float(starts[first] * 1000),
            "bits": len(bits), "bytes": len(payload), "trailing_bits": len(bits) % 8,
            "bounded_by_idle": bool(complete_start and complete_end),
            "median_bit_period_us": float(np.median(periods)) if len(periods) else None,
            "following_low_us": float(widths[last + 1]) if last + 1 < len(levels) else None,
            "hex_msb_first_long_high_is_one": payload.hex(" "),
        })
    histograms = {}
    for level, name in ((1, "high"), (0, "low")):
        values, counts = np.unique(np.round(widths[(levels == level) & internal], 4), return_counts=True)
        histograms[name] = [{"us": float(value), "count": int(count)} for value, count in zip(values, counts)]
    return {"threshold_us": threshold_us, "frame_gap_us": reset_us,
            "duration_ms": float((ends[-1] - starts[0]) * 1000),
            "histograms": histograms, "frames": frames}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--samplerate", type=float, help="Hz; otherwise read capture metadata")
    parser.add_argument("--channel", type=int, choices=range(8), default=0)
    parser.add_argument("--invert", action="store_true")
    parser.add_argument("--threshold-us", type=float, help="HIGH duration dividing zero and one, not voltage")
    parser.add_argument("--reset-us", type=float, default=50.0, help="Idle LOW used to separate candidate frames")
    parser.add_argument("--out", type=Path, help="Optional JSON analysis output")
    args = parser.parse_args()
    starts, ends, levels, rate = load_runs(args.capture, args.samplerate, args.channel, args.invert)
    report = analyze(starts, ends, levels, args.threshold_us, args.reset_us)
    report.update(source=str(args.capture), samplerate=rate, channel=args.channel, inverted=args.invert)
    text = json.dumps(report, indent=2)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()