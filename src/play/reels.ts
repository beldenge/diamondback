/** Full-screen playmovie reels for the picture show. Not INVEN inspectables or stairs. */

export interface GalleryReel {
  id: string;
  title: string;
  group: string;
}

export const DEFAULT_REEL = "intro";

export const GALLERY_REELS: readonly GalleryReel[] = [
  { id: "intro", title: "Opening", group: "Opening" },
  { id: "intro2", title: "Opening, continued", group: "Opening" },
  { id: "intro3", title: "Opening, finale", group: "Opening" },
  { id: "d1nd2m", title: "Night to morning (day 2)", group: "Days" },
  { id: "d2md2a", title: "Morning to afternoon (day 2)", group: "Days" },
  { id: "d2ad2n", title: "Afternoon to night (day 2)", group: "Days" },
  { id: "d2nd3m", title: "Night to morning (day 3)", group: "Days" },
  { id: "d3md3a", title: "Morning to afternoon (day 3)", group: "Days" },
  { id: "d3ad3n", title: "Afternoon to night (day 3)", group: "Days" },
  { id: "d3nd4m", title: "Night to morning (day 4)", group: "Days" },
  { id: "d4ad4n", title: "Afternoon to night (day 4)", group: "Days" },
  { id: "d4nd5m", title: "Night to morning (day 5)", group: "Days" },
  { id: "deserend", title: "Desert", group: "Endings" },
  { id: "marieend", title: "Marie", group: "Endings" },
  { id: "mayorend", title: "The Mayor", group: "Endings" },
  { id: "trottend", title: "Trotter", group: "Endings" },
  { id: "yunniend", title: "Yunni", group: "Endings" },
  { id: "finalend", title: "Finale", group: "Endings" },
  { id: "diec1", title: "Cobb", group: "Deaths" },
  { id: "dieh1", title: "Help", group: "Deaths" },
  { id: "dieh2", title: "Help (2)", group: "Deaths" },
  { id: "dieh3", title: "Help (3)", group: "Deaths" },
  { id: "dies2", title: "The Stranger", group: "Deaths" },
  { id: "dies3", title: "The Stranger (2)", group: "Deaths" },
  { id: "kiddie", title: "The Kid", group: "Deaths" },
  { id: "skeleton", title: "The skeleton", group: "Town" },
  { id: "openfoun", title: "The fountain", group: "Town" },
];

export function galleryReel(id: string): GalleryReel | undefined {
  const key = id.trim().toLowerCase().replace(/\.mov$/i, "");
  return GALLERY_REELS.find((reel) => reel.id === key);
}

export function reelFromSearch(search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get("reel") ?? "";
  return galleryReel(raw)?.id ?? DEFAULT_REEL;
}

export function galleryGroups(): { group: string; reels: GalleryReel[] }[] {
  const groups: { group: string; reels: GalleryReel[] }[] = [];
  for (const reel of GALLERY_REELS) {
    const last = groups[groups.length - 1];
    if (last && last.group === reel.group) {
      last.reels.push(reel);
    } else {
      groups.push({ group: reel.group, reels: [reel] });
    }
  }
  return groups;
}
