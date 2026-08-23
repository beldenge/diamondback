"""Dust transparent-sprite decoder.

Ported from DFET DFfile::writeTransPNGimage. Used for PUP faces and CST
actor frames. SET/MOV stills use a different codec and are not here.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

from PIL import Image


class ImageError(Exception):
    """Sprite container could not be decoded."""


@dataclass(frozen=True)
class Palette:
    colors: list[tuple[int, int, int]]  # RGB, 8-bit

    @classmethod
    def from_container(
        cls,
        data: bytes,
        offset: int,
        count: int = 256,
        unused_rgb: tuple[int, int, int] = (0, 0, 0),
    ) -> "Palette":
        needed = offset + count * 8
        if needed > len(data):
            raise ImageError(f"palette overruns container (need {needed}, have {len(data)})")
        colors: list[tuple[int, int, int]] = []
        for index in range(count):
            _idx, red, green, blue = struct.unpack_from("<hhhh", data, offset + index * 8)
            if red == -1 and green == -1 and blue == -1:
                # Unused 8.8 is 0xFFFF. High byte is 255; CST Help's robe
                # needs the collapse to black, INVEN HUD holes need white.
                colors.append(unused_rgb)
            else:
                colors.append(
                    ((red >> 8) & 0xFF, (green >> 8) & 0xFF, (blue >> 8) & 0xFF)
                )
        return cls(colors)

    def rgba(self, index: int) -> tuple[int, int, int, int]:
        red, green, blue = self.colors[index]
        return red, green, blue, 255

    def still_rgba(self, index: int) -> tuple[int, int, int, int]:
        """RGB for SET/MOV/FLT stills.

        DFET's BMP writer hard-codes VGA ends: index 0 black, index 255
        white. Dust stores 255 as (0,0,0) and 0 as unused (-1,-1,-1);
        using the stored 255 turns the O7 ox skull into a black hole.
        Transparent sprites keep ``rgba`` (no VGA override).
        """
        if index == 0:
            return 0, 0, 0, 255
        if index == 255:
            return 255, 255, 255, 255
        return self.rgba(index)

    @cached_property
    def still_plte(self) -> bytes:
        """768-byte RGB palette for paletted still PNGs, with VGA ends."""
        table = bytearray(len(self.colors) * 3)
        for index, (red, green, blue) in enumerate(self.colors):
            if index == 0:
                red, green, blue = 0, 0, 0
            elif index == 255:
                red, green, blue = 255, 255, 255
            base = index * 3
            table[base] = red
            table[base + 1] = green
            table[base + 2] = blue
        return bytes(table)


@dataclass
class Sprite:
    width: int
    height: int
    pos_x: int
    pos_y: int
    rgba: bytes  # height * width * 4, top-to-bottom


# CST foot mattes are a dark maroon (GANG index 131 = 25,17,17). Dust
# painted them as contact shadows; opaque RGB looks like studio dirt.
# Pure black (index 0, max(rgb) < MIN) is unused or clothing — Help's
# robe is (0,0,0). Treating it as a matte makes the coat see-through.
CONTACT_SHADOW_ALPHA = 120
CONTACT_SHADOW_MIN = 8
CONTACT_SHADOW_MAX = 50
TRANSPARENT_INDEX = 255


def decode_trans_indices(container: bytes) -> tuple[int, int, int, int, bytes]:
    """Palette indices, 255 = codec transparency. Same RLE as decode_trans_sprite."""
    if len(container) < 8:
        raise ImageError("sprite container smaller than header")
    height, width, raw_y, raw_x = struct.unpack_from("<hhhh", container, 0)
    if width <= 0 or height <= 0 or width > 4096 or height > 4096:
        raise ImageError(f"implausible sprite size {width}x{height}")

    pos_y = 384 // 2 - raw_y
    pos_x = 512 // 2 - raw_x

    indices = bytearray(width * height)
    for i in range(len(indices)):
        indices[i] = TRANSPARENT_INDEX
    src = 8
    dst = 0
    row = 0
    while row < height:
        if src + 2 > len(container):
            raise ImageError(f"row {row}: missing segment size")
        segment_size = struct.unpack_from("<h", container, src)[0]
        src += 2
        if segment_size < 0 or src + segment_size > len(container):
            raise ImageError(f"row {row}: segment overruns container")
        end = src + segment_size
        row_end = (row + 1) * width
        while src < end:
            flag = container[src]
            src += 1
            copy = flag >> 2
            if dst + copy > row_end:
                copy = max(0, row_end - dst)
            if flag & 1:
                if flag & 2:
                    for _ in range(copy):
                        if src >= end:
                            raise ImageError(f"row {row}: mode-4 ran out of input")
                        indices[dst] = container[src]
                        src += 1
                        dst += 1
                else:
                    dst += copy
            elif flag & 2:
                if src >= end:
                    raise ImageError(f"row {row}: mode-repeat ran out of input")
                color = container[src]
                src += 1
                for _ in range(copy):
                    if dst >= row_end:
                        break
                    indices[dst] = color
                    dst += 1
            else:
                prev = dst - width
                if prev < 0:
                    raise ImageError(f"row {row}: copy-from-previous on first row")
                indices[dst : dst + copy] = indices[prev : prev + copy]
                dst += copy
        row += 1
        dst = row * width

    return width, height, pos_x, pos_y, bytes(indices)


def contact_shadow_mask(
    width: int, height: int, indices: bytes, shadow_indices: set[int] | frozenset[int]
) -> set[int]:
    """Shadow-index pixels 4-connected to the bottom edge (the foot blob)."""
    if not shadow_indices:
        return set()
    queue: list[int] = []
    y = height - 1
    row = y * width
    for x in range(width):
        i = row + x
        if indices[i] in shadow_indices:
            queue.append(i)
    seen: set[int] = set()
    while queue:
        i = queue.pop()
        if i in seen:
            continue
        seen.add(i)
        x = i % width
        y = i // width
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx = x + dx
            ny = y + dy
            if 0 <= nx < width and 0 <= ny < height:
                j = ny * width + nx
                if j not in seen and indices[j] in shadow_indices:
                    queue.append(j)
    return seen


def colorize_sprite(
    width: int,
    height: int,
    pos_x: int,
    pos_y: int,
    indices: bytes,
    palette: Palette,
    shadow_indices: frozenset[int] | set[int] | None = None,
    transparent_indices: frozenset[int] | set[int] | None = None,
) -> Sprite:
    shadows = shadow_indices or frozenset()
    keyed = set(transparent_indices or ())
    keyed.add(TRANSPARENT_INDEX)
    foot = contact_shadow_mask(width, height, indices, shadows)
    pixels = bytearray(width * height * 4)
    for i, index in enumerate(indices):
        if index in keyed:
            continue
        dest = i * 4
        # Foot-blob only. The same index on the body is clothes (Help's
        # dark folds), not leftover chroma — keep those pixels opaque.
        if index in shadows and i in foot:
            pixels[dest : dest + 4] = bytes((0, 0, 0, CONTACT_SHADOW_ALPHA))
            continue
        red, green, blue, alpha = palette.rgba(index)
        pixels[dest] = red
        pixels[dest + 1] = green
        pixels[dest + 2] = blue
        pixels[dest + 3] = alpha
    return Sprite(
        width=width, height=height, pos_x=pos_x, pos_y=pos_y, rgba=bytes(pixels)
    )


def decode_trans_sprite(
    container: bytes,
    palette: Palette,
    shadow_indices: frozenset[int] | set[int] | None = None,
    transparent_indices: frozenset[int] | set[int] | None = None,
) -> Sprite:
    width, height, pos_x, pos_y, indices = decode_trans_indices(container)
    return colorize_sprite(
        width,
        height,
        pos_x,
        pos_y,
        indices,
        palette,
        shadow_indices,
        transparent_indices,
    )


def write_png(path: Path, sprite: Sprite) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.frombytes("RGBA", (sprite.width, sprite.height), sprite.rgba)
    image.save(path, format="PNG")


def sprite_record(
    sprite: Sprite,
    rel: str,
    extra: dict | None = None,
) -> dict:
    """Placement on the 512×384 DreamFactory stage (top-left origin)."""
    rec = {
        "path": rel.replace("\\", "/"),
        "x": sprite.pos_x,
        "y": sprite.pos_y,
        "w": sprite.width,
        "h": sprite.height,
    }
    if extra:
        rec.update(extra)
    return rec


def pup_palette(header: bytes) -> Palette:
    return Palette.from_container(header, 58)


def cst_palette(header: bytes) -> Palette:
    return Palette.from_container(header, 36)


def find_palette(
    data: bytes, unused_rgb: tuple[int, int, int] = (0, 0, 0)
) -> Palette | None:
    """Find a 256-entry ColorPalette by incrementing index 0,1,2."""
    limit = len(data) - 24
    for offset in range(0, min(limit, 4096), 2):
        if (
            struct.unpack_from("<h", data, offset)[0] == 0
            and struct.unpack_from("<h", data, offset + 8)[0] == 1
            and struct.unpack_from("<h", data, offset + 16)[0] == 2
        ):
            try:
                return Palette.from_container(data, offset, unused_rgb=unused_rgb)
            except ImageError:
                continue
    return None


@dataclass
class IndexedImage:
    width: int
    height: int
    pixels: bytes  # 8-bit indices, top-to-bottom
    z_pixels: bytes | None = None
    consumed: int = 0  # bytes of color stream used; leftover may be a Z plane


def decode_indexed_image(
    container: bytes,
    prior: bytes | None = None,
    *,
    decode_z: bool = False,
) -> IndexedImage:
    """Port of DFET getRawImageData (SET / MOV / some FLT stills).

    DFET reuses one decode buffer and does not clear it. Skip spans
    (mode 2 / row param 10) keep whatever was already there — usually
    the previous frame in the same movie or walk cycle.

    Trailing Z-scanlines are parsed when ``decode_z`` is true. Dust
    offsets are from the start of the Z table (first offset is
    ``height * 2``). Writing Z PNGs is a separate ``--z`` flag.
    """
    if len(container) < 6:
        raise ImageError("indexed image smaller than header")
    height, width = struct.unpack_from("<hh", container, 0)
    if width <= 0 or height <= 0 or width > 2048 or height > 2048:
        raise ImageError(f"implausible indexed size {width}x{height}")

    total = height * width
    if prior is not None and len(prior) == total:
        out = bytearray(prior)
    else:
        out = bytearray(total)
    src = 4
    dst = 0
    look = 0

    def need(n: int) -> None:
        if src + n > len(container):
            raise ImageError("indexed image ran out of input")

    for _row in range(height):
        need(1)
        param = container[src] >> 2
        src += 1
        filled = 0

        if param == 1:
            need(width)
            out[dst : dst + width] = container[src : src + width]
            src += width
            dst += width
            filled = width
        if param <= 5:
            look = width * (6 - param)
        elif param <= 9:
            look = width * (5 - param)
        elif param == 10:
            filled = width
            dst += width
        elif param <= 14:
            look = width * (15 - param)
            _copy_back(out, dst, look, width)
            dst += width
            filled = width
        elif param <= 18:
            look = width * (14 - param)
            _copy_back(out, dst, look, width)
            dst += width
            filled = width
        else:
            raise ImageError(f"unknown row param {param}")

        while filled < width:
            need(1)
            control = container[src]
            src += 1
            mode = control & 7
            count = control >> 3
            if count == 0:
                need(1)
                count = 32 + container[src]
                src += 1
            if count <= 0 or dst + count > total:
                raise ImageError(f"bad span count {count} at dst {dst}")

            if mode == 2:
                pass
            elif mode == 3:
                _copy_back(out, dst, look, count)
            elif mode == 4:
                prev = out[dst - 1] if dst else 0
                out[dst : dst + count] = bytes([prev]) * count
            elif mode == 5:
                need(count)
                out[dst : dst + count] = container[src : src + count]
                src += count
            elif mode == 6:
                need(1)
                out[dst : dst + count] = bytes([container[src]]) * count
                src += 1
            elif mode == 7:
                need(2)
                back = struct.unpack_from("<H", container, src)[0]
                src += 2
                _copy_back(out, dst, back, count)
            elif mode in (0, 1):
                src = _decode_delta_span(
                    container, src, out, dst, count, mode, look
                )
            else:
                raise ImageError(f"unknown span mode {mode}")

            filled += count
            dst += count

    z_pixels = None
    if decode_z and src < len(container) and src + height * 2 <= len(container):
        try:
            z_pixels = _decode_z(container, src, width, height)
        except ImageError:
            z_pixels = None

    return IndexedImage(
        width=width,
        height=height,
        pixels=bytes(out),
        z_pixels=z_pixels,
        consumed=src,
    )


def _copy_back(out: bytearray, dst: int, offset: int, count: int) -> None:
    """Copy ``count`` pixels from ``dst - offset``.

    ``offset`` is a (possibly negative) look-back. DFET does
    ``memcpy(dst, dst - lookUpOffset, count)``. When ``lookUpOffset`` is
    negative this reads *ahead* into pixels not yet overwritten — the
    previous framebuffer's later rows. Treating negative look as "do
    nothing" left those spans as stale/wrong indices (sky speckles on
    the L7 sheriff wall).
    """
    start = dst - offset
    end = start + count
    if count <= 0 or start < 0 or end > len(out) or dst + count > len(out):
        return
    # Slice read copies first, so overlapping src/dst is safe (DFET memcpy).
    out[dst : dst + count] = out[start:end]


def _decode_delta_span(
    src_data: bytes,
    src: int,
    out: bytearray,
    dst: int,
    count: int,
    mode: int,
    look: int,
) -> int:
    """Port of DFET getRawImageData modes 000 / 001.

    Flag bits live in a 4-byte little-endian word, matching DFET's
    `uint32_t flags` byte poking (`flags+3` is the first input byte).
    """
    out_i = 0
    single = 1
    if mode == 0:
        if src >= len(src_data):
            raise ImageError("delta span missing literal")
        out[dst] = src_data[src]
        src += 1
        out_i = 1
    else:
        single = look

    if count <= out_i:
        return src

    fb = bytearray(4)
    for i in range(4):
        fb[3 - i] = src_data[src + i] if src + i < len(src_data) else 0
    src += 2
    bit_pos = 16

    def u32() -> int:
        return fb[0] | (fb[1] << 8) | (fb[2] << 16) | (fb[3] << 24)

    def set_u32(value: int) -> None:
        value &= 0xFFFFFFFF
        fb[0] = value & 0xFF
        fb[1] = (value >> 8) & 0xFF
        fb[2] = (value >> 16) & 0xFF
        fb[3] = (value >> 24) & 0xFF

    while out_i < count:
        flags = u32()
        first = 0
        bit = 0x80000000
        for i in range(15, -1, -1):
            if flags & bit:
                first = i
                break
            bit >>= 1

        prev_i = dst + out_i - single
        prev = out[prev_i] if 0 <= prev_i < len(out) else 0

        if first == 0xF:
            out[dst + out_i] = prev
            bit_pos -= 1
            set_u32(flags << 1)
        elif first < 0x8:
            mixed = (fb[2] + prev) & 0xFF
            fb[2] = mixed
            out[dst + out_i] = mixed
            bit_pos -= 16
            set_u32(u32() << 16)
        else:
            difference = 15 - first
            if flags & (1 << (first + 15)):
                out[dst + out_i] = (prev + difference) & 0xFF
            else:
                out[dst + out_i] = (prev - difference) & 0xFF
            bit_pos -= difference + 2
            set_u32(flags << (difference + 2))

        if bit_pos < 0:
            shift = -bit_pos
            set_u32(u32() >> shift)
            src += 2
            fb[1] = src_data[src] if src < len(src_data) else 0
            fb[0] = src_data[src + 1] if src + 1 < len(src_data) else 0
            set_u32(u32() << shift)
            bit_pos += 16
        out_i += 1

    if bit_pos >= 8:
        src -= 1
    return src


def write_z_png(path: Path, image: IndexedImage) -> None:
    """8-bit grayscale PNG of the still's depth plane, if present."""
    if not image.z_pixels:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.frombytes("L", (image.width, image.height), image.z_pixels).save(
        path, format="PNG"
    )


