"""Write sprite placement sidecars (512×384 pos_x/pos_y) without re-dumping PNGs."""

from __future__ import annotations

import json
from pathlib import Path

from container import read_df_file
from cst import cst_frame_facing
from image import ImageError, decode_trans_sprite, find_palette, sprite_record
from prp import parse_prp_catalog
from pup import write_pup_play_sidecars

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
OUT = HERE / "out"


def pup_sidecar(df_path: Path, out_dir: Path) -> dict[str, int]:
    """Write sprites.json, per-line visemes, and scripts.json. Does not rewrite PNGs."""
    return write_pup_play_sidecars(read_df_file(df_path), out_dir, write_blob=False)


def house_sidecar(df_path: Path, out_dir: Path) -> int:
    df = read_df_file(df_path)
    palette = find_palette(df.containers[0].data)
    if palette is None:
        return 0
    catalog = parse_prp_catalog(df)
    props: list[dict] = []
    for item in catalog:
        if item.container < 0 or item.container >= len(df.containers):
            continue
        data = df.containers[item.container].data
        if len(data) < 16:
            continue
        try:
            sprite = decode_trans_sprite(data, palette)
        except ImageError:
            continue
        rel = f"FRAMES/{item.group}/{item.state}/{item.index_in_state:02d}_c{item.container}.png"
        rec = sprite_record(
            sprite,
            rel,
            extra={
                "group": item.group,
                "state": item.state,
                "index": item.index_in_state,
                "container": item.container,
            },
        )
        props.append(rec)
    dest = out_dir / "sprites.json"
    dest.write_text(
        json.dumps({"screen": [512, 384], "props": props}, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(props)


def main() -> int:
    from cli import collect_dust_files, output_dir_for

    gang = DUST / "DATA" / "GANG.CST"
    house = DUST / "DATA" / "HOUSE.PRP"
    pups = collect_dust_files([DUST], ("pup",))
    for path in pups:
        dest = output_dir_for(OUT, "pup", path)
        try:
            counts = pup_sidecar(path, dest)
        except Exception as err:
            print(f"FAIL {path.name}: {err}")
            continue
        print(
            f"PUP {path.stem} sprites.json ({counts.get('frames', 0)} frames, "
            f"{counts.get('visemes', 0)} visemes) -> {dest.relative_to(OUT)}"
        )
    if gang.exists():
        # Reuse the CST writer on a temp? It also writes PNGs. Walk tables only.
        n = _cst_sidecar(gang, OUT / "CST" / "_GANG")
        print(f"CST GANG sprites.json ({n} frames)")
    if house.exists():
        n = house_sidecar(house, OUT / "PRP" / "_HOUSE")
        print(f"PRP HOUSE sprites.json ({n} props)")
    inven = DUST / "DATA" / "INVEN.PRP"
    if inven.exists():
        n = house_sidecar(inven, OUT / "PRP" / "_INVEN")
        print(f"PRP INVEN sprites.json ({n} props)")
    return 0


def _cst_sidecar(df_path: Path, out_dir: Path) -> int:
    from struct import unpack_from

    from image import cst_palette
    from script import pascal_string

    df = read_df_file(df_path)
    header = df.containers[0].data
    count = unpack_from("<i", header, 0x938)[0]
    palette = cst_palette(header)
    actors: dict[str, dict[str, list]] = {}
    written = 0
    cursor = 0x93C
    for _ in range(count):
        logic_index = unpack_from("<i", header, cursor)[0]
        cursor += 16
        if logic_index < 0 or logic_index >= len(df.containers):
            continue
        logic = df.containers[logic_index].data
        if len(logic) < 0x5E:
            continue
        actor_name = pascal_string(logic, 0x2A)
        set_count = unpack_from("<i", logic, 0x5A)[0]
        set_cursor = 0x5E
        for _set in range(set_count):
            if set_cursor + 32 > len(logic):
                break
            set_info = unpack_from("<i", logic, set_cursor)[0]
            set_name = pascal_string(logic, set_cursor + 16)
            set_cursor += 32
            if set_info < 0 or set_info >= len(df.containers):
                continue
            info = df.containers[set_info].data
            if len(info) < 0x76:
                continue
            frame_count = unpack_from("<i", info, 0x72)[0]
            for frame_i in range(frame_count):
                rec = 0x76 + frame_i * 44
                if rec + 4 > len(info):
                    break
                frame_id = unpack_from("<i", info, rec)[0]
                if frame_id < 0 or frame_id >= len(df.containers):
                    continue
                try:
                    sprite = decode_trans_sprite(df.containers[frame_id].data, palette)
                except ImageError:
                    continue
                rel = f"{actor_name}/{set_name}/frame_{frame_id}.png"
                extra: dict = {"id": frame_id, "index": frame_i}
                facing = cst_frame_facing(info, frame_i)
                if facing:
                    extra["pose"] = facing[1]
                    extra["deg"] = facing[2]
                poses = actors.setdefault(actor_name, {})
                poses.setdefault(set_name, []).append(
                    sprite_record(sprite, rel, extra=extra)
                )
                written += 1
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "sprites.json").write_text(
        json.dumps({"screen": [512, 384], "actors": actors}, indent=2) + "\n",
        encoding="utf-8",
    )
    return written


if __name__ == "__main__":
    raise SystemExit(main())
