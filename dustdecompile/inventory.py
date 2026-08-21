"""Locate the Cyberflix binaries we actually want to decompile.

Windows 3.1 system DLLs, Acrobat, and the InstallShield tree are out of
scope. Two copies of a name are kept when the hashes differ (CD launcher
vs installed launcher; ALT31 CHECKERS vs the in-game plugin).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

ROLE_ENGINE = "engine"
ROLE_LAUNCHER = "launcher"
ROLE_MOVIE = "movie-player"
ROLE_PLUGIN = "plugin"


@dataclass(frozen=True)
class Target:
    role: str
    path: Path
    size: int
    sha256: str
    sha1: str


def default_dust_root() -> Path | None:
    dust = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
    win = dust / "WIN31" / "DUST"
    return win if win.is_dir() else None


def default_cd_root() -> Path | None:
    cd = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
    return cd if cd.is_dir() else None


def default_scripts_root() -> Path | None:
    """Pretty-printed scripts from dfextract, if a dump is present."""
    out = REPO / "dfextract" / "out"
    return out if out.is_dir() else None


def _digest(path: Path) -> tuple[int, str, str]:
    data = path.read_bytes()
    return len(data), hashlib.sha256(data).hexdigest(), hashlib.sha1(data).hexdigest()


def make_target(role: str, path: Path) -> Target:
    size, sha256, sha1 = _digest(path)
    return Target(role=role, path=path.resolve(), size=size, sha256=sha256, sha1=sha1)


def _add(targets: list[Target], seen: set[str], role: str, path: Path) -> None:
    if not path.is_file():
        return
    target = make_target(role, path)
    if target.sha256 in seen:
        return
    seen.add(target.sha256)
    targets.append(target)


def discover_targets(roots: list[Path] | None = None) -> list[Target]:
    """Walk given folders (or the default Dust install) for game binaries."""
    if not roots:
        roots = [p for p in (default_dust_root(), default_cd_root()) if p is not None]
    targets: list[Target] = []
    seen: set[str] = set()
    for root in roots:
        root = root.resolve()
        if (root / "DF.EXE").is_file():
            _add(targets, seen, ROLE_ENGINE, root / "DF.EXE")
            _add(targets, seen, ROLE_LAUNCHER, root / "DUST.EXE")
            _add(targets, seen, ROLE_MOVIE, root / "MOVPLAY.EXE")
            plugins = root / "PLUGINS"
            if plugins.is_dir():
                for dll in sorted(plugins.glob("*.DLL")):
                    _add(targets, seen, ROLE_PLUGIN, dll)
                for dll in sorted(plugins.glob("*.dll")):
                    _add(targets, seen, ROLE_PLUGIN, dll)
        elif (root / "DUST.EXE").is_file():
            _add(targets, seen, ROLE_LAUNCHER, root / "DUST.EXE")
        # CPU-variant plugin shipped next to the 16-bit installer.
        alt = root / "INSTALL" / "ALT31" / "CHECKERS.DLL"
        _add(targets, seen, ROLE_PLUGIN, alt)
    return targets


def engine_target(targets: list[Target]) -> Target | None:
    for target in targets:
        if target.role == ROLE_ENGINE:
            return target
    return None
