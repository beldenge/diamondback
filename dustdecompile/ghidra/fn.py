import sys, re, os
# usage: python fn.py <binary DF|MOVPLAY|CHECKERS> <addr-or-name> [...]
root = r"D:\dev\diamondback\dustdecompile\out\ghidra"
bin_ = sys.argv[1]
text = open(os.path.join(root, bin_, "decomp.c"), encoding="utf-8", errors="replace").read()
parts = re.split(r"^// ==== ", text, flags=re.M)
index = {}
for p in parts[1:]:
    head, _, body = p.partition("\n")
    m = re.match(r"(\S+) @ (\S+) size (\d+)", head)
    if not m: continue
    name, addr, size = m.groups()
    index[name.lower()] = (head, body)
    index[addr.lower()] = (head, body)
    index[addr.lower().lstrip("0")] = (head, body)
for key in sys.argv[2:]:
    k = key.lower()
    if k.startswith("0x"): k = k[2:]
    hit = index.get(k) or index.get("fun_" + k.zfill(8)) or index.get(k.zfill(8))
    if not hit:
        print("// NOT FOUND", key); continue
    print("// ==== " + hit[0]); print(hit[1])
