#!/usr/bin/env python3
"""Writes the MDX/MDD fixtures used by mdict_reader_test and mdict_test.

A small MDict writer (format per
https://github.com/zhansliu/writemdict/blob/master/fileformat.md) rather than
a dependency on writemdict, which is not on PyPI. Supports engine versions
1.2 and 2.0, UTF-8 and UTF-16 text, compression 0 (stored), 1 (LZO1X, written
as a single literal run, which is a valid stream) and 2 (zlib), and the
Encrypted=2 key-index cipher. Every fixture is a few KB and deterministic.

    python3 tests/fixtures/mdict/gen_fixtures.py
"""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- RIPEMD-128
def _rol(x, n):
    return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF


_RL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
       7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
       3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
       1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2]
_RR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
       6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
       15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
       8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14]
_SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
       7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
       11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
       11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12]
_SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
       9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
       9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
       15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8]
_KL = [0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC]
_KR = [0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x00000000]


def _f(r, x, y, z):
    if r == 0:
        return x ^ y ^ z
    if r == 1:
        return (x & y) | (~x & z)
    if r == 2:
        return (x | ~y) ^ z
    return (x & z) | (y & ~z)


def ripemd128(data):
    h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476]
    msg = bytearray(data) + b"\x80"
    while len(msg) % 64 != 56:
        msg += b"\x00"
    msg += struct.pack("<Q", len(data) * 8)
    for off in range(0, len(msg), 64):
        x = list(struct.unpack("<16I", msg[off:off + 64]))
        al, bl, cl, dl = h
        ar, br, cr, dr = h
        for j in range(64):
            r = j // 16
            t = _rol((al + _f(r, bl, cl, dl) + x[_RL[j]] + _KL[r]) & 0xFFFFFFFF, _SL[j])
            al, dl, cl, bl = dl, cl, bl, t
            t = _rol((ar + _f(3 - r, br, cr, dr) + x[_RR[j]] + _KR[r]) & 0xFFFFFFFF, _SR[j])
            ar, dr, cr, br = dr, cr, br, t
        t = (h[1] + cl + dr) & 0xFFFFFFFF
        h[1] = (h[2] + dl + ar) & 0xFFFFFFFF
        h[2] = (h[3] + al + br) & 0xFFFFFFFF
        h[3] = (h[0] + bl + cr) & 0xFFFFFFFF
        h[0] = t
    return struct.pack("<4I", *h)


assert ripemd128(b"abc").hex() == "c14a12199c66e4ba84636b0f69144c77"


# ------------------------------------------------------------------ helpers
def lzo_literal_stream(data):
    """A valid LZO1X stream that stores `data` as one literal run.

    First-byte shortcut: 18..255 copies (byte - 17) literals. Longer runs use
    the regular long-literal instruction 0x00 with zero-byte length extension.
    0x11 0x00 0x00 is the end-of-stream marker (M4 with distance 16384).
    """
    n = len(data)
    end = b"\x11\x00\x00"
    if n == 0:
        return end
    if n <= 238:
        return bytes([17 + n]) + data + end
    rest = n - 18
    zeros = (rest - 1) // 255
    last = rest - 255 * zeros
    return b"\x00" + b"\x00" * zeros + bytes([last]) + data + end


def frame(payload, compression):
    """MDict block framing: LE u32 compression, BE adler32 of payload, packed payload."""
    if compression == 0:
        packed = payload
    elif compression == 1:
        packed = lzo_literal_stream(payload)
    elif compression == 2:
        packed = zlib.compress(payload, 9)
    else:
        raise ValueError(compression)
    return struct.pack("<I", compression) + struct.pack(">I", zlib.adler32(payload) & 0xFFFFFFFF) + packed


def encrypt_key_index(framed):
    key = ripemd128(framed[4:8] + struct.pack("<L", 0x3695))
    body = bytearray(framed[8:])
    previous = 0x36
    # Inverse of readmdict's _fast_decrypt: plaintext byte p -> stored byte b with
    # decrypt(b) = swap(b) ^ prev ^ i ^ key[i], prev = previous stored byte.
    out = bytearray()
    for i, p in enumerate(body):
        t = p ^ previous ^ (i & 0xFF) ^ key[i % 16]
        b = ((t >> 4) | (t << 4)) & 0xFF
        out.append(b)
        previous = b
    return framed[:8] + bytes(out)


