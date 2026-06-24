#!/usr/bin/env python3
"""
ascii_to_sprites.py  —  turn tiny ASCII art into animated pixel-art sprite sheets.

Why this exists
---------------
The pet system (see docs/pet.md, docs/pets-usage.md, docs/todo.md) serves one
horizontal sprite-sheet PNG per (species, behavior). Drawing those by hand is
slow. Instead you draw ONE 16x16 base grid per pet in ASCII, and this tool
procedurally generates every behavior's multi-frame sheet by applying small
per-frame transforms (bob, leg-swap, tilt, squash, fade, hop...).

It has NO third-party dependencies. PNGs are written with a hand-rolled encoder
built on the standard library `zlib` + `struct`. Runs on any Python 3.8+.

The pet roster is NOT hard-coded here anymore. Each pet lives as one entry in a
JSON file under tools/sprite_forge/pets/. The base game roster is in
pets/base_pets.json; every extra lootbox drops its own pets/<box>.json. By
default the forge loads ALL of them; use --pets to pick specific files.

Usage
-----
    python tools/sprite_forge/ascii_to_sprites.py                 # build everything (pets/*.json)
    python tools/sprite_forge/ascii_to_sprites.py --only desk_gun # one species
    python tools/sprite_forge/ascii_to_sprites.py --list          # list species/behaviors
    python tools/sprite_forge/ascii_to_sprites.py --out some/dir  # override output dir
    python tools/sprite_forge/ascii_to_sprites.py --pets pets/cryptid_corner.json   # one file (repeatable)

Pet file format (JSON): { "<species_id>": { "grid": [16 strings], "behaviors": [...] }, ... }
    - "grid"      : 16 rows of 16 chars (see PALETTE; '.'/' ' = transparent).
    - "behaviors" : behavior ids to render a sheet for. May be omitted if "bag"
                    is given, in which case it's the de-duplicated bag.
    - any other keys (display_name, rarity, speed, bag, ...) are ignored by the
      forge but used by tools/sprite_forge/build_seeds.py to emit the seed SQL.
    - keys starting with "_" are skipped (reserved for file-level metadata).

Output (default): fastapi-server/pet_assets/
    <species_id>/<behavior>.png        e.g. desk_gun/wander.png  (384x64, 6 frames)
    _silhouettes/<species_id>.png      one dark 64x64 preview per species

The frame counts / fps below MUST match the `animations` JSON in each species'
pet_species seed row (docs/todo.md §C). They are the single source of truth here;
build_seeds.py reads them straight from BEHAVIOR_ANIM so the SQL can't drift.
"""

import argparse
import glob
import json
import math
import os
import struct
import sys
import zlib

# --------------------------------------------------------------------------- #
#  1. PNG encoder  (stdlib only — color type 6 = RGBA, 8-bit)                  #
# --------------------------------------------------------------------------- #

