import { exec } from "herdr";

// An image's pixel size from its header (PNG, JPEG, GIF, WebP), with nothing
// to install: { w, h }, or null.
const SIZE = `
import struct, sys
try: b = open(sys.argv[1], "rb").read(262144)
except OSError: sys.exit(1)
def out(w, h): print(w, h); sys.exit(0)
if b[:8] == b"\\x89PNG\\r\\n\\x1a\\n": out(*struct.unpack(">II", b[16:24]))
if b[:6] in (b"GIF87a", b"GIF89a"): out(*struct.unpack("<HH", b[6:10]))
if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
    k = b[12:16]
    if k == b"VP8 ": w, h = struct.unpack("<HH", b[26:30]); out(w & 0x3fff, h & 0x3fff)
    if k == b"VP8L": v = int.from_bytes(b[21:25], "little"); out((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1)
    if k == b"VP8X": out(int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1)
if b[:2] == b"\\xff\\xd8":
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF: i += 1; continue
        m = b[i + 1]
        if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC): h, w = struct.unpack(">HH", b[i + 5:i + 9]); out(w, h)
        i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
sys.exit(1)
`;

export async function imageSize(path) {
  const r = await exec("python3", ["-c", SIZE, path]);
  const [w, h] = r.stdout.trim().split(" ").map(Number);
  return w > 0 && h > 0 ? { w, h } : null;
}
