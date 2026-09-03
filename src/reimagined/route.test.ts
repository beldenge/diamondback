import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8",
);

describe("reimagined routing surface", () => {
  it("has a card on the title chooser", () => {
    expect(indexHtml).toContain('href="?mode=resurrected"');
    expect(indexHtml).toContain('href="?mode=unlocked"');
    expect(indexHtml).toContain('href="?mode=movies"');
    expect(indexHtml).toContain('href="?mode=reimagined"');
    expect(indexHtml).toContain("Dust: Reimagined");
    expect(indexHtml).toContain("/landing/reimagined.jpg");
    expect(indexHtml.match(/landing-card"/g)?.length).toBe(4);
  });

  it("keeps reimagined in the boot-hidden script so a direct URL boots clean", () => {
    const boot = indexHtml.slice(indexHtml.indexOf("boot-hidden"), indexHtml.indexOf("</script>"));
    expect(boot).toContain('"reimagined"');
    expect(boot).toContain('"movies"');
    expect(boot).toContain('"resurrected"');
    expect(boot).toContain('"unlocked"');
    // and no alias sneaks in
    expect(boot).not.toContain("renewed");
    expect(boot).not.toContain('"free"');
  });

  it("main.ts titles the mode and quits back to the chooser", () => {
    const mainTs = readFileSync(
      fileURLToPath(new URL("../main.ts", import.meta.url)),
      "utf8",
    );
    expect(mainTs).toContain("Dust: Reimagined — Diamondback");
    expect(mainTs).toContain('case "reimagined"');
    expect(mainTs).toContain("quitReimaginedToTitle");
  });
});