def xml_escape(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


# ------------------------------------------------------------------- writer
def write_mdict(path, entries, *, version="2.0", encoding="UTF-8", compression=2, encrypted=0,
                kind="mdx", fmt="Html", title="Fixture", description="", stylesheet="",
                block_entries=3, record_block_bytes=200, extra_attrs=None, corrupt=None):
    """entries: list of (key, value) with value str for mdx, bytes for mdd.

    corrupt: None or one of 'truncate', 'record_adler', 'huge_block' to produce a
    malformed file for the negative tests.
    """
    v2 = float(version) >= 2.0
    num = ">Q" if v2 else ">I"
    width = 8 if v2 else 4
    text_enc = "utf-16-le" if (kind == "mdd" or encoding.upper().startswith("UTF-16")) else "utf-8"
    term = b"\x00\x00" if text_enc == "utf-16-le" else b"\x00"

    # Records, in key order (MDict stores keys sorted; we keep caller order,
    # which the fixtures keep sorted where the reader cares).
    records = []
    for _, value in entries:
        if kind == "mdd":
            records.append(value)
        else:
            records.append(value.encode(text_enc) + term)

    # Record blocks.
    record_blocks = []
    cur = b""
    for rec in records:
        if cur and len(cur) + len(rec) > record_block_bytes:
            record_blocks.append(cur)
            cur = b""
        cur += rec
    if cur or not record_blocks:
        record_blocks.append(cur)

    # Key blocks with record offsets into the concatenated record space.
    offsets = []
    off = 0
    for rec in records:
        offsets.append(off)
        off += len(rec)
    keys = []
    for (key, _), o in zip(entries, offsets):
        keys.append((key, o))
    key_blocks = [keys[i:i + block_entries] for i in range(0, len(keys), block_entries)]

    key_block_bytes = []
    for block in key_blocks:
        raw = b"".join(struct.pack(num, o) + k.encode(text_enc) + term for k, o in block)
        key_block_bytes.append((raw, frame(raw, compression)))

    # Key-block index.
    size_fmt = ">H" if v2 else ">B"
    index = b""
    for block, (raw, packed) in zip(key_blocks, key_block_bytes):
        first = block[0][0].encode(text_enc)
        last = block[-1][0].encode(text_enc)
        unit = 2 if text_enc == "utf-16-le" else 1
        index += struct.pack(num, len(block))
        index += struct.pack(size_fmt, len(first) // unit) + first + (term if v2 else b"")
        index += struct.pack(size_fmt, len(last) // unit) + last + (term if v2 else b"")
        index += struct.pack(num, len(packed)) + struct.pack(num, len(raw))
    if v2:
        index_packed = frame(index, 2)
        if encrypted & 2:
            index_packed = encrypt_key_index(index_packed)
    else:
        index_packed = index

    key_blocks_packed = b"".join(p for _, p in key_block_bytes)
    if v2:
        key_header = struct.pack(num, len(key_blocks)) + struct.pack(num, len(keys)) + struct.pack(num, len(index))
        key_header += struct.pack(num, len(index_packed)) + struct.pack(num, len(key_blocks_packed))
        key_header += struct.pack(">I", zlib.adler32(key_header) & 0xFFFFFFFF)
    else:
        key_header = struct.pack(num, len(key_blocks)) + struct.pack(num, len(keys))
        key_header += struct.pack(num, len(index_packed)) + struct.pack(num, len(key_blocks_packed))

    # Record section.
    record_packed = []
    record_index = b""
    for i, blk in enumerate(record_blocks):
        framed = frame(blk, compression)
        if corrupt == "record_adler" and i == 0:
            framed = framed[:4] + struct.pack(">I", (struct.unpack(">I", framed[4:8])[0] ^ 1)) + framed[8:]
        record_packed.append(framed)
        declared_unpacked = len(blk)
        if corrupt == "huge_block" and i == 0:
            declared_unpacked = 1 << 40
        record_index += struct.pack(num, len(framed)) + struct.pack(num, declared_unpacked)
    record_blocks_packed = b"".join(record_packed)
    record_header = struct.pack(num, len(record_blocks)) + struct.pack(num, len(keys))
    record_header += struct.pack(num, len(record_index)) + struct.pack(num, len(record_blocks_packed))

    # Header.
    attrs = {
        "GeneratedByEngineVersion": version,
        "RequiredEngineVersion": version,
        "Format": fmt,
        "KeyCaseSensitive": "No",
        "StripKey": "Yes",
        "Encrypted": str(encrypted),
        "RegisterBy": "EMail",
        "Description": description,
        "Title": title,
        "Encoding": "UTF-16" if encoding.upper().startswith("UTF-16") else encoding,
        "CreationDate": "2020-1-1",
        "Compact": "Yes",
        "Compat": "Yes",
        "Left2Right": "Yes",
        "DataSourceFormat": "107",
        "StyleSheet": stylesheet,
    }
    if kind == "mdd":
        attrs["Encoding"] = ""
    if extra_attrs:
        attrs.update(extra_attrs)
    root = "Library_Data" if kind == "mdd" else "Dictionary"
    header_text = "<%s %s/>\r\n" % (root, " ".join('%s="%s"' % (k, xml_escape(v)) for k, v in attrs.items()))
    header_bytes = header_text.encode("utf-16-le") + b"\x00\x00"
    header = struct.pack(">I", len(header_bytes)) + header_bytes
    header += struct.pack("<I", zlib.adler32(header_bytes) & 0xFFFFFFFF)

    data = header + key_header + index_packed + key_blocks_packed + record_header + record_index + record_blocks_packed
    if corrupt == "truncate":
        data = data[:-(len(record_blocks_packed) // 2 + 1)]
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


# ----------------------------------------------------------------- fixtures
HTML_ENTRIES = [
    ("@@@LINK_target", "<div>target of a link</div>"),
    ("alias", "@@@LINK=@@@LINK_target\r\n"),
    ("dup", '<p class="a">first dup</p>'),
    ("dup", '<p class="a">second dup</p>'),
    ("entry", '<b>bold</b> <i>italic</i> <a href="entry://alias">alias</a> <a href="sound://a.spx">snd</a>'
              '<img src="../evil.png"><style>.inline-x { color: blue; }</style>'),
    ("missing-alias", "@@@LINK=nowhere"),
    ("ruby", '<table><tr><td><ruby>漢<rt>かん</rt></ruby></td></tr></table><img src="img/pic.png">'),
    ("食べる", "`1`to eat`2` (ichidan)"),
    ("見出し", "<span style=\"color:red;font-size:12px\">見出し語</span>"),
]

TEXT_ENTRIES = [
    ("alpha", "first definition"),
    ("beta", "second\ndefinition with newline"),
    ("gamma", "third"),
    ("日本語", "Japanese text \"quoted\""),
]

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8ffff3f0005fe02fea72d5a5e0000000049454e44ae426082"
)

MDD_ENTRIES = [
    ("\\a.spx", b"not really speex"),
    ("\\img\\pic.png", PNG),
    ("\\style.css", ".mdx-red { color: red; }\n".encode("utf-8")),
    ("\\..\\evil.png", b"traversal"),
    # UTF-16LE without a BOM and with non-ASCII text, as some MDD authors save it.
    ("\\utf16.css", ".u16::before { content: \"\u2192\"; }\n".encode("utf-16-le")),
]


def main():
    out = lambda name: os.path.join(HERE, name)  # noqa: E731
    sizes = {}
    sizes["v2_utf8_zlib_text.mdx"] = write_mdict(
        out("v2_utf8_zlib_text.mdx"), TEXT_ENTRIES, version="2.0", encoding="UTF-8", compression=2,
        fmt="Text", title="Text Fixture", description="A <b>text</b> fixture &amp; entities")
    sizes["v2_utf8_lzo_html.mdx"] = write_mdict(
        out("v2_utf8_lzo_html.mdx"), HTML_ENTRIES, version="2.0", encoding="UTF-8", compression=1,
        fmt="Html", title="HTML Fixture", stylesheet="1\n<b>\n</b>\n2\n<i>\n</i>\n",
        description="HTML fixture with links, duplicates and a stylesheet")
    sizes["v2_utf16_encrypted2.mdx"] = write_mdict(
        out("v2_utf16_encrypted2.mdx"), TEXT_ENTRIES, version="2.0", encoding="UTF-16", compression=2,
        encrypted=2, fmt="Text", title="UTF-16 Fixture")
    sizes["v1_utf8_stored.mdx"] = write_mdict(
        out("v1_utf8_stored.mdx"), TEXT_ENTRIES, version="1.2", encoding="UTF-8", compression=0,
        fmt="Text", title="V1 Fixture")
    sizes["v2_utf8_lzo_html.mdd"] = write_mdict(
        out("v2_utf8_lzo_html.mdd"), MDD_ENTRIES, version="2.0", compression=2, kind="mdd",
        title="HTML Fixture Media")
    # Malformed inputs. Each must fail with a specific message.
    sizes["bad_truncated.mdx"] = write_mdict(
        out("bad_truncated.mdx"), TEXT_ENTRIES, fmt="Text", corrupt="truncate")
    sizes["bad_adler.mdx"] = write_mdict(
        out("bad_adler.mdx"), TEXT_ENTRIES, fmt="Text", corrupt="record_adler")
    sizes["bad_huge_block.mdx"] = write_mdict(
        out("bad_huge_block.mdx"), TEXT_ENTRIES, fmt="Text", corrupt="huge_block")
    sizes["bad_encrypted1.mdx"] = write_mdict(
        out("bad_encrypted1.mdx"), TEXT_ENTRIES, fmt="Text", encrypted=1)
    sizes["bad_gbk.mdx"] = write_mdict(
        out("bad_gbk.mdx"), TEXT_ENTRIES, fmt="Text", encoding="GBK")
    sizes["bad_v3.mdx"] = write_mdict(
        out("bad_v3.mdx"), TEXT_ENTRIES, fmt="Text", version="3.0")
    for name, size in sizes.items():
        print("%-28s %6d bytes" % (name, size))


if __name__ == "__main__":
    main()
