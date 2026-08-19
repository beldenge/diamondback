"""Dust-only DreamFactory extractor CLI.

No GUI. With no flags, scan the Dust CD and extract every supported
asset of every type. Flags only narrow that: content kinds, file types,
or particular paths.
"""

from __future__ import annotations

import argparse
import struct
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from boot import extract_boot, write_boot_scripts
from container import DFError, MAGIC, read_df_file
from cst import extract_cst, write_cst_frames, write_cst_scripts
from flt import write_flt_extract
from mov import write_mov_extract
from prp import write_prp_extract
from pup import extract_pup, write_pup_extract
from set import write_set_extract
from snd import extract_snd, write_snd_wavs

DEFAULT_OUT = HERE / "out"

# Dust file kinds we care about. Titanic-only suffixes are not listed.
DUST_TYPES = ("boot", "cst", "flt", "mov", "prp", "pup", "set", "snd")
CONTENT_KINDS = ("scripts", "audio", "frames")

SUFFIX_TO_TYPE = {
    ".pup": "pup",
    ".set": "set",
    ".flt": "flt",
    ".prp": "prp",
    ".mov": "mov",
    ".cst": "cst",
    ".snd": "snd",
}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    kinds = selected_kinds(args)
    types = selected_types(args)

    inputs = list(args.inputs) or _default_dust_roots()
    if not inputs:
        print("No inputs given and no Dust game data found.", file=sys.stderr)
        return 2

    files = collect_dust_files(inputs, types)
    if not files:
        wanted = ", ".join(types)
        print(f"No Dust files found for types: {wanted}", file=sys.stderr)
        return 2

    args.output.mkdir(parents=True, exist_ok=True)
    print(
        f"Extracting {', '.join(kinds)} from {len(files)} file(s) "
        f"[{', '.join(types)}]"
    )
    print(f"Output: {args.output}")
    print()

    failures: list[tuple[Path, str]] = []
    skipped: list[tuple[Path, str]] = []
    skip_counts: dict[str, int] = defaultdict(int)
    tallies: dict[str, int] = defaultdict(int)

    for path in files:
        file_type = classify_path(path) or "unknown"
        dest = output_dir_for(args.output, file_type, path)
        raw_head = path.read_bytes()[:40] if path.exists() else b""
        if len(raw_head) < 40 or raw_head[32:40] != MAGIC:
            skipped.append((path, "not a DreamFactory container"))
            skip_counts["not-df"] += 1
            continue
        try:
            result = extract_file(path, file_type, dest, kinds)
        except (DFError, OSError, struct.error, NotImplementedError) as exc:
            if isinstance(exc, NotImplementedError):
                skipped.append((path, str(exc)))
                skip_counts[file_type] += 1
            else:
                failures.append((path, str(exc)))
                print(f"FAIL  {path.name:16}  {exc}", flush=True)
            continue

        for key, count in result.items():
            tallies[key] += count
        summary = "  ".join(f"{count} {key}" for key, count in result.items() if key != "pending")
        print(f"OK    {path.name:16}  {summary}  -> {dest.relative_to(args.output)}", flush=True)

    print()
    done = len(files) - len(failures) - len(skipped)
    print(f"Done. {done}/{len(files)} extracted", end="")
    if skipped:
        print(f", {len(skipped)} not implemented yet", end="")
    if failures:
        print(f", {len(failures)} failed", end="")
    print(".")
    if tallies:
        print("  " + ", ".join(f"{count} {key}" for key, count in tallies.items()))
    if skipped:
        skip_summary = ", ".join(
            f"{count} {name}" for name, count in sorted(skip_counts.items())
        )
        print(f"Skipped (not implemented yet): {skip_summary}")
    if failures:
        print("Failures:")
        for path, err in failures:
            print(f"  {path}: {err}")
        return 1
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract Dust: A Tale of the Wired West assets. "
            "Default is everything. Flags only restrict the run."
        )
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        help="Files or directories. Default: the Dust CD / install tree.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output directory (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--scripts",
        action="store_true",
        help="Extract scripts (and PUP dialogue tables). If any of "
        "--scripts/--audio/--frames is set, only those kinds run.",
    )
    parser.add_argument(
        "--audio",
        action="store_true",
        help="Extract audio. Restricts the run to the kinds you list.",
    )
    parser.add_argument(
        "--frames",
        action="store_true",
        help="Extract images / frames. Restricts the run to the kinds you list.",
    )
    parser.add_argument(
        "--type",
        dest="types",
        metavar="LIST",
        help="Comma-separated file types to include: " + ", ".join(DUST_TYPES),
    )
    return parser.parse_args(argv)


def selected_kinds(args: argparse.Namespace) -> tuple[str, ...]:
    chosen = tuple(kind for kind in CONTENT_KINDS if getattr(args, kind))
    return chosen or CONTENT_KINDS


def selected_types(args: argparse.Namespace) -> tuple[str, ...]:
    raw = getattr(args, "types", None)
    if not raw:
        return DUST_TYPES
    wanted: list[str] = []
    unknown: list[str] = []
    for item in raw.split(","):
        name = item.strip().lower()
        if not name:
            continue
        if name == "bootfile":
            name = "boot"
        if name not in DUST_TYPES:
            unknown.append(name)
        elif name not in wanted:
            wanted.append(name)
    if unknown:
        raise SystemExit(
            f"Unknown --type value(s): {', '.join(unknown)}. "
            f"Choose from: {', '.join(DUST_TYPES)}"
        )
    if not wanted:
        raise SystemExit("No file types left after parsing --type.")
    return tuple(wanted)


