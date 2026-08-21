"""Dump PE resources from DF.EXE (cursors, menu, string tables, CLUTs).

Stdlib only. Cursor PNGs are written with a tiny zlib PNG encoder.
"""

from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path
from typing import Any

from pe import PeImage

TYPE_NAMES = {
    1: "CURSOR",
    2: "BITMAP",
    3: "ICON",
    4: "MENU",
    5: "DIALOG",
    6: "STRING",
    9: "ACCELERATOR",
    10: "RCDATA",
    12: "GROUP_CURSOR",
    14: "GROUP_ICON",
    16: "VERSION",
    24: "MANIFEST",
}

MF_POPUP = 0x10
MF_END = 0x80


def dump_pe_resources(image: PeImage, dest: Path) -> list[Path]:
    entries = list_resources(image)
    dest.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    groups = [e for e in entries if e["type"] == "GROUP_CURSOR"]
    cursors = {e["name"]: e for e in entries if e["type"] == "CURSOR"}
    cursor_meta: list[dict[str, Any]] = []
    cur_dir = dest / "cursors"
    cur_dir.mkdir(exist_ok=True)

    for group in groups:
        blob = _blob(image, group)
        n_id = _group_cursor_id(blob)
        script_name = _cursor_script_name(group["name"])
        raw = cursors.get(n_id)
        if raw is None:
            continue
        data = _blob(image, raw)
        xhot, yhot, rgba = decode_rt_cursor(data)
        png_path = cur_dir / f"{script_name}.png"
        cur_path = cur_dir / f"{script_name}.cur"
        write_png_rgba(png_path, 32, 32, rgba)
        write_cur_file(cur_path, xhot, yhot, data[4:])
        written.extend([png_path, cur_path])
        cursor_meta.append(
            {
                "script": script_name,
                "resource": group["name"],
                "id": n_id,
                "hotspot": [xhot, yhot],
                "png": png_path.relative_to(dest).as_posix(),
                "cur": cur_path.relative_to(dest).as_posix(),
            }
        )

    cursors_json = dest / "cursors.json"
    cursors_json.write_text(json.dumps(cursor_meta, indent=2) + "\n", encoding="utf-8")
    written.append(cursors_json)

    menu_entries = [e for e in entries if e["type"] == "MENU"]
    menus: list[dict[str, Any]] = []
    for menu in menu_entries:
        blob = _blob(image, menu)
        menus.append({"name": menu["name"], "items": parse_menu(blob)})
    menu_json = dest / "menu.json"
    menu_json.write_text(json.dumps(menus, indent=2) + "\n", encoding="utf-8")
    written.append(menu_json)

    strings: dict[str, list[str]] = {}
    for entry in entries:
        if entry["type"] != "STRING":
            continue
        block_id = int(entry["name"]) if str(entry["name"]).isdigit() else entry["name"]
        strings[str(block_id)] = parse_string_block(_blob(image, entry), int(block_id) if isinstance(block_id, int) else 0)
    strings_json = dest / "strings.json"
    strings_json.write_text(json.dumps(strings, indent=2) + "\n", encoding="utf-8")
    written.append(strings_json)

    clut_dir = dest / "clut"
    clut_dir.mkdir(exist_ok=True)
    for entry in entries:
        if entry["type"] != "RCDATA":
            continue
        name = str(entry["name"])
        blob = _blob(image, entry)
        raw_path = clut_dir / f"{_safe(name)}.bin"
        raw_path.write_bytes(blob)
        written.append(raw_path)
        if name.upper().startswith("CLUT.") and len(blob) >= 2048:
            colors = _clut_rgb(blob[-2048:] if len(blob) > 2048 else blob)
            json_path = clut_dir / f"{_safe(name)}.json"
            json_path.write_text(json.dumps(colors) + "\n", encoding="utf-8")
            written.append(json_path)

    manifest = dest / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "source": image.path.name,
                "entries": [
                    {
                        "type": e["type"],
                        "name": e["name"],
                        "size": e["size"],
                    }
                    for e in entries
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    written.append(manifest)
    return written


def list_resources(image: PeImage) -> list[dict[str, Any]]:
    rsrc = next((s for s in image.sections if s.name.rstrip("\x00") == ".rsrc"), None)
    if rsrc is None:
        return []
    data = image.data
    rsrc_rva = rsrc.va
    rsrc_off = rsrc.raw

    def rva_to_off(rva: int) -> int | None:
        return image.rva_to_off(rva)

    found: list[dict[str, Any]] = []

    def walk(off: int, level: int, type_id: Any, name_id: Any) -> None:
        if off is None or off + 16 > len(data):
            return
        named, idcount = struct.unpack_from("<HH", data, off + 12)
        for i in range(named + idcount):
            eoff = off + 16 + i * 8
            name_or_id, dataoff = struct.unpack_from("<II", data, eoff)
            is_dir = bool(dataoff & 0x80000000)
            dataoff &= 0x7FFFFFFF
            if name_or_id & 0x80000000:
                n_off = rsrc_off + (name_or_id & 0x7FFFFFFF)
                nlen = struct.unpack_from("<H", data, n_off)[0]
                ident: Any = data[n_off + 2 : n_off + 2 + nlen * 2].decode(
                    "utf-16le", "replace"
                )
            else:
                ident = name_or_id
            child = rsrc_off + dataoff
            if is_dir:
                next_type = ident if level == 0 else type_id
                next_name = ident if level == 1 else name_id
                walk(child, level + 1, next_type, next_name)
                continue
            if child + 16 > len(data):
                continue
            data_rva, size, _cp, _res = struct.unpack_from("<IIII", data, child)
            blob_off = rva_to_off(data_rva)
            type_key = type_id if level else ident
            type_name = TYPE_NAMES.get(type_key, str(type_key)) if isinstance(type_key, int) else str(type_key)
            name_key = name_id if level >= 1 else ident
            found.append(
                {
                    "type": type_name,
                    "name": name_key,
                    "lang": ident if level >= 2 else 0,
                    "size": size,
                    "off": blob_off,
                    "rva": data_rva,
                }
            )

    walk(rsrc_off, 0, None, None)
    return found


def decode_rt_cursor(blob: bytes) -> tuple[int, int, bytes]:
    if len(blob) < 44:
        raise ValueError("cursor resource too small")
    xhot, yhot = struct.unpack_from("<HH", blob, 0)
    dib = blob[4:]
    _size, width, height, _planes, bitcount = struct.unpack_from("<IIIHH", dib, 0)
    img_h = height // 2 if height else 32
    img_w = width or 32
    if bitcount != 1 or img_w != 32 or img_h != 32:
        # Dust's cursors are all 32x32 1-bpp. Refuse surprises.
        raise ValueError(f"unexpected cursor format {img_w}x{img_h} {bitcount}bpp")
    pal_off = 40
    xor_off = pal_off + 8
    row_bytes = 4
    and_off = xor_off + row_bytes * img_h
    rgba = bytearray(img_w * img_h * 4)
    for y in range(img_h):
        src_y = img_h - 1 - y
        xor_row = xor_off + src_y * row_bytes
        and_row = and_off + src_y * row_bytes
        for x in range(img_w):
            byte_i = x // 8
            bit = 7 - (x % 8)
            xor_bit = (dib[xor_row + byte_i] >> bit) & 1
            and_bit = (dib[and_row + byte_i] >> bit) & 1
            dst = (y * img_w + x) * 4
            if and_bit:
                rgba[dst : dst + 4] = b"\x00\x00\x00\x00"
            else:
                b, g, r = dib[pal_off + xor_bit * 4 : pal_off + xor_bit * 4 + 3]
                rgba[dst : dst + 4] = bytes([r, g, b, 255])
    return xhot, yhot, bytes(rgba)


def write_png_rgba(path: Path, width: int, height: int, rgba: bytes) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)

    raw = b""
    stride = width * 4
    for y in range(height):
        raw += b"\x00" + rgba[y * stride : (y + 1) * stride]
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def write_cur_file(path: Path, xhot: int, yhot: int, dib: bytes) -> None:
    # ICONDIR + one ICONDIRENTRY + DIB. Cursor hotspots live in planes/bitcount.
    header = struct.pack("<HHH", 0, 2, 1)
    entry = struct.pack("<BBBBHHII", 32, 32, 2, 0, xhot, yhot, len(dib), 6 + 16)
    path.write_bytes(header + entry + dib)


