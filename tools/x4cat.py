"""Extract files from X4 .cat/.dat archives. Usage: x4cat.py <out_dir> <path> [<path>...]"""
import os, sys, glob

GAME = os.environ.get("X4_GAME_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\X4 Foundations")


def catalogs():
    base = sorted(glob.glob(os.path.join(GAME, "[0-9][0-9].cat")))
    yield "base", base
    for ext in sorted(glob.glob(os.path.join(GAME, "extensions", "ego_dlc_*"))):
        yield os.path.basename(ext), sorted(c for c in glob.glob(os.path.join(ext, "ext_*.cat")) if "_sig" not in c)


def read_cat(cat):
    offset = 0
    entries = {}
    with open(cat, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.rstrip("\n").rsplit(" ", 3)
            if len(parts) != 4:
                continue
            path, size, _ts, _md5 = parts
            size = int(size)
            entries[path] = (offset, size)
            offset += size
    return entries


def extract(out_dir, wanted):
    for source, cats in catalogs():
        found = {}
        for cat in cats:  # later catalogs override earlier ones
            entries = read_cat(cat)
            for w in wanted:
                if w in entries:
                    found[w] = (cat[:-4] + ".dat", *entries[w])
        for w, (dat, off, size) in found.items():
            with open(dat, "rb") as f:
                f.seek(off)
                data = f.read(size)
            dest = os.path.join(out_dir, source, w)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            print(f"{source}: {w} ({size} bytes)")


if __name__ == "__main__":
    extract(sys.argv[1], sys.argv[2:])
