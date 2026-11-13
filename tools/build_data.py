"""Build the planner's data files from an X4: Foundations install (base game + official DLC).

Reads wares, production module macros, sector sunlight and English text straight
from the game's .cat/.dat archives, applies the DLC diff patches, and writes
data/wares.json + data/wares.js for the app.

Usage:  X4_GAME_DIR="D:/SteamLibrary/steamapps/common/X4 Foundations" python tools/build_data.py
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
import x4cat

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = x4cat.GAME

# ---------------------------------------------------------------- extraction

def all_entries():
    """{source: {path: (dat, offset, size)}} with later catalogs overriding earlier."""
    result = {}
    for source, cats in x4cat.catalogs():
        found = {}
        for cat in cats:
            for path, (off, size) in x4cat.read_cat(cat).items():
                found[path] = (cat[:-4] + ".dat", off, size)
        result[source] = found
    return result


def read_entry(entry):
    dat, off, size = entry
    with open(dat, "rb") as f:
        f.seek(off)
        return f.read(size)


ENTRIES = all_entries()
SOURCES = list(ENTRIES)  # base first, then DLC in name order
DLC_LABEL = {
    "base": None,
    "ego_dlc_boron": "Kingdom End",
    "ego_dlc_pirate": "Tides of Avarice",
    "ego_dlc_split": "Split Vendetta",
    "ego_dlc_terran": "Cradle of Humanity",
    "ego_dlc_timelines": "Timelines",
}


def files(path):
    for source in SOURCES:
        if path in ENTRIES[source]:
            yield source, read_entry(ENTRIES[source][path])

# ---------------------------------------------------------------- text

TEXT = {}
for _source, data in files("t/0001-l044.xml"):
    root = ET.fromstring(data)
    for page in root.iter("page"):
        pid = page.get("id")
        for t in page.iter("t"):
            TEXT[(pid, t.get("id"))] = t.text or ""


def text(ref, depth=0):
    if not ref or depth > 5:
        return ref or ""

    def sub(m):
        return text(TEXT.get((m.group(1), m.group(2)), ""), depth + 1)

    out = re.sub(r"\{(\d+),\s*(\d+)\}", sub, ref)
    out = re.sub(r"(?<!\\)\([^()]*\)", "", out)  # X4 strips (comments) in text
    return out.replace("\\(", "(").replace("\\)", ")").strip()

# ---------------------------------------------------------------- wares + DLC diffs

wares_root = None
for source, data in files("libraries/wares.xml"):
    root = ET.fromstring(data)
    if root.tag == "wares":
        wares_root = root
        for w in root.findall("ware"):
            w.set("_source", source)
        continue
    for op in root:
        sel = op.get("sel", "")
        rel = sel[len("/wares"):].lstrip("/")
        if op.tag == "add":
            if "/@" in sel or sel.startswith("@"):
                continue
            target = wares_root if rel == "" else wares_root.find(rel)
            if target is None:
                continue
            for child in list(op):
                if child.tag == "ware":
                    child.set("_source", source)
                target.append(child)
        elif op.tag == "replace":
            if "/@" in rel:
                path, attr = rel.rsplit("/@", 1)
                target = wares_root.find(path) if path else wares_root
                if target is not None:
                    target.set(attr, (op.text or "").strip())
            else:
                parent_path, _, last = rel.rpartition("/")
                parent = wares_root.find(parent_path) if parent_path else wares_root
                old = wares_root.find(rel)
                if parent is not None and old is not None and len(op):
                    idx = list(parent).index(old)
                    parent.remove(old)
                    parent.insert(idx, op[0])
        elif op.tag == "remove":
            if "/@" in rel:
                path, attr = rel.rsplit("/@", 1)
                target = wares_root.find(path)
                if target is not None and attr in target.attrib:
                    del target.attrib[attr]
            else:
                parent_path, _, _ = rel.rpartition("/")
                parent = wares_root.find(parent_path) if parent_path else wares_root
                old = wares_root.find(rel)
                if parent is not None and old is not None:
                    parent.remove(old)

WARE_EL = {w.get("id"): w for w in wares_root.findall("ware")}

# ---------------------------------------------------------------- production module macros

MODULE_MACROS = {}
for source in SOURCES:
    for path in ENTRIES[source]:
        if re.search(r"/macros/prod_[a-z]+_[a-z0-9_]+_macro\.xml$", path):
            root = ET.fromstring(read_entry(ENTRIES[source][path]))
            macro = root.find("macro")
            queue = macro.find(".//production/queue") if macro is not None else None
            if queue is None:
                continue
            ware = queue.get("ware")
            if not ware or ware not in WARE_EL:
                continue  # e.g. the scrap recycler, which has no fixed queue
            method = queue.get("method") or "default"
            # the game falls back to the generic recipe when a race has no
            # special one for this ware (Argon food modules use "default")
            methods = {p.get("method") for p in WARE_EL[ware].findall("production")}
            if method not in methods:
                method = "default"
            wf = macro.find(".//workforce")
            MODULE_MACROS[macro.get("name").lower()] = {
                "ware": ware,
                "method": method,
                "workforce": int(wf.get("max")) if wf is not None and wf.get("max") else 0,
            }

# habitats (worker capacity) and storage modules (cargo capacity by type)
HABITATS = {}
STORAGE = {}
for source in SOURCES:
    for path in ENTRIES[source]:
        m = re.search(r"^assets/structures/.*/macros/((hab|storage)_[a-z0-9_]+_macro)\.xml$", path)
        if not m or "buildstorage" in path:
            continue
        root = ET.fromstring(read_entry(ENTRIES[source][path]))
        macro = root.find("macro")
        if macro is None:
            continue
        name = macro.get("name").lower()
        if m.group(2) == "hab":
            wf = macro.find(".//workforce")
            if wf is not None and wf.get("capacity"):
                HABITATS[name] = {"capacity": int(wf.get("capacity")), "race": wf.get("race") or ""}
        else:
            cargo = macro.find(".//cargo")
            if cargo is not None and cargo.get("max") and macro.get("class") == "storage":
                STORAGE[name] = {"capacity": int(cargo.get("max")), "type": (cargo.get("tags") or "").split()[0]}

# build cost of each production module: the module ware that references its macro
for wid, el in WARE_EL.items():
    comp = el.find("component")
    price = el.find("price")
    if comp is not None and price is not None and wid.startswith("module_"):
        ref = (comp.get("ref") or "").lower()
        if ref in MODULE_MACROS:
            MODULE_MACROS[ref]["cost"] = int(price.get("average"))

# ---------------------------------------------------------------- worker upkeep
# Workers eat: X4 models it as the wares workunit_busy (employed) and
# workunit_idle, 200 workers per 600 s cycle, one recipe per race.
WORKFORCE = {}
for state in ("busy", "idle"):
    el = WARE_EL.get(f"workunit_{state}")
    for prod in (el.findall("production") if el is not None else []):
        per_hour = 3600 / float(prod.get("time")) / int(prod.get("amount"))
        WORKFORCE.setdefault(prod.get("method"), {})[state] = [
            {"wareID": w.get("ware"), "amount": round(int(w.get("amount")) * per_hour, 5)}
            for w in prod.find("primary").findall("ware")
        ]

# ---------------------------------------------------------------- recipes

def recipe(prod):
    eff = {e.get("type"): float(e.get("product")) for e in prod.iter("effect")}
    primary = prod.find("primary")
    return {
        "time": int(float(prod.get("time"))),
        "amount": int(prod.get("amount")),
        "inputs": [
            {"wareID": w.get("ware"), "amount": int(w.get("amount"))}
            for w in (primary.findall("ware") if primary is not None else [])
        ],
        "work": eff.get("work", 0),
        "sunlight": "sunlight" in eff,
    }


wanted = {m["ware"] for m in MODULE_MACROS.values()}
used_methods = {}
for m in MODULE_MACROS.values():
    used_methods.setdefault(m["ware"], set()).add(m["method"])

# include every input of every buildable recipe, recursively
queue = list(wanted) + [w["wareID"] for m in WORKFORCE.values() for lst in m.values() for w in lst]
included = set()
while queue:
    wid = queue.pop()
    if wid in included or wid not in WARE_EL:
        continue
    included.add(wid)
    for prod in WARE_EL[wid].findall("production"):
        if prod.get("method") in used_methods.get(wid, {"default"}):
            for w in prod.iter("ware"):
                queue.append(w.get("ware"))

TRANSPORT = {"container": "Container", "solid": "Solid", "liquid": "Liquid", "condensate": "Condensate"}
GROUP_LABEL = {}

wares = {}
for wid in sorted(included):
    el = WARE_EL[wid]
    price = el.find("price")
    recipes = {}
    for prod in el.findall("production"):
        method = prod.get("method")
        if method in used_methods.get(wid, set()):
            recipes[method] = recipe(prod)
    group = el.get("group") or ""
    wares[wid] = {
        "id": wid,
        "label": text(el.get("name")),
        "category": group.capitalize(),
        "price": {k: int(price.get(a)) for k, a in (("min", "min"), ("avg", "average"), ("max", "max"))},
        "volume": int(el.get("volume") or 0),
        "storageType": TRANSPORT.get(el.get("transport"), (el.get("transport") or "").capitalize()),
        "isMined": not recipes,
        "dlc": DLC_LABEL.get(el.get("_source")),
        "recipes": recipes,
    }

# the planner works with one main recipe per ware: the generic one when it exists
for w in wares.values():
    main = "default" if "default" in w["recipes"] else (sorted(w["recipes"])[0] if w["recipes"] else None)
    w["mainMethod"] = main
    r = w["recipes"].get(main) if main else None
    w["cycleTime"] = r["time"] if r else 0
    w["batchSize"] = r["amount"] if r else 0
    w["inputs"] = r["inputs"] if r else []


def tier(wid, seen=()):
    w = wares[wid]
    deps = [i["wareID"] for r in w["recipes"].values() for i in r["inputs"] if i["wareID"] in wares and i["wareID"] not in seen]
    return 0 if not deps else 1 + max(tier(d, seen + (wid,)) for d in deps)


for wid in wares:
    wares[wid]["tier"] = tier(wid)

# ---------------------------------------------------------------- sectors (sunlight)

sectors = {}
for source, data in files("libraries/mapdefaults.xml"):
    root = ET.fromstring(data)
    for ds in root.iter("dataset"):
        macro = (ds.get("macro") or "").lower()
        if "_sector" not in macro:
            continue
        ident = ds.find("properties/identification")
        area = ds.find("properties/area")
        entry = sectors.setdefault(macro, {"name": "", "sunlight": 1.0})
        if ident is not None and ident.get("name"):
            entry["name"] = text(ident.get("name"))
        if area is not None and area.get("sunlight"):
            entry["sunlight"] = round(float(area.get("sunlight")), 3)

# ---------------------------------------------------------------- write

modules = {k: v for k, v in sorted(MODULE_MACROS.items()) if v["ware"] in wares}
payload = {
    "wares": wares,
    "modules": modules,
    "sectors": dict(sorted(sectors.items())),
    "habitats": dict(sorted(HABITATS.items())),
    "storage": dict(sorted(STORAGE.items())),
    "workforce": WORKFORCE,
}
version = re.sub(r"\s+", "", open(os.path.join(GAME, "version.dat")).read())
gamever = f"{version[0]}.{version[1:]}" if version.isdigit() else version

with open(os.path.join(PROJECT, "data", "wares.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump({"gameVersion": gamever, **payload}, f, indent=1, ensure_ascii=False)

with open(os.path.join(PROJECT, "data", "wares.js"), "w", encoding="utf-8", newline="\n") as f:
    f.write(f"// Generated from X4: Foundations {gamever} game files (base game + official DLC). Do not edit by hand.\n")
    f.write(f"const GAME_VERSION = {json.dumps(gamever)};\n")
    f.write("const WARES_DATA = " + json.dumps(wares, ensure_ascii=False) + ";\n")
    f.write("const MODULE_MACROS = " + json.dumps(modules) + ";\n")
    f.write("const SECTORS = " + json.dumps(payload["sectors"], ensure_ascii=False) + ";\n")
    f.write("const HABITATS = " + json.dumps(payload["habitats"]) + ";\n")
    f.write("const STORAGE = " + json.dumps(payload["storage"]) + ";\n")
    f.write("const WORKFORCE = " + json.dumps(WORKFORCE) + ";\n")

print(f"game {gamever}: {len(wares)} wares, {len(modules)} module macros, {len(sectors)} sectors")
print("mined:", sorted(w for w in wares if wares[w]["isMined"]))
print("multi-recipe:", {w: sorted(wares[w]["recipes"]) for w in wares if len(wares[w]["recipes"]) > 1})
print("tiers:", {t: sum(1 for w in wares.values() if w["tier"] == t) for t in range(6)})
print("unlabelled:", [w for w in wares if not wares[w]["label"]])
print("energycells:", wares["energycells"]["recipes"])