def parse_menu(blob: bytes) -> list[dict[str, Any]]:
    if len(blob) < 4:
        return []
    pos = 4  # skip MENUHEADER
    return _parse_menu_items(blob, pos)[0]


def _parse_menu_items(blob: bytes, pos: int) -> tuple[list[dict[str, Any]], int]:
    items: list[dict[str, Any]] = []
    while pos + 2 <= len(blob):
        flags = struct.unpack_from("<H", blob, pos)[0]
        pos += 2
        item: dict[str, Any] = {"flags": flags}
        if flags & MF_POPUP:
            label, pos = _read_utf16z(blob, pos)
            item["label"] = label
            children, pos = _parse_menu_items(blob, pos)
            item["items"] = children
        else:
            if pos + 2 > len(blob):
                break
            item_id = struct.unpack_from("<H", blob, pos)[0]
            pos += 2
            label, pos = _read_utf16z(blob, pos)
            item["id"] = item_id
            item["label"] = label
        items.append(item)
        if flags & MF_END:
            break
    return items, pos


def parse_string_block(blob: bytes, block_id: int) -> list[str]:
    """16 strings per STRINGTABLE block. IDs are (block-1)*16 + index."""
    pos = 0
    out: list[str] = []
    for _ in range(16):
        if pos + 2 > len(blob):
            break
        slen = struct.unpack_from("<H", blob, pos)[0]
        pos += 2
        raw = blob[pos : pos + slen * 2]
        pos += slen * 2
        out.append(raw.decode("utf-16le", "replace") if slen else "")
    return out


def _read_utf16z(blob: bytes, pos: int) -> tuple[str, int]:
    chars: list[str] = []
    while pos + 1 < len(blob):
        w = struct.unpack_from("<H", blob, pos)[0]
        pos += 2
        if w == 0:
            break
        chars.append(chr(w) if w < 0x10000 else "?")
    return "".join(chars), pos


def _group_cursor_id(blob: bytes) -> int:
    # GRPICONDIR: reserved, type, count, then first entry's nID at +20 (WORD).
    if len(blob) < 20:
        return -1
    return struct.unpack_from("<H", blob, 18)[0]


def _cursor_script_name(resource_name: Any) -> str:
    text = str(resource_name)
    if text.upper().startswith("CURS."):
        return text.split(".", 1)[1].lower()
    return text.lower()


def _blob(image: PeImage, entry: dict[str, Any]) -> bytes:
    off = entry["off"]
    size = entry["size"]
    if off is None:
        return b""
    return image.data[off : off + size]


def _clut_rgb(blob: bytes) -> list[list[int]]:
    colors: list[list[int]] = []
    for i in range(256):
        _idx, red, green, blue = struct.unpack_from("<hhhh", blob, i * 8)
        colors.append([(red >> 8) & 0xFF, (green >> 8) & 0xFF, (blue >> 8) & 0xFF])
    return colors


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)
