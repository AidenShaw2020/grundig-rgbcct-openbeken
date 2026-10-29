# Grundig RGB+CCT Over Wi-Fi With OpenBeken

Reuse a BK7231N controller module from LSC Smart Connect LED panels to control
a Grundig RGB+CCT LED strip over Wi-Fi. Includes an OpenBeken script renderer,
a local web interface, individual control of 25 strip segments, and MQTT
configuration for Home Assistant.

## Why This Project Exists

I had spare controller modules left over from
[LSC Smart Connect smart LED panels (Action 3216802)](https://www.action.com/cs-cz/p/3216802/chytre-led-panely-lsc-smart-connect/)
and needed to control a
[Grundig LED strip with remote control (Action 3221698)](https://www.action.com/cs-cz/p/3221698/led-pasek-s-dalkovym-ovladanim/)
over Wi-Fi. This project gives those leftover modules a second use instead
of buying another controller.

This is an independent DIY project, not an official product integration.
Product revisions may differ; verify your own board and strip before connecting them.

## What Works

- OFF, RGB, tunable white, and six native PixelAnim effects.
- 25 individually colored, dimmable, and switchable RGB segments on the tested 5 m strip.
- Global RGB brightness, per-segment RGB brightness, separate white brightness, and warm/cool mixing.
- Standalone local web control without a cloud service.
- An RGB picker adapted to the custom renderer in the original OpenBeken menu.
- A physical button toggle (OFF / last active mode) and an IR receiver pin assignment.
- MQTT package and automated MQTT Discovery: 25 segment lights, master light, global RGB, CCT white, animation, mode select, and animation brightness/interval.
- Automatic zero-LittleFS-write profile persistence via `SetStartValue` (`grundig-persist.bat`), restoring power state, last active mode, and all 25 24-bit segment colors across restarts.

## Hardware And Safety

Tested with a BK7231N module, OpenBeken **1.18.319**, and a Grundig 3221698
24 V RGB+CCT strip with **25 physical segments**.

| Connection | Purpose |
| --- | --- |
| P9 | Strip DI; OpenBeken pin role `SM16703P_DIN` |
| P26 | IR receiver; pin role `IRRecv` |
| P28 | Button; the initialization script sets `Btn_ScriptOnly` |
| DC GND | Common ground between controller and strip |
| Rated power input | Use the correct supply for each board and the 24 V strip |

**Never connect 24 V to an MCU GPIO or its low-voltage supply rail.** Use only
the board's correctly rated power input. Disconnect power before wiring and
verify pinout, polarity, regulation, and logic-level compatibility. Direct
P9-to-DI worked on the tested assembly, but the DI voltage margins have not
been measured. This is not a universal wiring guarantee for other revisions.

Back up existing firmware and configuration before installing OpenBeken.
This repository contains scripts, not a firmware binary or flashing utility.
Obtain firmware and board-specific flashing instructions from
[OpenBeken](https://github.com/openshwprojects/OpenBK7231T_App).

## Installation

1. Install compatible OpenBeken firmware and configure the P9/P26 roles above.
   No separate PWM output is used to drive this digital strip. Do not map
   unrelated outputs onto the virtual channels used by this project.
2. Ensure LittleFS has enough space; the tested device uses **64 kB**.
   Back up the filesystem first. Do not blindly format or resize an existing device.
3. Upload the following files through the OpenBeken LittleFS interface (or build and upload a verified 64 KiB LittleFS image using `tools/upgrade_device.mjs`):
   - `device/grundig.bat` as `grundig.bat`.
   - `device/grundig-persist.bat` as `grundig-persist.bat`.
   - `device/autoexec.bat` as `autoexec.bat` (merge with an existing startup file).
   - `device/grundig-state.example.bat` as **`grundig-state.bat`** for a fresh
     installation only. Do not overwrite an existing saved profile.
4. With Node.js **22 or newer** and `curl` available, upload the UI:

   ```powershell
   $env:OPENBEKEN_URL = 'http://192.168.4.1'
   node tools/check_device.mjs --deploy-ui
   ```

   Replace the URL with your device's address when connected through your router.
   This uploads `grundig-rgb.js` and a compressed `grundig.html.gz`, compares
   their contents after upload, and registers the native RGB adapter.
5. Set the short startup command to `PowerSave 0`, then restart the device.
   The installed `autoexec.bat` initializes the renderer. The initial template
   contains black RGB values; select a color before expecting RGB output.
6. Open `/api/lfs/grundig.html.gz` on the device, or use the named Grundig
   controls in its original menu. Save the profile only when you want the
   current settings written to flash.

The `.bat` files are **OpenBeken scripts**, not Windows batch files.
Wi-Fi and MQTT credentials are configured separately on your own device.

## Controls

Select the mode using `Grundig - rezim`. In RGB mode, the native picker
`Grundig RGB - barva` copies a chosen color to all 25 segments. The separate
segment page also offers individual RGB colors, per-segment brightness sliders,
and ON/OFF switches.

Changing RGB colors does not leave white mode: white deliberately takes
priority. Global RGB brightness scales all RGB segments alongside each
segment's individual brightness level.

Generic OpenBeken LED commands are not a safe interface to this renderer:
they can overwrite the SPI buffer or virtual channels. `Toggle Light` is
hidden by the native UI adapter. Use `RGB - jas`, not the generic
`LED Dimmer/Brightness`. The adapter requires JavaScript and the tested
OpenBeken DOM; if the picker still says `LED RGB Color`, use the standalone
segment page instead. Native menu compatibility with other firmware versions
is not guaranteed.

## Home Assistant

Configure the device and Home Assistant to use the same MQTT broker. The
included `device/homeassistant.yaml` is a JSON-format YAML package with the
neutral example device ID `grundig_led`. Regenerate it for the MQTT topic
configured on your device:

```powershell
$env:OPENBEKEN_DEVICE_ID = 'your_openbeken_topic'
node tools/generate_ha.mjs
node tools/generate_ha.mjs --check
```

Copy the generated package into your Home Assistant configuration and merge
the following into its existing configuration rather than duplicating keys:

```yaml
homeassistant:
  packages:
    grundig: !include homeassistant.yaml
```

Do not publish your locally generated IDs or broker credentials. Command
messages are not retained, and entities wait for device state rather than
assuming a command succeeded. Alternatively, `node tools/upgrade_device.mjs --discovery http://<device-ip>`
publishes 34 retained Home Assistant MQTT Discovery configurations directly
through the device's configured MQTT connection (escaping `$` as `\u0024` so
OpenBeken's `publishFile` does not expand `$CH...` channel templates).

## Protocol And Tools

The measured frame contains **150 bytes**, or 25 blocks of
`B R G CW WW 00`. The sixth byte is retained as zero; its purpose and the
exact driver IC are unknown. This project does not claim WS2805 compatibility.
Static output uses `SM16703P_Init 50 RGB` as a 150-byte transport buffer,
not as a claim that the strip has 50 physical segments. Animation uses
`SM16703P_Init 25 BRGCCC` with white channels zeroed.

See [device/README.md](device/README.md) for the channel contract and MQTT
interface, and [captures/README.md](captures/README.md) for measurement findings.
Raw captures, local profiles, flash backups, and recovery snapshots are not
distributed in this repository.

Optional capture/decode tools require Python and dependencies:

```powershell
python -m pip install -r requirements.txt
python tools/usbee_capture.py --help
python tools/decode_capture.py --help
```

The capture tool needs a compatible USBee/FX2 device, USB driver, and fx2lafw
firmware installed separately (use `--fw` to select its path). It uploads
firmware to the **logic analyzer**, not to the LED controller. Third-party
firmware is not bundled.

## Validation And Updates

Offline checks, without contacting or changing the LED controller:

```powershell
node tools/check_device.mjs --check-persistence
node tools/check_device.mjs --check-ui
node tools/generate_ha.mjs --check
```

For a device already initialized with this project:

```powershell
node tools/check_device.mjs --deploy-ui
node tools/check_device.mjs --deploy
```

**The second command is a live hardware test:** it temporarily enables
animation and white at their configured brightness, tests RGB at 5%, restores
the original RGB brightness, and ends OFF. It preserves saved segment colors
and resumes the renderer without loading an older flash profile. It is not a
fresh-install command. Do not run it unintentionally on connected hardware.

`--connect` is Windows-only and requires `OPENBEKEN_WIFI_PROFILE` naming an
existing WLAN profile. Use it only when disconnected; an ordinary deployment
does not need to reconnect Wi-Fi.

Software and device readback tests cover mode changes, stored colors,
transaction retries, RGB-picker routing, and hidden generic power controls.
RGB selection was also confirmed working by the user.

A fresh installation on a **second matching BK7231N module and Grundig strip**
was completed with OpenBeken 1.18.319. Its 32 kB LittleFS was backed up and
expanded to 64 kB with permission, and all uploaded files were verified by
exact readback. RGB, white, and animation mode checks passed. The user
confirmed that the whole second strip lit red at 5% RGB brightness and that
interactive control worked after a software restart. Pin assignments, the
short startup command, and 64 kB LittleFS persisted across that restart.
The strict OFF-after-restart check on this unit was inconclusive during
interactive testing, so it is not an additional verification of startup OFF.

A brief flash before the startup script runs remains unresolved, electrical
margins are unmeasured, and support for different strip lengths or hardware
revisions is untested.

## License

Project code and documentation are licensed under [MIT](LICENSE), copyright
2026 **AidenShaw2020**. OpenBeken, Python packages, and logic-analyzer firmware
are separate projects with their own licenses. No third-party firmware is
included. Product and brand names belong to their respective owners.