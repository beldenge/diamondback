"""Surface-level plugin ABI from PE exports + strings."""

from __future__ import annotations

from typing import Any

from pe import PeImage
from strings import extract_strings, interesting_plugin_names


def describe_plugin(image: PeImage) -> dict[str, Any]:
    strings = extract_strings(image)
    export_names = tuple(e.name for e in image.exports)
    return {
        "file": image.path.name,
        "export_dll": image.export_dll,
        "exports": [
            {"name": e.name, "ordinal": e.ordinal, "rva": hex(e.rva)}
            for e in image.exports
        ],
        "verbs": interesting_plugin_names(strings, export_names),
        "note": (
            "Scripts call plugin()/pluginfx() with a verb string. "
            "CHECKERS.DLL exports a single PlugProc; the verb is dispatched inside."
        ),
    }
