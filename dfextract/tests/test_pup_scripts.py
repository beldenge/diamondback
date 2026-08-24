"""PUP script and dialogue checks against the Dust game files."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from pup import (
    extract_pup,
    parse_viseme_track,
    rest_pose_from_visemes,
    visemes_from_dialogue,
    write_pup_play_sidecars,
)

REPO = HERE.parent
PUPPETS = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD" / "PUPPETS"


class TestPupScripts(unittest.TestCase):
    def test_jenix_header_and_dialogue(self) -> None:
        if not (PUPPETS / "JENIX.PUP").exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(PUPPETS / "JENIX.PUP")
        extract = extract_pup(df)
        self.assertEqual(extract.version, 1)
        names = [script.name.lower() for script in extract.scripts]
        self.assertEqual(names, ["boot script", "day1", "day2", "day3"])
        idents = {line.ident: line.text for line in extract.dialogue}
        self.assertEqual(idents["jenix.2"], "They're yours!")
        self.assertIn("jenix.5", idents)
        self.assertIn("Excuse me, stranger", idents["jenix.5"])

    def test_jenix_day1_has_blog_beats(self) -> None:
        if not (PUPPETS / "JENIX.PUP").exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(PUPPETS / "JENIX.PUP")
        extract = extract_pup(df)
        day1 = next(script.text for script in extract.scripts if script.name.lower() == "day1")
        self.assertIn("code runyoself ()", day1)
        self.assertIn("global playercash, jenixphase", day1)
        self.assertIn("if jenixphase = 0", day1)
        self.assertIn('puppetspeak ("jenix.5")', day1)
        self.assertIn('actorowner ("JENIX", "gavemoney")', day1)
        self.assertIn("puppetevent (-1)", day1)

    def test_bolivar_scripts(self) -> None:
        if not (PUPPETS / "BOLIVAR.PUP").exists():
            self.skipTest("BOLIVAR.PUP not present")
        df = read_df_file(PUPPETS / "BOLIVAR.PUP")
        extract = extract_pup(df)
        names = [script.name.lower() for script in extract.scripts]
        self.assertEqual(names, ["boot script", "day1", "checkers vo"])
        day1 = next(script.text for script in extract.scripts if script.name.lower() == "day1")
        self.assertIn("code ", day1)
        self.assertIn("puppetspeak", day1)
        self.assertIn("bolivar", day1.lower())

    def test_leroy_dialogue_uses_mac_roman_apostrophe(self) -> None:
        path = PUPPETS / "LEROY.PUP"
        if not path.exists():
            self.skipTest("LEROY.PUP not present")
        line = next(item for item in extract_pup(read_df_file(path)).dialogue if item.ident == "leroy.44")
        self.assertNotIn("Õ", line.text)
        self.assertIn("midnight", line.text.lower())
        self.assertTrue("'" in line.text or "\u2019" in line.text)

    def test_leroy_viseme_track_matches_wav_length(self) -> None:
        path = PUPPETS / "LEROY.PUP"
        if not path.exists():
            self.skipTest("LEROY.PUP not present")
        df = read_df_file(path)
        extract = extract_pup(df)
        line = next(item for item in extract.dialogue if item.ident == "leroy.1")
        self.assertEqual(line.duration_ticks, 93)
        blob = df.containers[line.anim_logic].data
        self.assertEqual(len(blob) % 82, 0)
        self.assertEqual(len(blob) // 82, 93)
        frames = parse_viseme_track(blob)
        self.assertEqual(frames[0]["t"], 0)
        self.assertEqual(frames[-1]["t"], 184)
        self.assertAlmostEqual(frames[-1]["t"] / 60, 3.11, delta=0.1)
        jaws = {frame["layers"]["Jaw"] for frame in frames}
        self.assertGreater(len(jaws), 3)
        table = visemes_from_dialogue(df, extract.dialogue)
        self.assertIn("leroy.1", table)
        self.assertEqual(table["leroy.1"]["ticks"], 93)
        from pup import write_viseme_files
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            write_viseme_files(Path(tmp), table)
            line_path = Path(tmp) / "visemes" / "leroy.1.json"
            self.assertTrue(line_path.exists())
            payload = json.loads(line_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["ticks"], 93)
        rest = frames[0]["at"]
        # Viseme extras are DFET hotspots on the 512×264 still.
        self.assertEqual(rest["Background"], [256, 132])
        self.assertEqual(rest["Body"], [256, 207])
        self.assertLess(rest["Head"][1], rest["Body"][1])
        self.assertLess(rest["Eyebrows"][1], rest["Eyes"][1])
        self.assertGreater(rest["Jaw"][1], rest["Eyes"][1])
        self.assertAlmostEqual(rest["Body"][1] + 114 / 2, 264, delta=2)
        at, layers = rest_pose_from_visemes(table)
        self.assertEqual(at["Body"], [256, 207])
        self.assertEqual(layers["Jaw"], 0)
        self.assertEqual(layers["Hands 1"], -1)

    def test_rest_pose_prefers_idle_1_background(self) -> None:
        at, layers = rest_pose_from_visemes({
            "help.1": {
                "frames": [{"at": {"Head": [1, 1]}, "layers": {"Background": 0}}],
            },
            "idle 1": {
                "frames": [{"at": {"Body": [255, 169]}, "layers": {"Background": -1}}],
            },
        })
        self.assertEqual(layers["Background"], -1)
        self.assertEqual(at["Body"], [255, 169])

    def test_jenix_play_sidecars(self) -> None:
        path = PUPPETS / "JENIX.PUP"
        if not path.exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(path)
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            counts = write_pup_play_sidecars(df, dest, write_blob=False)
            self.assertGreater(counts["visemes"], 0)
            self.assertTrue((dest / "AUDIO" / "visemes" / "jenix.5.json").exists())
            self.assertFalse((dest / "AUDIO" / "visemes.json").exists())
            scripts = json.loads((dest / "scripts.json").read_text(encoding="utf-8"))
            self.assertIn("day2.json", scripts["scripts"])
            sheet = json.loads((dest / "FRAMES" / "sprites.json").read_text(encoding="utf-8"))
            self.assertIn("Jaw", sheet["layers"])
            self.assertNotIn("Hands 1", sheet["layers"])
            self.assertEqual(sheet["restLayers"]["Hands 1"], -1)


if __name__ == "__main__":
    unittest.main()
