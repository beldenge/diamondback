# Targets

Only Cyberflix code. Not the Windows 3.1 tree, not Acrobat, not
InstallShield.

| File | Kind | Role |
|---|---|---|
| `WIN31/DUST/DF.EXE` | PE32, MSVC linker 3.0, ~272 KB `.text` | DreamFactory runtime. Opcode table, script VM, SET/PUP/MOV host. |
| `WIN31/DUST/MOVPLAY.EXE` | PE32, linker 2.55, ~110 KB `.text` | Movie player (DF subset, same 304-name opcode table). Tick, 80-byte frame table, A/B mixer, framebuffer + palettes: [`findings.md`](findings.md) §7. |
| `WIN31/DUST/PLUGINS/CHECKERS.DLL` | PE32, ~9.5 KB `.text` | One export: `PlugProc`. Internal name `Checkers.486.release.dll`. Verb `checkmove` is a string inside, not an export. |
| `WIN31/DUST/DUST.EXE` | Win16 NE | Launcher. Imports `KERNEL`/`GDI`/`USER`/`SHELL`. Not the engine. |
| `DUSTCD/DUST.EXE` | Win16 NE | CD copy of the launcher. **Different hash** from the installed one; keep both if they diverge. |
| `DUSTCD/INSTALL/ALT31/CHECKERS.DLL` | PE32 | Alternate checkers build (hash differs from `PLUGINS/CHECKERS.DLL`). |

DreamCatcher's published `DF.EXE` SHA-1 (`97462977fc15277ba186a64baffe978d658413a9`) does **not** match this install. Hash ours before comparing notes.

`DF.EXE` / `MOVPLAY.EXE` / `CHECKERS.DLL` are Win32 (Win32s on Windows 3.1), not 16-bit. Ghidra's x86 decompiler applies and **has been run** on all three: `dustdecompile/ghidra/ExportDecomp.java` writes the decompiled C, a function table, strings and data refs into the gitignored `out/ghidra/<binary>/`. All 1206 `DF.EXE` functions decompile. The launcher is the only NE file in scope.

Full hashes, PE sections, imports, and how the opcode table was parsed:
[`findings.md`](findings.md).
