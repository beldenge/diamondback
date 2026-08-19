"""Extract Dust BOOTFILE scripts.

DFET DFboot.cpp: every container after 0 is a script, named Script N.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from container import DFError, DFFile
from pup import EXTRACTOR_BANNER
from script import binary_script_to_text


@dataclass
class BootScript:
    name: str
    container_index: int
    text: str


def extract_boot(df: DFFile) -> list[BootScript]:
    if not df.containers:
        raise DFError(f"{df.path}: BOOTFILE has no containers")
    scripts: list[BootScript] = []
    for index, container in enumerate(df.containers[1:], start=1):
        text = binary_script_to_text(container.data)
        if len(text) <= 1:
            continue
        scripts.append(
            BootScript(name=f"Script {index}", container_index=index, text=text)
        )
    return scripts


def write_boot_scripts(scripts: list[BootScript], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for script in scripts:
        path = out_dir / f"{script.name}.txt"
        path.write_text(EXTRACTOR_BANNER + script.text, encoding="utf-8", newline="\n")
        written.append(path)
    return written