def classify_path(path: Path) -> str | None:
    if path.name.upper() == "BOOTFILE":
        return "boot"
    return SUFFIX_TO_TYPE.get(path.suffix.lower())


def collect_dust_files(inputs: list[Path], types: tuple[str, ...]) -> list[Path]:
    wanted = set(types)
    found: list[Path] = []
    for item in inputs:
        if item.is_file():
            kind = classify_path(item)
            if kind in wanted:
                found.append(item)
            elif kind is None:
                print(f"skip unsupported file: {item}", file=sys.stderr)
        elif item.is_dir():
            for child in sorted(item.rglob("*")):
                if child.is_file() and classify_path(child) in wanted:
                    found.append(child)
        else:
            print(f"skip missing path: {item}", file=sys.stderr)

    # Prefer the first copy (CD before LOCAL install) of the same asset.
    seen_paths: set[Path] = set()
    seen_keys: set[tuple[str, str]] = set()
    unique: list[Path] = []
    for path in found:
        resolved = path.resolve()
        kind = classify_path(path) or ""
        key = (kind, (path.stem or path.name).upper())
        if resolved in seen_paths or key in seen_keys:
            continue
        seen_paths.add(resolved)
        seen_keys.add(key)
        unique.append(path)
    return unique


def output_dir_for(root: Path, file_type: str, path: Path) -> Path:
    stem = path.stem.upper() if path.stem else path.name.upper()
    return root / file_type.upper() / f"_{stem}"


def extract_file(
    path: Path, file_type: str | None, dest: Path, kinds: tuple[str, ...]
) -> dict[str, int]:
    if file_type == "pup":
        return _extract_pup(path, dest, kinds)
    if file_type == "boot":
        return _extract_boot(path, dest, kinds)
    if file_type == "cst":
        return _extract_cst(path, dest, kinds)
    if file_type == "snd":
        return _extract_snd(path, dest, kinds)
    if file_type == "set":
        return write_set_extract(
            read_df_file(path),
            dest,
            write_scripts="scripts" in kinds,
            write_frames="frames" in kinds,
        )
    if file_type == "flt":
        return write_flt_extract(
            read_df_file(path),
            dest,
            write_scripts="scripts" in kinds,
            write_frames="frames" in kinds,
        )
    if file_type == "prp":
        return write_prp_extract(
            read_df_file(path),
            dest,
            write_scripts="scripts" in kinds,
            write_frames="frames" in kinds,
        )
    if file_type == "mov":
        return write_mov_extract(
            read_df_file(path),
            dest,
            write_scripts="scripts" in kinds,
            write_frames="frames" in kinds,
            write_audio="audio" in kinds,
        )
    raise NotImplementedError(
        f"{file_type} ({', '.join(kinds)}) not implemented yet"
    )


def _require_kind(file_type: str, kinds: tuple[str, ...], needed: str) -> None:
    if needed not in kinds:
        raise NotImplementedError(
            f"{file_type} {', '.join(kinds)} not implemented yet"
        )


def _extract_pup(path: Path, dest: Path, kinds: tuple[str, ...]) -> dict[str, int]:
    if not any(kind in kinds for kind in ("scripts", "audio", "frames")):
        raise NotImplementedError(f"pup {', '.join(kinds)} not implemented yet")
    df = read_df_file(path)
    extract = extract_pup(df)
    return write_pup_extract(
        extract,
        dest,
        write_scripts="scripts" in kinds,
        write_audio="audio" in kinds,
        write_frames="frames" in kinds,
        df=df,
    )


def _extract_boot(path: Path, dest: Path, kinds: tuple[str, ...]) -> dict[str, int]:
    _require_kind("boot", kinds, "scripts")
    df = read_df_file(path)
    scripts = extract_boot(df)
    write_boot_scripts(scripts, dest)
    return {"scripts": len(scripts)}


def _extract_cst(path: Path, dest: Path, kinds: tuple[str, ...]) -> dict[str, int]:
    if "scripts" not in kinds and "frames" not in kinds:
        raise NotImplementedError(f"cst {', '.join(kinds)} not implemented yet")
    df = read_df_file(path)
    result: dict[str, int] = {}
    if "scripts" in kinds:
        actors = extract_cst(df)
        write_cst_scripts(actors, dest)
        result["scripts"] = len(actors)
    if "frames" in kinds:
        result["frames"] = write_cst_frames(df, dest)
    return result


def _extract_snd(path: Path, dest: Path, kinds: tuple[str, ...]) -> dict[str, int]:
    _require_kind("snd", kinds, "audio")
    df = read_df_file(path)
    decoded, failed = extract_snd(df)
    write_snd_wavs(decoded, dest)
    result = {"audio": len(decoded)}
    if failed:
        result["audio_failed"] = len(failed)
    return result


def _default_dust_roots() -> list[Path]:
    repo = HERE.parents[1]
    dust = repo / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
    candidates = [
        dust / "DUSTCD",
        dust / "WIN31" / "DUST",
    ]
    return [path for path in candidates if path.exists()]


if __name__ == "__main__":
    raise SystemExit(main())
