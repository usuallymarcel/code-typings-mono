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

Usage
-----
    python tools/sprite_forge/ascii_to_sprites.py                 # build everything
    python tools/sprite_forge/ascii_to_sprites.py --only desk_gun # one species
    python tools/sprite_forge/ascii_to_sprites.py --list          # list species/behaviors
    python tools/sprite_forge/ascii_to_sprites.py --out some/dir  # override output dir

Output (default): fastapi-server/pet_assets/
    <species_id>/<behavior>.png        e.g. desk_gun/wander.png  (384x64, 6 frames)
    _silhouettes/<species_id>.png      one dark 64x64 preview per species

The frame counts / fps below MUST match the `animations` JSON in each species'
pet_species seed row (docs/todo.md §C). They are the single source of truth here;
copy them into the migration when you add a species.
"""

import argparse
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
    if style == "spin":
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
#  5. The pet roster  —  one base grid + behaviour list per species.          #
#     (The funny part. 16x16 grids; '.' is transparent.)                      #
# --------------------------------------------------------------------------- #

PETS = {
    # ---- the existing cat, given a server-side sheet so the gated pipeline works
    "cat": {
        "behaviors": ["idle", "wander", "follow_cursor", "sleep"],
        "grid": [
            "................",
            "..O..........O..",
            "..OO........OO..",
            "..OOOOOOOOOOOO..",
            "..OOEOOOOOOEOOO.",
            "..OOOOOWWOOOOO..",
            "..OOOOOOOOOOOO..",
            "..OOOOOOOOOOOO..",
            "..O.OOOOOOOO.O..",
            "...OOOOOOOOOO...",
            "...OOOOOOOOOO...",
            "...OO.OOOO.OO...",
            "....O.O..O.O....",
            "................",
            "................",
            "................",
        ],
    },
    # ---- common: a stick figure who likes to dance
    "stick_figure": {
        "behaviors": ["idle", "wander", "dance", "sleep"],
        "grid": [
            "................",
            ".....KKKK.......",
            "....K....K......",
            "....K.EE.K......",
            "....K.KK.K......",
            ".....KKKK.......",
            "......KK........",
            "..KKKKKKKKKKK...",
            "......KK........",
            "......KK........",
            "......KK........",
            ".....K..K.......",
            "....K....K......",
            "...K......K.....",
            "..K........K....",
            "................",
        ],
    },
    # ---- common: a pet rock. does almost nothing. that's the joke.
    "pet_rock": {
        "behaviors": ["idle", "sleep"],
        "grid": [
            "................",
            "................",
            "....DDDDDD......",
            "...DLLLLLLD.....",
            "..DLLLLLLLLD....",
            "..DLWWLLWWLD....",
            "..DLWELLWELD....",
            "..DLLLLLLLLD....",
            "..DLLLLLLLLD....",
            "..DLLLLLLLLD....",
            "...DLLLLLLD.....",
            "....DDDDDD......",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    # ---- uncommon: rubber duck, the debugging companion
    "rubber_duck": {
        "behaviors": ["idle", "wander", "follow_cursor", "sleep"],
        "grid": [
            "................",
            ".......YYYY.....",
            "......YYYYYY....",
            "......YYEYYY....",
            "....OOYYYYYY....",
            "....OOYYYYYY....",
            "......YYYYYY....",
            ".....YYYYYYYY...",
            "....YYYYYYYYYY..",
            "...YYYYYYYYYYYY.",
            "...YYYYYYYYYYYY.",
            "....YYYYYYYYYY..",
            ".....YYYYYYYY...",
            "................",
            "................",
            "................",
        ],
    },
    # ---- rare: a sidearm for your desktop. the "pet gun".
    "desk_gun": {
        "behaviors": ["idle", "wander", "recoil", "sleep"],
        "grid": [
            "................",
            "................",
            "................",
            "..XXXXXXXXXX....",
            "..XLLLLLLLLX....",
            "..XXXXXXXXXX....",
            "..XXX..X........",
            "....X..X........",
            "....XXXX........",
            "....XEEX........",
            "....XXXX........",
            "................",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    # ---- rare: 404 ghost. blinks out of existence. pet not found.
    "ghost_404": {
        "behaviors": ["idle", "wander", "teleport", "sleep"],
        "grid": [
            "................",
            "......WWWW......",
            ".....WWWWWW.....",
            "....WWWWWWWW....",
            "....WWEWWEWW....",
            "....WWWWWWWW....",
            "....WWWWWWWW....",
            "....WPWWWWPW....",
            "....WWWWWWWW....",
            "....WWWWWWWW....",
            "....WWWWWWWW....",
            "....W.WW.WW.W...",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    # ---- uncommon: a caffeinated mug. vibrates.
    "coffee_mug": {
        "behaviors": ["idle", "jitter", "wander", "sleep"],
        "grid": [
            "................",
            ".....L..L.......",
            "......L..L......",
            ".....L..L.......",
            "....WWWWWWW.....",
            "....WRRRRRW.WW..",
            "....WRRRRRWW.W..",
            "....WRRRRRW..W..",
            "....WRRRRRWW.W..",
            "....WRRRRRW.WW..",
            "....WWWWWWW.....",
            "....WWWWWWW.....",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    # ---- epic: bonk hammer. hops and bonks.
    "bonk_hammer": {
        "behaviors": ["idle", "hop", "wander"],
        "grid": [
            "................",
            "..DDDDDDDDDD....",
            "..DLLLLLLLLD....",
            "..DLLLLLLLLD....",
            "..DDDDDDDDDD....",
            ".....MM.........",
            ".....MM.........",
            ".....MM.........",
            ".....MM.........",
            ".....MM.........",
            ".....MM.........",
            "....MMMM........",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    # ---- epic: disco ball. spins, sparkles. (event pet)
    "disco_ball": {
        "behaviors": ["idle", "spin", "wander"],
        "grid": [
            ".......L........",
            ".......L........",
            ".....CCCCCC.....",
            "....CWCWCWCWC...",
            "...CWCWCWCWCW...",
            "...WCWCWCWCWC...",
            "...CWCWCWCWCW...",
            "...WCWCWCWCWC...",
            "...CWCWCWCWCW...",
            "....CWCWCWCWC...",
            ".....CCCCCC.....",
            "................",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    # ---- legendary: loot goblin. runs AWAY from your cursor. drops nothing.
    "loot_goblin": {
        "behaviors": ["idle", "flee_cursor", "wander", "sleep"],
        "grid": [
            "................",
            "......GGGG......",
            ".....GGGGGG.....",
            ".....GEGGEG.....",
            ".....GGGGGG.....",
            "......GGGG......",
            "....MMGGGGMM....",
            "...MMMGGGGMMM...",
            "...MMMGGGGMMM...",
            "....MMGGGGMM....",
            "......GGGG......",
            ".....G....G.....",
            "....G......G....",
            "................",
            "................",
            "................",
        ],
    },
    # ---- common: a semicolon the dev forgot. surprisingly lively.
    "semicolon": {
        "behaviors": ["idle", "wander", "sleep"],
        "grid": [
            "................",
            "................",
            "................",
            "......GGGG......",
            "......GGGG......",
            "......GGGG......",
            "................",
            "................",
            "......GGGG......",
            "......GGGG......",
            "......GGGG......",
            ".....GGG........",
            "....GGG.........",
            "...GG...........",
            "................",
            "................",
        ],
    },
}


# --------------------------------------------------------------------------- #
#  6. Driver                                                                   #
# --------------------------------------------------------------------------- #

def default_out():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    return os.path.join(repo, "fastapi-server", "pet_assets")


def build(out_dir, only=None):
    count = 0
    for species, spec in PETS.items():
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
    ap.add_argument("--list", action="store_true", help="list species + behaviors and exit")
    args = ap.parse_args()

    if args.list:
        for species, spec in PETS.items():
            print(f"{species:14s} -> {', '.join(spec['behaviors'])}")
        print("\nBehaviour styles:")
        for b, (frames, fps, style) in BEHAVIOR_ANIM.items():
            print(f"  {b:14s} {frames} frames @ {fps}fps  ({style})")
        return

    if args.only and args.only not in PETS:
        print(f"Unknown species '{args.only}'. Known: {', '.join(PETS)}", file=sys.stderr)
        sys.exit(1)

    print(f"Building sprites -> {args.out}")
    build(args.out, only=args.only)


if __name__ == "__main__":
    main()
