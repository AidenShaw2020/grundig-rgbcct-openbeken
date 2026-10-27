# Grundig capture findings, 2026-10-26

Historical reverse-engineering notes. Raw captures, capture metadata, local
paths, device identifiers, and recovery backups are not distributed. See
[the current device documentation](../device/README.md) for the implemented
renderer, startup behavior, UI, and MQTT interface; the transmitter setup
below describes the earlier measurement session, not the current installation.

## Setup and interpretation

- User reports the strip marking: 3535-2835-90P-100210-24V-RGBTW-SPI-5D-A.3FC.
  This is a strip assembly identifier, not an identified driver IC marking.
  3535/2835 likely refer to LED package sizes; 24V and RGBTW are consistent
  with the reported supply and RGB/tunable-white functionality. Other fields
  are not decoded. The SPI label alone does not establish a clocked SPI bus
  or identify the measured one-wire protocol.
- Passive USBee capture on D0 using fx2lafw 1.4.
- User confirmed electrical safety; exact DI voltage was not supplied.
- BIN stores one byte per sample, D0 in bit 0. SR and JSON accompany captures.
- Decoding assumes MSB first and long HIGH = 1. Mixed-value tests are still
  needed to establish bit significance independently.
- Complete candidate frames contain 1200 bits / 150 bytes. Static colors
  repeat every six bytes, giving 25 identical blocks. Subsequent BK7231N
  tests confirm one six-byte block per physical segment for positions 1-5;
  position 25 was also confirmed as the final physical segment. The meaning
  of byte 6 remains unknown.

## Observed Payloads

| Capture prefix | User-reported state | Repeated six-byte block |
| --- | --- | --- |
| 01_red | Pure red | 00 FF 00 00 00 00 |
| 02_green | Pure green | 00 00 FF 00 00 00 |
| 03_blue | Pure blue | FF 00 00 00 00 00 |
| 04_ww | Warmest white | 00 00 00 00 FF 00 |
| 05_cw_corrected | Subsequently selected cold white | 00 00 00 7F 80 00 |
| 05_cw_endpoint | Confirmed cold-white endpoint | 00 00 00 FF 00 00 |
| 07_dim50 | Red, approximately half brightness on remote | 00 69 00 00 00 00 |
| 09_cw_control_check | Cold white after control clarification; brightness unspecified | 00 00 00 50 00 00 |

The initial 05_cw_initial and 05_cw_12M_check captures were incorrectly
identified as cold white by the user. Both match 04_ww exactly. Their original
files and contemporaneous metadata are retained, but their names are not
evidence of a cold-white endpoint.

Observed byte order: B, R, G, CW, WW, unknown. The user subsequently confirmed
that 05_cw_corrected was a mixed-white setting (127 and 128 under the decoding
assumption). The new 05_cw_endpoint capture contains three identical complete
frames with only CW active, confirming the distinction from WW. The sixth
byte remains zero in every static color captured so far.

## Brightness

- 07_dim50 contains four identical complete frames. Compared with full red,
  only byte 2 (one-based) changes, from FF to 69 (105 under the MSB-first
  assumption). All 25 blocks are identical; byte 6 remains zero. In this test,
  RGB dimming changes the color value, not a separate brightness byte.
- The requested half brightness was approximate. The decoded value is about
  41% of 255, not a calibrated optical brightness or proof of a dimming curve.
- User corrected the earlier description of separate white brightness
  regulation: that control changes CCT (warm/cold mixing), not independently
  confirmed white brightness.
- 09_cw_control_check contains four identical complete frames. Only the CW
  byte differs from 05_cw_endpoint, changing from FF to 50 (80 under the
  MSB-first assumption); WW and the unknown sixth byte remain zero. This
  observes a lower CW value, but the exact intervening button sequence and
  brightness setting are unspecified. It is not a calibrated half-brightness
  test and does not establish shared or separate RGB/white brightness memory.

## Multicolor Effect

- 08_effect and 08_effect_phase1 through 08_effect_phase3 were recorded at
  12 MS/s. Each contains one complete 1200-bit / 150-byte frame.
- All four payloads differ. Dividing into 25 six-byte blocks yields 10, 14,
  15, and 15 distinct blocks respectively. Relative to 08_effect, the later
  snapshots change 19, 23, and 25 block positions.
- This supports per-position color payloads rather than a single global
  color or effect identifier. Subsequent single-segment transmitter tests
  confirm physical mapping for positions 1-5, as described below.
- Example blocks from 08_effect: 12 12 12 00 00 00, 3F 00 FF 00 00 00,
  2D 00 B4 00 00 00. Both white bytes and byte 6 are zero in all four frames.
  Byte 6 remains unexplained; zero in these captures does not prove it can
  be omitted from transmitted frames.
- 08_effect_long was an experimental 3 MS/s capture. It misses short HIGH
  pulses and gives fragmented apparent frames, so its decoded JSON is NOT
  valid protocol evidence. Raw files are retained for traceability. Use the
  four 12 MS/s captures for effect conclusions. With approximately 0.3 us
  minimum HIGH, the 100 kbit/s bit rate alone is not enough to choose a safe
  sampling rate.

