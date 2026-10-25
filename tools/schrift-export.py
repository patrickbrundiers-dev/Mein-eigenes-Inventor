# Umrisse einer TrueType-Schrift als JS-Modul für Text in der Skizze (src/core/schrift-daten.js).
# Einmalig ausgeführt mit fontTools 4.55 auf DejaVu Sans (Bitstream-Vera-Lizenz, DejaVu-Änderungen gemeinfrei):
#   python3 tools/schrift-export.py /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf > src/core/schrift-daten.js
# Je Zeichen: Vorschub und Pfad aus M/L/Q/Z in Schrifteinheiten (Quadratkurven, wie in TrueType).
import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.basePen import decomposeQuadraticSegment

CHARS = [*range(0x20, 0x7F), *range(0xA0, 0x100), 0x20AC, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201E, 0x2026, 0x2300, 0x2116]

def glyphs(path):
    f = TTFont(path)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    out = {}
    for cp in CHARS:
        name = cmap.get(cp)
        if not name:
            continue
        pen = DecomposingRecordingPen(gs)
        gs[name].draw(pen)
        cmd = []
        cur = None
        for op, args in pen.value:
            if op == "moveTo":
                cur = args[0]; cmd.append("M%d %d" % cur)
            elif op == "lineTo":
                cur = args[0]; cmd.append("L%d %d" % cur)
            elif op == "qCurveTo":
                if args[-1] is None:  # geschlossene Kontur nur aus Kontrollpunkten: Punkte auf der Kurve liegen mittig
                    pts = args[:-1]
                    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                    cmd.append("M%s %s" % tuple(fmt(v) for v in mid(pts[-1], pts[0])))
                    for i, c in enumerate(pts):
                        p = mid(c, pts[(i + 1) % len(pts)])
                        cmd.append("Q%s %s %s %s" % (fmt(c[0]), fmt(c[1]), fmt(p[0]), fmt(p[1])))
                    continue
                for c, p in decomposeQuadraticSegment(args):
                    cmd.append("Q%s %s %s %s" % (fmt(c[0]), fmt(c[1]), fmt(p[0]), fmt(p[1])))
                    cur = p
            elif op == "curveTo":
                raise SystemExit("kubische Kurve in " + name)
            elif op in ("closePath", "endPath"):
                cmd.append("Z")
        out[chr(cp)] = [gs[name].width, "".join(cmd)]
    return {"em": f["head"].unitsPerEm, "asc": f["hhea"].ascent, "desc": f["hhea"].descent, "g": out}

def fmt(v):
    return ("%d" % v) if float(v).is_integer() else ("%.1f" % v)

data = {"normal": glyphs(sys.argv[1]), "fett": glyphs(sys.argv[2])}
print("// Erzeugt mit tools/schrift-export.py aus DejaVu Sans und DejaVu Sans Bold – nicht von Hand ändern.")
print("// Lizenz: Bitstream Vera Fonts (frei, auch verkauft als Teil von Software); DejaVu-Änderungen gemeinfrei. Siehe docs/lizenzen/dejavu.txt")
print("export const SCHRIFTEN = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";")
