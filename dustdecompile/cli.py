"""CLI: inventory Dust engine binaries, recover the opcode table, emit TS stubs.

No flags means everything. Flags only narrow.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from binary import load_binary
from emit import write_all
from handbook import build_handbook, write_handbook
from inventory import (
    ROLE_PLUGIN,
    Target,
    default_scripts_root,
    discover_targets,
    engine_target,
    make_target,
)
from ne import NeImage
from opcodes import recover_opcodes
from pe import PeError, PeImage
from plugins import describe_plugin
from rsrc import dump_pe_resources

DEFAULT_OUT = HERE / "out"
KINDS = ("inventory", "opcodes", "plugins", "handbook", "rsrc")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="dustdecompile",
        description="Inventory and recover structure from Dust's DF.EXE / plugins.",
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        help="WIN31/DUST folder, DUSTCD folder, or a specific EXE/DLL. Default: local Dust install.",
    )
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--inventory", action="store_true", help="Only write the binary catalog.")
    parser.add_argument("--opcodes", action="store_true", help="Only recover the DF.EXE opcode table.")
    parser.add_argument("--plugins", action="store_true", help="Only describe plugin exports/verbs.")
    parser.add_argument(
        "--handbook",
        action="store_true",
        help="Only write the opcode/library handbook (needs dfextract/out for call sites).",
    )
    parser.add_argument(
        "--rsrc",
        action="store_true",
        help="Only dump DF.EXE PE resources (cursors, menu, strings, CLUTs).",
    )
    return parser.parse_args(argv)


def selected_kinds(args: argparse.Namespace) -> tuple[str, ...]:
    chosen = tuple(kind for kind in KINDS if getattr(args, kind))
    return chosen or KINDS


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    kinds = selected_kinds(args)
    roots, files = _split_inputs(args.inputs)
    try:
        targets = _collect_targets(roots, files)
    except PeError as exc:
        print(exc, file=sys.stderr)
        return 2
    if not targets:
        print("No Dust engine binaries found.", file=sys.stderr)
        return 2

    images = {}
    for target in targets:
        try:
            images[target.path] = load_binary(target.path)
        except (PeError, OSError) as exc:
            print(f"skip {target.path.name}: {exc}", file=sys.stderr)

    opcodes = []
    if "opcodes" in kinds or "handbook" in kinds:
        engine = engine_target(targets)
        if engine is None:
            print("No DF.EXE in the inventory; cannot recover opcodes.", file=sys.stderr)
            return 2
        image = images.get(engine.path)
        if not isinstance(image, PeImage):
            print("DF.EXE is not PE32.", file=sys.stderr)
            return 2
        opcodes = recover_opcodes(image)
        if not opcodes:
            print("Opcode table not found in DF.EXE.", file=sys.stderr)
            return 2

    plugin_notes: dict = {"plugins": []}
    if "plugins" in kinds:
        for target in targets:
            if target.role != ROLE_PLUGIN:
                continue
            image = images.get(target.path)
            if isinstance(image, PeImage):
                plugin_notes["plugins"].append(describe_plugin(image))

    written = write_all(
        args.output,
        targets=targets,
        images=images,
        opcodes=opcodes if "opcodes" in kinds or "handbook" in kinds else [],
        plugin_notes=plugin_notes,
    )
    if "handbook" in kinds:
        handbook = build_handbook(opcodes, default_scripts_root())
        written.extend(write_handbook(args.output, handbook))
    if "rsrc" in kinds:
        engine = engine_target(targets)
        image = images.get(engine.path) if engine is not None else None
        if isinstance(image, PeImage):
            written.extend(dump_pe_resources(image, args.output / "rsrc"))

    _print_summary(targets, images, opcodes, written)
    return 0


def _split_inputs(inputs: list[Path]) -> tuple[list[Path], list[Path]]:
    roots: list[Path] = []
    files: list[Path] = []
    for item in inputs:
        if item.is_dir():
            roots.append(item)
        elif item.is_file():
            files.append(item)
        else:
            raise SystemExit(f"Not found: {item}")
    return roots, files


def _collect_targets(roots: list[Path], files: list[Path]) -> list[Target]:
    if not roots and not files:
        return discover_targets()
    targets = discover_targets(roots) if roots else []
    seen = {t.sha256 for t in targets}
    for path in files:
        target = make_target(_role_for_name(path.name), path)
        if target.sha256 in seen:
            continue
        seen.add(target.sha256)
        targets.append(target)
    return targets


def _role_for_name(name: str) -> str:
    upper = name.upper()
    if upper == "DF.EXE":
        return "engine"
    if upper == "MOVPLAY.EXE":
        return "movie-player"
    if upper == "DUST.EXE":
        return "launcher"
    if upper.endswith(".DLL"):
        return "plugin"
    return "binary"


def _print_summary(
    targets: list[Target],
    images: dict,
    opcodes: list,
    written: list[Path],
) -> None:
    print(f"dustdecompile — {len(targets)} target(s)")
    for target in targets:
        image = images.get(target.path)
        if isinstance(image, PeImage):
            extra = f"PE32 linker {image.linker}"
            if image.exports:
                extra += " exports " + ", ".join(e.name for e in image.exports)
            if image.compiler_hints:
                extra += " [" + ", ".join(image.compiler_hints) + "]"
        elif isinstance(image, NeImage):
            extra = f"NE imports {', '.join(image.imported_modules)}"
        else:
            extra = "?"
        print(f"  {target.role:14} {target.path.name:16} {target.size:7}  {extra}")
    if opcodes:
        print(f"Recovered {len(opcodes)} opcode names from DF.EXE")
    if any(p.name == "handbook.md" for p in written):
        print("Wrote opcode/library handbook")
    print("Wrote:")
    for path in written:
        print(f"  {path}")


if __name__ == "__main__":
    raise SystemExit(main())