## BK7231N Transmitter Tests

- Platform: BK7231N, OpenBeken 1.18.319, using its local access point.
- User confirms P9 to DI directly, common DC GND, and the original board's
  dedicated 24V input. No level shifter is fitted. Electrical margins and DI
  voltage remain unmeasured; successful operation does not establish ratings.
- Existing pins were retained: P9 SM16703P_DIN, P24 PWM channel 20,
  P26 IRRecv, P28 Btn_Tgl_All. P24 is not a separate white control for this
  digitally controlled strip.
- No autoexec.bat was present. The short startup was empty and was changed
  to PowerSave 0; persistence was verified by reloading the startup page.
  No LED initialization or animation is configured to run at boot.
- Commands used in RAM:

```text
PowerSave 0
startDriver SM16703P
SM16703P_Init 50 RGB
SM16703P_SetRaw 1 0 <300 hex characters representing 150 raw bytes>
```

- Init 50 RGB is only a way to allocate 50 x 3 = 150 data bytes. There are
  not 50 physical segments. Use raw six-byte blocks, not RGB SetPixel indices,
  and retain the sixth byte as zero. The layout is B, R, G, CW, WW, 00.
- A full zero payload was accepted by the device; the user confirmed the
  strip went dark. A frame with only byte offset 1 set to 18 hex lit only
  the first physical segment red, confirmed by the user.
- Next, positions 1-3 were set to red, green, blue using byte offsets 1, 8,
  and 12 at 18 hex each. The user confirmed the colors and positions.
- Next, offsets 21 and 28 were added at 18 hex, activating CW on position 4
  and WW on position 5 while preserving the first three positions. The user
  confirmed all five colors and all remaining segments dark.
- Next, offset 145 was set to 18 hex, activating red on position 25. The user
  confirmed this is the final physical segment, positions 1-5 were unchanged,
  and positions 6-24 remained dark. Together with the measured frame length,
  this supports a chain of 25 independently addressed six-byte segments.
- A partial command, SM16703P_SetRaw 1 6 001800000000, returned OK but did
  not change position 2 from green to red. The first segment was already red,
  so an unintended write at offset 0 would have been visually unchanged.
- Sending the entire 150-byte frame from offset 0, with position 2 changed
  to red and all other positions preserved, succeeded. The user confirmed
  the result. This verifies isolated state changes using full-frame writes,
  not the correctness of nonzero SetRaw offsets.
- Upstream src/driver/drv_leds_shared.c, Strip_CMD_setRaw, was inspected:
  it parses ofs but calls led_backend.setByte(i, hexbyte(s)) instead of
  using ofs + i. Thus the inspected implementation ignores the requested
  offset. This matches the device's behavior; the installed binary has not
  been independently compared to that source revision.
- Operational rule: maintain the entire 150-byte desired-state buffer and
  send SM16703P_SetRaw 1 0 followed by all 300 hex characters. Do not use
  nonzero offsets or rely on an OK reply as proof of a physical state change.
- Existing SM16703P raw output therefore works for these static tests.
  Earlier statements that a custom driver was necessarily required were
  premature. This does not identify the IC, establish its timing tolerance,
  independently measure the BK output waveform, or validate sustained use.
- Bytes after the tested positions were always explicitly zero in the
  transmitted full frame. No PixelAnim driver was started.

## Timing and Limits

- 00_off was captured after the user switched OFF using the remote, with the
  supply still connected. D0 remains LOW for all 1799680 samples at 12 MS/s
  (149.973 ms), with zero edges. This is steady OFF, not the ON-to-OFF
  transition; a preceding blackout frame or shutdown command is not excluded.
- At 12 MS/s: short HIGH approximately 0.25-0.333 us, long HIGH 0.833-0.917 us.
- Median rising-edge bit period approximately 10 us (about 100 kbit/s).
- Observed inter-frame LOW approximately 28 ms, frame repetition about 40 ms.
- 24 MS/s capture gives consistent timing and identical decoded warm-white
  payload. No independent calibrated time reference has been checked.
- Observed idle gaps do not establish the minimum required reset/latch time.
- Initial 200 ms requests returned only 2097152 bytes; use received byte counts
  and metadata sample rates, not requested durations. Subsequent 150 ms
  requests returned all 1799680 requested bytes (rounded to USB packet size).
- No specific IC, WS2805 compatibility, sixth-byte purpose, or minimum reset
  timing is established. Do not build a transmitter from the chip hypothesis.

Remaining checks: controlled brightness/CCT changes if needed, the ON-to-OFF
transition if shutdown encoding is needed, sustained full-frame use, minimum
latch timing, and identification of the IC / purpose of byte 6. White priority,
RGB state restoration, startup OFF behavior, and the Home Assistant package
were implemented after these measurements; see the current documentation
for their validation status and remaining limitations.