def write_png(path, width, height, pixels):
    """pixels: list[height] of list[width] of (r,g,b,a) tuples."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0 (None) per scanline
        for (r, g, b, a) in row:
            raw += bytes((r & 255, g & 255, b & 255, a & 255))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


# --------------------------------------------------------------------------- #
#  2. Palette  —  one char per colour. '.' and ' ' are transparent.           #
# --------------------------------------------------------------------------- #

T = (0, 0, 0, 0)  # transparent
PALETTE = {
    ".": T, " ": T,
    "K": (38, 38, 46, 255),     # outline / black
    "D": (90, 96, 110, 255),    # dark gray (metal)
    "L": (175, 182, 196, 255),  # light gray
    "W": (240, 242, 248, 255),  # white
    "E": (24, 24, 28, 255),     # eye
    "R": (220, 60, 70, 255),    # red
    "O": (240, 150, 50, 255),   # orange
    "Y": (245, 210, 70, 255),   # yellow
    "G": (90, 190, 95, 255),    # green
    "B": (70, 120, 220, 255),   # blue
    "C": (90, 215, 230, 255),   # cyan
    "P": (170, 90, 220, 255),   # purple
    "M": (140, 92, 60, 255),    # brown
    "S": (235, 200, 165, 255),  # skin/tan
    "X": (60, 60, 70, 255),     # gunmetal dark
    "N": (235, 130, 170, 255),  # pink (pigs, icing, axolotls, shrimp)
    "U": (95, 58, 36, 255),     # dark brown / crust / shadow
    "V": (130, 215, 95, 255),   # lime / slime / radioactive
    "I": (120, 200, 255, 255),  # ice / BSOD blue / milk-glow
}

CELL = 4   # each ASCII cell -> CELL x CELL pixels  (16 * 4 = 64px frame)
GRID = 16  # grids are 16x16
FRAME = GRID * CELL  # 64


# --------------------------------------------------------------------------- #
#  3. Behaviour animation styles                                              #
#     id -> (frames, fps, style). Style drives how frames are transformed.    #
#     Keep frames/fps in sync with the pet_species `animations` JSON.          #
# --------------------------------------------------------------------------- #

BEHAVIOR_ANIM = {
    "idle":          (6, 4,  "breathe"),
    "wander":        (6, 7,  "walk"),
    "walk":          (6, 7,  "walk"),
    "follow_cursor": (6, 9,  "walk"),
    "sleep":         (4, 2,  "sleep"),
    "dash":          (4, 14, "run"),
    "run":           (6, 10, "run"),
    "dance":         (6, 10, "dance"),
    "recoil":        (4, 12, "recoil"),
    "teleport":      (6, 10, "fade"),
    "spin":          (6, 12, "spin"),
    "flee_cursor":   (6, 12, "run"),
    "jitter":        (6, 16, "jitter"),
    "hop":           (6, 9,  "hop"),
    # ---- new behaviours for the bonus lootboxes ----
    "orbit":         (6, 9,  "walk"),     # circles the cursor like a moon
    "zoomies":       (6, 14, "run"),      # full-speed dash across the screen
    "roll":          (6, 12, "spin"),     # rolls along the floor (round pets)
    "float":         (6, 6,  "float"),    # ghostly hover, ignores the ground
    "headbang":      (6, 12, "headbang"), # violent metal nodding, in place
    "vibrate":       (6, 18, "buzz"),     # ultra micro-shake, ~no net travel
    "backflip":      (6, 12, "flip"),     # parabolic flip with fake rotation
    "panic":         (6, 16, "panic"),    # frantic running in all directions
}


def frame_offsets(style, i, n):
    """Return (dx, dy, tilt, alpha, leg, squash) for frame i of n."""
    p = i / n
    s = math.sin(2 * math.pi * p)
    dx = dy = tilt = leg = 0
    alpha = 1.0
    squash = 1.0
    if style == "breathe":
        dy = -round(2 * abs(math.sin(math.pi * p)))
        squash = 1.0 + 0.04 * math.sin(2 * math.pi * p)
    elif style == "walk":
        dy = -round(2 * abs(s))
        leg = 3 if i % 2 == 0 else -3
        dx = round(1 * s)
    elif style == "run":
        dy = -round(3 * abs(s))
        leg = 5 if i % 2 == 0 else -5
        tilt = 3              # leaning forward
    elif style == "sleep":
        dy = round(2 * abs(math.sin(math.pi * p)))   # sinks down, breathing
        squash = 1.0 - 0.06 * abs(math.sin(math.pi * p))
    elif style == "dance":
        tilt = 6 if i % 2 == 0 else -6
        dy = -round(3 * abs(s))
    elif style == "recoil":
        # snap back then ease forward
        dx = [-8, -4, -1, 0][i % 4]
        dy = -round(1.5 * abs(s))
    elif style == "fade":
        alpha = 0.25 + 0.75 * (0.5 + 0.5 * math.cos(2 * math.pi * p))
        dy = -round(2 * s)
    elif style == "spin":
        # horizontal squash to fake rotation
        squash = abs(math.cos(math.pi * p))
        squash = max(0.18, squash)  # never fully invisible; keep a sliver
    elif style == "jitter":
        # deterministic pseudo-jitter from the frame index
        dx = ((i * 37) % 5) - 2
        dy = ((i * 53) % 5) - 2
    elif style == "hop":
        # parabolic jump arc
        h = -round(10 * math.sin(math.pi * p))
        dy = h
        squash = 1.0 + (0.10 if i in (0, n - 1) else -0.05)
    elif style == "float":
        # ghostly hover: slow vertical bob + gentle horizontal sway, no legs
        dy = -round(4 * math.sin(math.pi * p))
        dx = round(2 * math.sin(2 * math.pi * p))
        squash = 1.0 + 0.05 * math.sin(2 * math.pi * p)
    elif style == "headbang":
        # whip the head down and up — top of the body swings hard
        dy = -round(5 * abs(s))
        tilt = 11 if i % 2 == 0 else -3
    elif style == "buzz":
        # ultra-fine vibration, smaller + faster-feeling than jitter
        dx = ((i * 7) % 3) - 1
        dy = ((i * 5) % 3) - 1
    elif style == "flip":
        # parabolic hop; the fake rotation is applied via hsquash in build_frame
        dy = -round(12 * math.sin(math.pi * p))
        squash = max(0.18, abs(math.cos(math.pi * p)))
    elif style == "panic":
        # frantic: jerky offsets + a manic lean that flips every frame
        dx = ((i * 41) % 7) - 3
        dy = -round(3 * abs(s))
        tilt = 9 if i % 2 == 0 else -9
    return dx, dy, tilt, alpha, leg, squash


# --------------------------------------------------------------------------- #
#  4. Rasterise base grid -> pixel buffer, then transform per frame           #
# --------------------------------------------------------------------------- #

def rasterize(grid):
    """ASCII grid (list of strings) -> FRAME x FRAME list of (r,g,b,a)."""
    rows = [r.ljust(GRID, ".")[:GRID] for r in grid]
    rows = (rows + ["." * GRID] * GRID)[:GRID]
    buf = [[T] * FRAME for _ in range(FRAME)]
    for gy, line in enumerate(rows):
        for gx, ch in enumerate(line):
            col = PALETTE.get(ch, T)
            if col[3] == 0:
                continue
            for sy in range(CELL):
                for sx in range(CELL):
                    buf[gy * CELL + sy][gx * CELL + sx] = col
    return buf


def sample(buf, x, y):
    if 0 <= y < FRAME and 0 <= x < FRAME:
        return buf[y][x]
    return T


def transform(buf, dx, dy, tilt, alpha, leg, squash):
    out = [[T] * FRAME for _ in range(FRAME)]
    cy = FRAME / 2
    cx = FRAME / 2
    for y in range(FRAME):
        # squash is vertical-from-the-feet (feet stay at row FRAME-1)
        src_y = (FRAME - 1) - (FRAME - 1 - y) / squash
        row_tilt = round(tilt * ((cy - y) / cy))      # top shifts vs bottom
        leg_off = leg if y > FRAME * 0.68 else 0       # only the lower body
        for x in range(FRAME):
            src_x = x - dx - row_tilt - leg_off
            # squash horizontally around centre (used by 'spin')
            src_x = cx + (src_x - cx) / max(squash if False else 1.0, 1e-6)
            sx = int(round(src_x))
            sy = int(round(src_y - dy))
            r, g, b, a = sample(buf, sx, sy)
            if a:
                out[y][x] = (r, g, b, max(0, min(255, int(a * alpha))))
    return out


def hsquash(buf, factor):
    """Horizontal squash around centre — used to fake the disco-ball spin."""
    out = [[T] * FRAME for _ in range(FRAME)]
    cx = FRAME / 2
    for y in range(FRAME):
        for x in range(FRAME):
            src = cx + (x - cx) / max(factor, 1e-6)
            sx = int(round(src))
            out[y][x] = sample(buf, sx, y)
    return out


def build_frame(base, style, i, n):
    dx, dy, tilt, alpha, leg, squash = frame_offsets(style, i, n)
    if style in ("spin", "flip"):
        # squash is consumed by hsquash (fake rotation); carry dx/dy/tilt through
        framed = hsquash(base, squash)
        return transform(framed, dx, dy, tilt, alpha, leg, 1.0)
    return transform(base, dx, dy, tilt, alpha, leg, squash)


def build_sheet(base, behavior):
    frames, _fps, style = BEHAVIOR_ANIM[behavior]
    sheet = [[T] * (FRAME * frames) for _ in range(FRAME)]
    for i in range(frames):
        fr = build_frame(base, style, i, frames)
        for y in range(FRAME):
            for x in range(FRAME):
                sheet[y][i * FRAME + x] = fr[y][x]
    return sheet, frames


def build_silhouette(base):
    out = [[T] * FRAME for _ in range(FRAME)]
    for y in range(FRAME):
        for x in range(FRAME):
            if base[y][x][3]:
                out[y][x] = (30, 30, 40, 235)
    return out


# --------------------------------------------------------------------------- #
#  5. The pet roster  —  loaded from JSON files in pets/ (see module docstring) #
#     base_pets.json is the original roster; every bonus lootbox adds its own.  #
# --------------------------------------------------------------------------- #

def default_pets_dir():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "pets")


def discover_pet_files():
    """All pets/*.json, sorted so base_pets.json loads first (alphabetical)."""
    return sorted(glob.glob(os.path.join(default_pets_dir(), "*.json")))


def load_pets(paths):
    """Merge pet definitions from one or more JSON files into one dict.

    Each file maps species_id -> {"grid": [...], "behaviors"|"bag": [...], ...}.
    Keys starting with "_" are skipped (reserved for file-level metadata). Extra
    keys (display_name, rarity, speed, ...) are ignored by the forge but read by
    build_seeds.py. On an id clash the later file wins (and we warn).
    """
    pets = {}
    for path in paths:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for species_id, spec in data.items():
            if species_id.startswith("_"):
                continue
            if "behaviors" not in spec:
                # de-duplicate the weighted bag, preserving first-seen order
                spec["behaviors"] = list(dict.fromkeys(spec.get("bag", [])))
            if species_id in pets:
                print("  ! duplicate species '%s' (in %s) -- overriding earlier one"
                      % (species_id, os.path.basename(path)))
            pets[species_id] = spec
    return pets


# --------------------------------------------------------------------------- #
#  6. Driver                                                                   #
# --------------------------------------------------------------------------- #

def default_out():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    return os.path.join(repo, "fastapi-server", "pet_assets")


def build(out_dir, pets, only=None):
    count = 0
    for species, spec in pets.items():
        if only and species != only:
            continue
        base = rasterize(spec["grid"])
        for behavior in spec["behaviors"]:
            if behavior not in BEHAVIOR_ANIM:
                print(f"  ! {species}: unknown behavior '{behavior}', skipping")
                continue
            sheet, frames = build_sheet(base, behavior)
            path = os.path.join(out_dir, species, f"{behavior}.png")
            write_png(path, FRAME * frames, FRAME, sheet)
            count += 1
            print(f"  + {species}/{behavior}.png  ({FRAME * frames}x{FRAME}, {frames} frames)")
        sil = build_silhouette(base)
        sil_path = os.path.join(out_dir, "_silhouettes", f"{species}.png")
        write_png(sil_path, FRAME, FRAME, sil)
        count += 1
        print(f"  + _silhouettes/{species}.png  ({FRAME}x{FRAME})")
    print(f"\nDone. Wrote {count} PNG(s) to {out_dir}")


def main():
    ap = argparse.ArgumentParser(description="ASCII art -> animated pixel sprite sheets")
    ap.add_argument("--out", default=default_out(), help="output directory (default: fastapi-server/pet_assets)")
    ap.add_argument("--only", help="only build this species_id")
    ap.add_argument("--pets", action="append", metavar="FILE",
                    help="pet JSON file to load (repeatable; default: all pets/*.json)")
    ap.add_argument("--list", action="store_true", help="list species + behaviors and exit")
    args = ap.parse_args()

    pet_files = args.pets if args.pets else discover_pet_files()
    if not pet_files:
        print(f"No pet files found in {default_pets_dir()} (and none passed via --pets).",
              file=sys.stderr)
        sys.exit(1)
    pets = load_pets(pet_files)
    if not pets:
        print("Loaded 0 species — check your pet JSON files.", file=sys.stderr)
        sys.exit(1)

    if args.list:
        for species, spec in pets.items():
            print(f"{species:18s} -> {', '.join(spec['behaviors'])}")
        print("\nBehaviour styles:")
        for b, (frames, fps, style) in BEHAVIOR_ANIM.items():
            print(f"  {b:14s} {frames} frames @ {fps}fps  ({style})")
        return

    if args.only and args.only not in pets:
        print(f"Unknown species '{args.only}'. Known: {', '.join(pets)}", file=sys.stderr)
        sys.exit(1)

    print(f"Building sprites -> {args.out}")
    build(args.out, pets, only=args.only)


if __name__ == "__main__":
    main()
