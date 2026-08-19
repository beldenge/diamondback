"""Read DreamFactory container files (LPPALPPA).

Ported from DFET DFfile::readFileIntoMemory. Dust-only: we accept version 1
headers and do not implement Titanic-only type handlers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import struct

HEADER_SIZE = 1024
MAGIC = b"LPPALPPA"


class DFError(Exception):
    """Unreadable or unsupported DreamFactory file."""


@dataclass
class Container:
    index: int
    id: int
    size: int
    data: bytes
    dummy: bool = False


@dataclass
class DFFile:
    path: Path
    fourcc: int
    file_size: int
    unknown: tuple[int, int, int]
    container_count: int
    type: int
    gap_where: int
    containers: list[Container] = field(default_factory=list)

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def stem(self) -> str:
        return self.path.stem


def read_df_file(path: Path) -> DFFile:
    path = Path(path)
    blob = path.read_bytes()
    if len(blob) < HEADER_SIZE:
        raise DFError(f"{path}: smaller than a DF header ({len(blob)} bytes)")
    if blob[32:40] != MAGIC:
        raise DFError(f"{path}: missing LPPALPPA magic")

    fourcc, file_size = struct.unpack_from("<II", blob, 0)
    unknown = struct.unpack_from("<III", blob, 8)
    container_count, typ, gap_where = struct.unpack_from("<III", blob, 20)
    if container_count == 0 or container_count > 100_000:
        raise DFError(f"{path}: implausible container count {container_count}")

    table_off = HEADER_SIZE
    table_end = table_off + container_count * 4
    if table_end > len(blob):
        raise DFError(f"{path}: container table overruns file")
    offsets = list(struct.unpack_from("<" + "I" * container_count, blob, table_off))

    containers: list[Container] = []
    for index, offset in enumerate(offsets):
        if _is_dummy(typ, gap_where, index, offset):
            containers.append(
                Container(index=index, id=index, size=8, data=bytes(8), dummy=True)
            )
            continue
        if offset + 8 > len(blob):
            raise DFError(f"{path}: container {index} offset {offset} out of range")
        cid, size = struct.unpack_from("<iI", blob, offset)
        start = offset + 8
        end = start + size
        if end > len(blob):
            raise DFError(
                f"{path}: container {index} data overruns file "
                f"(offset={offset}, size={size})"
            )
        containers.append(
            Container(index=index, id=cid, size=size, data=blob[start:end])
        )

    return DFFile(
        path=path,
        fourcc=fourcc,
        file_size=file_size,
        unknown=unknown,
        container_count=container_count,
        type=typ,
        gap_where=gap_where,
        containers=containers,
    )


def _is_dummy(typ: int, gap_where: int, index: int, offset: int) -> bool:
    # DFET only special-cases gapWhere for type 1/2, and notes that
    # zero offsets are empty. Dust PUPs (e.g. MAYOR, NED) use type 2
    # plus additional offset-0 holes, so treat any header-range offset
    # as empty regardless of type.
    if offset <= HEADER_SIZE:
        return True
    if typ == 1:
        return index == gap_where
    if typ == 2:
        return index == gap_where - 1 or index == gap_where
    return False
