#!/usr/bin/env python3
"""Minimal fx2lafw capture tool for CWAV USBee AX (Pro) / FX2 clones.

Uses pyusb + libusb_package and the fx2lafw firmware shipped with PulseView.
Writes a raw .bin (1 byte = 8 channels per sample), a PulseView-compatible .sr
file and a JSON with metadata.

sigrok-cli is not used, because sigrok.org currently serves an expired TLS
certificate and the download fails.

Example:
    python tools/usbee_capture.py --rate 12M --seconds 2 --out captures/00_off
"""
import argparse
import json
import os
import sys
import threading
import time
import zipfile

import libusb_package
import usb.core
import usb.util

VID, PID = 0x08A9, 0x0014
FW_DEFAULT = r"C:\Program Files\sigrok\PulseView\share\sigrok-firmware\fx2lafw-cwav-usbeeax.fw"

CMD_GET_FW_VERSION = 0xB0
CMD_START = 0xB1
FLAG_CLK_48MHZ = 1 << 6
EP_DATA = 0x82


def parse_rate(s):
    s = s.strip().upper()
    mul = 1
    if s.endswith("M"):
        mul, s = 1_000_000, s[:-1]
    elif s.endswith("K"):
        mul, s = 1_000, s[:-1]
    return int(float(s) * mul)


def find_devices():
    return list(libusb_package.find(find_all=True, idVendor=VID, idProduct=PID))


def product_string(dev):
    try:
        return usb.util.get_string(dev, dev.iProduct) if dev.iProduct else None
    except Exception:
        return None


def upload_firmware(dev, fw_path):
    with open(fw_path, "rb") as f:
        fw = f.read()
    # Hold 8051 in reset (CPUCS = 0xE600)
    dev.ctrl_transfer(0x40, 0xA0, 0xE600, 0, b"\x01")
    for off in range(0, len(fw), 4096):
        dev.ctrl_transfer(0x40, 0xA0, off, 0, fw[off:off + 4096])
    # Release reset -> device renumerates
    try:
        dev.ctrl_transfer(0x40, 0xA0, 0xE600, 0, b"\x00")
    except usb.core.USBError:
        pass


def ensure_fx2lafw(fw_path, timeout=8.0):
    devs = find_devices()
    need = [d for d in devs if product_string(d) != "fx2lafw"]
    for d in need:
        print(f"[fw] uploading fx2lafw to bus {d.bus} port {d.port_numbers}")
        upload_firmware(d, fw_path)
        usb.util.dispose_resources(d)
    if need:
        t0 = time.time()
        while time.time() - t0 < timeout:
            time.sleep(0.5)
            devs = find_devices()
            if len(devs) >= len(need) and all(product_string(d) == "fx2lafw" for d in devs):
                break
    devs = find_devices()
    return [d for d in devs if product_string(d) == "fx2lafw"]


def start_cmd(rate):
    if 48_000_000 % rate == 0 and 48_000_000 // rate - 1 <= 6 * 256:
        delay = 48_000_000 // rate - 1
        flags = FLAG_CLK_48MHZ
    elif 30_000_000 % rate == 0:
        delay = 30_000_000 // rate - 1
        flags = 0
    else:
        raise SystemExit(f"Unsupported sample rate {rate}")
    return bytes([flags, (delay >> 8) & 0xFF, delay & 0xFF])


def write_sr(path, data, rate, nch=8):
    meta = (
        "[global]\nsigrok version=0.5.1\n\n[device 1]\ncapturefile=logic-1\n"
        f"total probes={nch}\nsamplerate={rate} Hz\ntotal analog=0\n"
        + "".join(f"probe{i+1}=D{i}\n" for i in range(nch))
        + "unitsize=1\n"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("version", "2")
        z.writestr("metadata", meta)
        chunk = 4 * 1024 * 1024
        for n, off in enumerate(range(0, len(data), chunk), start=1):
            z.writestr(f"logic-1-{n}", data[off:off + chunk])


class Capture:
    def __init__(self, dev, rate, nbytes):
        self.dev, self.rate, self.nbytes = dev, rate, nbytes
        self.data, self.err = None, None
        self.thread = None

    def prepare(self):
        d = self.dev
        try:
            if d.is_kernel_driver_active(0):
                d.detach_kernel_driver(0)
        except Exception:
            pass
        d.set_configuration()
        usb.util.claim_interface(d, 0)
        ver = d.ctrl_transfer(0xC0, CMD_GET_FW_VERSION, 0, 0, 2)
        print(f"[dev {d.port_numbers}] fx2lafw fw version {ver[0]}.{ver[1]}")

    def _reader(self):
        try:
            buf = usb.util.create_buffer(self.nbytes)
            n = self.dev.read(EP_DATA, buf, timeout=int(self.nbytes / self.rate * 1000) + 3000)
            self.data = bytes(buf[:n])
        except Exception as e:  # noqa
            self.err = e

    def start_reader(self):
        self.thread = threading.Thread(target=self._reader, daemon=True)
        self.thread.start()

    def start_acq(self):
        self.dev.ctrl_transfer(0x40, CMD_START, 0, 0, start_cmd(self.rate))


def summarize(data, rate):
    import numpy as np
    a = np.frombuffer(data, dtype=np.uint8)
    out = {}
    for ch in range(8):
        bits = (a >> ch) & 1
        edges = int(np.count_nonzero(np.diff(bits)))
        out[f"D{ch}"] = {"edges": edges, "high_ratio": round(float(bits.mean()), 4)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", default="12M")
    ap.add_argument("--seconds", type=float, default=2.0)
    ap.add_argument("--out", required=True, help="output path prefix (no extension)")
    ap.add_argument("--fw", default=FW_DEFAULT)
    ap.add_argument("--device", type=int, default=None,
                    help="index of device (by port order); default all")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    rate = parse_rate(args.rate)
    nbytes = int(rate * args.seconds) // 512 * 512

    devs = ensure_fx2lafw(args.fw)
    devs.sort(key=lambda d: d.port_numbers or ())
    if not devs:
        sys.exit("No fx2lafw device found")
    if args.device is not None:
        devs = [devs[args.device]]

    caps = [Capture(d, rate, nbytes) for d in devs]
    for c in caps:
        c.prepare()
    for c in caps:
        c.start_reader()
    time.sleep(0.05)
    t_start = time.time()
    for c in caps:
        c.start_acq()
    for c in caps:
        c.thread.join()

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    for idx, c in enumerate(caps):
        suffix = "" if len(caps) == 1 else f"_dev{idx}"
        if c.err:
            print(f"[dev {c.dev.port_numbers}] ERROR {c.err}")
            continue
        base = args.out + suffix
        with open(base + ".bin", "wb") as f:
            f.write(c.data)
        write_sr(base + ".sr", c.data, rate)
        summ = summarize(c.data, rate)
        meta = {
            "device_port": list(c.dev.port_numbers or ()),
            "samplerate": rate,
            "requested_bytes": nbytes,
            "received_bytes": len(c.data),
            "start_time": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(t_start)),
            "note": args.note,
            "channels": summ,
        }
        with open(base + ".json", "w") as f:
            json.dump(meta, f, indent=2)
        print(f"[dev {c.dev.port_numbers}] {len(c.data)} B -> {base}.sr")
        for ch, s in summ.items():
            print(f"    {ch}: edges={s['edges']:>8}  high={s['high_ratio']}")
    for c in caps:
        usb.util.release_interface(c.dev, 0)
        usb.util.dispose_resources(c.dev)


if __name__ == "__main__":
    main()

