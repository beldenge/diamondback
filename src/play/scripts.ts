import { parseScript, type Proc, type ScriptFile } from "../vm/ast";
import { extractUrl } from "../world/set/extract";

export interface LoadedProc {
  proc: Proc;
  file: string;
}

export class ScriptIndex {
  private readonly byKey = new Map<string, Map<string, LoadedProc>>();

  add(objectKey: string, proc: Proc, file: string): void {
    let bag = this.byKey.get(objectKey);
    if (!bag) {
      bag = new Map();
      this.byKey.set(objectKey, bag);
    }
    bag.set(proc.name.toLowerCase(), { proc, file });
  }

  lookup(objectKeys: string[], name: string): Proc | undefined {
    return this.lookupAll(objectKeys, name)[0];
  }

  lookupAll(objectKeys: string[], name: string): Proc[] {
    const want = name.toLowerCase();
    const out: Proc[] = [];
    for (const key of objectKeys) {
      const hit = this.byKey.get(key)?.get(want);
      if (hit) {
        out.push(hit.proc);
      }
    }
    return out;
  }

  removePrefix(prefix: string): void {
    for (const key of [...this.byKey.keys()]) {
      if (key === prefix || key.startsWith(prefix)) {
        this.byKey.delete(key);
      }
    }
  }

  has(objectKey: string): boolean {
    return this.byKey.has(objectKey);
  }

  copyKey(from: string, to: string): void {
    const bag = this.byKey.get(from);
    if (!bag) {
      return;
    }
    for (const { proc, file } of bag.values()) {
      this.add(to, proc, file);
    }
  }
}

export async function loadScriptJson(rel: string): Promise<Proc[]> {
  const res = await fetch(extractUrl(rel));
  if (!res.ok) {
    throw new Error(`script missing ${rel} (${res.status})`);
  }
  const file = (await res.json()) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

export async function loadScriptTree(
  index: ScriptIndex,
  objectKey: string,
  rels: string[],
): Promise<void> {
  const results = await Promise.all(
    rels.map(async (rel) => {
      try {
        const procs = await loadScriptJson(rel);
        return { rel, procs };
      } catch {
        return { rel, procs: [] as Proc[] };
      }
    }),
  );
  for (const { rel, procs } of results) {
    for (const proc of procs) {
      index.add(objectKey, proc, rel);
    }
  }
}