def write_indexed_png(path: Path, image: IndexedImage, palette: Palette) -> None:
    """Write a paletted PNG whose PLTE matches ``still_rgba``.

    Stills are already 8-bit indices. Expanding to RGBA in Python and
    compressing 4× the samples dominated full-dump time; viewers expand
    the palette on load the same way.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    _still_pil(image, palette).save(path, format="PNG")


def still_rgb24(image: IndexedImage, palette: Palette) -> bytes:
    """Packed RGB24 for ffmpeg ``-pix_fmt rgb24``, VGA still ends."""
    return _still_pil(image, palette).convert("RGB").tobytes()


def _still_pil(image: IndexedImage, palette: Palette) -> Image.Image:
    png = Image.frombytes("P", (image.width, image.height), image.pixels)
    png.putpalette(palette.still_plte)
    return png


def _decode_z(container: bytes, src: int, width: int, height: int) -> bytes:
    """RLE depth plane. Offsets are from ``src`` (the table), not after it."""
    total = width * height
    zbuf = bytearray(total)
    table = src
    dst = 0
    for row in range(height):
        offset = struct.unpack_from("<H", container, table + row * 2)[0]
        ptr = table + offset
        if ptr >= len(container):
            raise ImageError("z-scanline offset out of range")
        segs = container[ptr]
        ptr += 1
        for _ in range(segs):
            if ptr + 2 > len(container):
                raise ImageError("z-scanline truncated")
            count = container[ptr]
            value = container[ptr + 1]
            ptr += 2
            if dst + count > total:
                raise ImageError("z-buffer overrun")
            zbuf[dst : dst + count] = bytes([value]) * count
            dst += count
    return bytes(zbuf)
