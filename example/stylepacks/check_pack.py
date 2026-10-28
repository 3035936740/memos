#!/usr/bin/env python3
"""Checks a Memos Plus style pack folder or ZIP against the server's rules (internal/stylepack) and, for a folder,
builds the installable ZIP next to it.

    python3 check_pack.py skeuomorphism            # check the folder, write skeuomorphism.zip
    python3 check_pack.py skeuomorphism.zip        # check a ZIP only

The server stays the authority: `memos stylepack check file.zip` runs the real compiler. This script needs only the
Python standard library, for machines without a Go toolchain.
"""

import base64
import io
import json
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

BUILTINS = {"default", "glass", "neumorphism", "aero", "y2k", "vaporwave", "pixel", "handdrawn", "terminal", "golden"}
MANIFEST_KEYS = {"kind", "version", "id", "name", "author", "homepage", "license", "reactsLike", "colorScheme",
                 "description", "preview", "minVersion"}
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
               ".svg": "image/svg+xml"}
SVG_ELEMENTS = set("svg g path circle ellipse rect line polyline polygon defs symbol use linearGradient radialGradient "
                   "stop clipPath mask title desc filter feGaussianBlur feOffset feBlend feColorMatrix feComposite "
                   "feMerge feMergeNode".split())
SVG_PROPERTIES = {"background", "background-image", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image",
                  "mask-border", "mask-border-source", "-webkit-mask-box-image", "border-image",
                  "border-image-source", "list-style", "list-style-image", "content", "cursor"}
BLOCK_AT_RULES = {"@media", "@supports", "@container", "@layer", "@starting-style"}
FORBIDDEN_FUNCTIONS = {"expression", "url", "image-set", "-webkit-image-set", "src", "paint", "element", "-moz-element"}


class PackError(Exception):
    pass


def sniff(blob):
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if blob.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "image/webp"
    if blob[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


def check_svg(blob, where):
    text = blob.decode("utf-8")
    if "<!" in text:
        raise PackError(f"{where}: SVG declarations are forbidden")
    root = ET.fromstring(text)
    for node in root.iter():
        tag = node.tag.split("}")[-1]
        if tag not in SVG_ELEMENTS:
            raise PackError(f"{where}: SVG element {tag} forbidden")
        for key, value in node.attrib.items():
            local = key.split("}")[-1].lower()
            if local.startswith("on") or local == "style":
                raise PackError(f"{where}: SVG event/style attributes forbidden")
            if local == "href" and not value.strip().startswith("#"):
                raise PackError(f"{where}: external SVG references forbidden")
            for target in re.findall(r"url\(\s*['\"]?([^)'\"]*)", value, re.I):
                if not target.strip().startswith("#"):
                    raise PackError(f"{where}: external SVG URLs forbidden")
    if root.tag.split("}")[-1] != "svg":
        raise PackError(f"{where}: SVG root required")


# ---------------------------------------------------------------- CSS

TOKEN = re.compile(
    r"(?P<comment>/\*.*?\*/)"
    r"|(?P<ws>\s+)"
    r"|(?P<string>\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')"
    r"|(?P<url>url\(\s*(?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|[^)\s\"']*)\s*\))"
    r"|(?P<at>@-?[A-Za-z_][\w-]*)"
    r"|(?P<function>-?[A-Za-z_\\][\w\\-]*\()"
    r"|(?P<ident>--[\w-]+|-?[A-Za-z_\\][\w\\-]*)"
    r"|(?P<hash>#[\w-]+)"
    r"|(?P<number>[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?)"
    r"|(?P<punct>[{}()\[\];:,])"
    r"|(?P<delim>.)",
    re.S,
)


def tokenize(source):
    tokens, pos = [], 0
    while pos < len(source):
        m = TOKEN.match(source, pos)
        kind = m.lastgroup
        tokens.append((kind, m.group(), source.count("\n", 0, pos) + 1))
        pos = m.end()
    return [t for t in tokens if t[0] != "comment"]


def check_selector(tokens, line):
    groups, depth, current = [], 0, []
    for t in tokens:
        if t[0] == "function" or t[1] in "([":
            depth += 1
        if t[1] in ")]":
            depth -= 1
        if t[1] == "," and depth == 0:
            groups.append(current)
            current = []
        else:
            current.append(t)
    groups.append(current)
    for group in groups:
        g = [t for t in group]
        while g and g[0][0] == "ws":
            g.pop(0)
        if not g:
            raise PackError(f"style.css line {line}: empty selector")
        depth = 0
        for i, t in enumerate(g):
            if t[1] == "&":
                raise PackError(f"style.css line {line}: CSS nesting is not supported")
            root = t[1] == ":" and i + 1 < len(g) and g[i + 1][1].lower() == "root"
            html = t[0] == "ident" and t[1].lower() == "html" and not (i > 0 and g[i - 1][1] in (".", ":"))
            if root or html:
                if i != 0 or depth != 0:
                    raise PackError(f"style.css line {line}: :root / html only at the start of a selector")
            if t[0] == "function" or t[1] in "([":
                depth += 1
            if t[1] in ")]":
                depth -= 1


def check_url(raw, prop, assets, line):
    inner = raw[4:-1].strip().strip("\"'")
    if inner.startswith("asset:"):
        name = inner[6:]
        if name not in assets:
            raise PackError(f"style.css line {line}: missing asset {name}")
        if name.endswith(".svg") and not (prop.startswith("--") or prop in SVG_PROPERTIES):
            raise PackError(f"style.css line {line}: SVG is not allowed on {prop}")
        return
    if inner.startswith("data:"):
        header, _, body = inner[5:].partition(",")
        header = header.lower()
        encoded = header.endswith(";base64")
        mime = header.removesuffix(";base64")
        data = base64.b64decode(body) if encoded else urllib.parse.unquote(body).encode()
        if len(data) > 64 << 10:
            raise PackError(f"style.css line {line}: data URL over 64 KiB")
        if mime == "image/svg+xml":
            if not (prop.startswith("--") or prop in SVG_PROPERTIES):
                raise PackError(f"style.css line {line}: SVG is not allowed on {prop}")
            check_svg(data, f"style.css line {line}")
        elif not encoded or sniff(data) != mime:
            raise PackError(f"style.css line {line}: raster data URL must be base64 and match its type")
        return
    raise PackError(f"style.css line {line}: external or non-asset URL forbidden")


def check_value(prop, tokens, assets, pack_id, in_font, line):
    for i, t in enumerate(tokens):
        low = t[1].lower()
        if "javascript:" in low or "vbscript:" in low:
            raise PackError(f"style.css line {t[2]}: script URL forbidden")
        if t[0] == "function":
            name = low[:-1]
            if in_font and prop == "src" and name not in ("format", "tech"):
                raise PackError(f"style.css line {t[2]}: font src must use asset URLs")
            if name == "attr":
                rest = [x for x in tokens[i + 1:] if x[0] != "ws"]
                if prop != "content" or not rest or not rest[0][1].startswith("data-sb-") or rest[1][1] != ")":
                    raise PackError(f"style.css line {t[2]}: attr() only as content: attr(data-sb-…)")
            elif name in FORBIDDEN_FUNCTIONS:
                raise PackError(f"style.css line {t[2]}: forbidden function {name}()")
        if t[1] == "!" and not prop.startswith("--"):
            raise PackError(f"style.css line {t[2]}: !important only on custom properties")
        if t[0] == "url":
            check_url(t[1], prop, assets, t[2])


def check_css(source, assets, pack_id):
    if len(source.encode()) > 200 << 10:
        raise PackError("style.css exceeds 200 KiB")
    tokens = tokenize(source)
    stack, i = [], 0
    keyframes = set()
    while i < len(tokens):
        kind, text, line = tokens[i]
        if kind == "ws" or text == ";":
            i += 1
            continue
        if text == "}":
            if not stack:
                raise PackError(f"style.css line {line}: unbalanced stylesheet")
            stack.pop()
            i += 1
            continue
        top = stack[-1] if stack else None
        if kind == "at":
            name = text.lower()
            j = i + 1
            while j < len(tokens) and tokens[j][1] not in ("{", ";"):
                j += 1
            prelude = "".join(t[1] for t in tokens[i + 1:j]).strip()
            if name == "@charset":
                if prelude.strip("\"'").lower() != "utf-8":
                    raise PackError(f"style.css line {line}: only UTF-8 charset")
                i = j + 1
                continue
            if top not in (None, "@media"):
                raise PackError(f"style.css line {line}: {name} not allowed here")
            if name in BLOCK_AT_RULES:
                stack.append("@media")
            elif name in ("@keyframes", "@-webkit-keyframes"):
                keyframes.add(prelude)
                stack.append("@keyframes")
            elif name == "@font-face":
                stack.append("@font-face")
            elif name == "@property":
                if not prelude.startswith(f"--{pack_id}-"):
                    raise PackError(f"style.css line {line}: @property names must start with --{pack_id}-")
                stack.append("@property")
            else:
                raise PackError(f"style.css line {line}: forbidden at-rule {name}")
            i = j + 1
            continue
        if top in (None, "@media", "@keyframes"):
            j = i
            while j < len(tokens) and tokens[j][1] != "{":
                if tokens[j][1] in (";", "}"):
                    raise PackError(f"style.css line {tokens[j][2]}: stray declaration outside a rule")
                j += 1
            if top != "@keyframes":
                check_selector(tokens[i:j], line)
            stack.append("rule")
            i = j + 1
            continue
        # A declaration inside a rule, @font-face or @property.
        j = i
        while j < len(tokens) and tokens[j][1] not in (":", "{", ";", "}"):
            j += 1
        if j >= len(tokens) or tokens[j][1] != ":":
            raise PackError(f"style.css line {line}: unsupported nested CSS syntax")
        prop = text.lower()
        if prop in ("behavior", "-moz-binding"):
            raise PackError(f"style.css line {line}: forbidden property {prop}")
        k, depth = j + 1, 0
        while k < len(tokens):
            if tokens[k][0] == "function" or tokens[k][1] in "([":
                depth += 1
            elif tokens[k][1] in ")]":
                depth -= 1
            elif depth == 0 and tokens[k][1] in (";", "}"):
                break
            elif tokens[k][1] == "{":
                raise PackError(f"style.css line {tokens[k][2]}: unsupported nested CSS syntax")
            k += 1
        check_value(prop, tokens[j + 1:k], assets, pack_id, top == "@font-face", line)
        i = k
    if stack:
        raise PackError("style.css: unclosed CSS block")


# ---------------------------------------------------------------- Pack


def check_manifest(manifest, assets):
    unknown = set(manifest) - MANIFEST_KEYS
    if unknown:
        raise PackError(f"style.json: unknown fields {sorted(unknown)}")
    pack_id = manifest.get("id", "")
    if manifest.get("kind") != "memos-plus.style" or manifest.get("version") != 1:
        raise PackError("style.json: kind must be memos-plus.style and version 1")
    if not re.fullmatch(r"[a-z0-9-]{3,32}", pack_id) or pack_id in BUILTINS or pack_id.startswith("memos-"):
        raise PackError("style.json: invalid id")
    names = manifest.get("name") or {}
    if not names or len(names) > 32 or any(not v.strip() or len(v.encode()) > 256 for v in names.values()):
        raise PackError("style.json: localized name required")
    for lang, text in (manifest.get("description") or {}).items():
        if not lang or len(text) > 500:
            raise PackError("style.json: description entries are at most 500 characters")
    if manifest.get("reactsLike") and manifest["reactsLike"] not in BUILTINS:
        raise PackError("style.json: reactsLike must name a built-in style")
    if manifest.get("colorScheme", "") not in ("", "light", "dark"):
        raise PackError("style.json: colorScheme must be light or dark")
    preview = manifest.get("preview")
    if preview and (preview not in assets or preview.endswith(".woff2")):
        raise PackError("style.json: preview must name an image in assets/")
    if len(manifest.get("author", "").encode()) > 256 or len(manifest.get("license", "").encode()) > 128:
        raise PackError("style.json: metadata too long")
    return pack_id


def check_files(files):
    if set(files) - {"style.json", "style.css"} and not all(
        n.startswith("assets/") for n in files if n not in ("style.json", "style.css")
    ):
        raise PackError("only style.json, style.css and assets/ may be in the ZIP")
    if "style.json" not in files or "style.css" not in files:
        raise PackError("style.json and style.css required at the ZIP root")
    assets, image_bytes, images = {}, 0, 0
    for name, blob in files.items():
        if not name.startswith("assets/"):
            continue
        short = name[7:]
        ext = os.path.splitext(short)[1].lower()
        if ext == ".woff2":
            if blob[:4] != b"wOF2":
                raise PackError(f"{name}: invalid WOFF2")
        elif ext in IMAGE_TYPES:
            images += 1
            image_bytes += len(blob)
            if ext == ".svg":
                check_svg(blob, name)
            elif sniff(blob) != IMAGE_TYPES[ext]:
                raise PackError(f"{name}: content does not match its extension")
        else:
            raise PackError(f"{name}: unsupported asset type")
        assets[short] = blob
    if images > 20 or image_bytes > 2 << 20:
        raise PackError(f"image assets exceed 20 files or 2 MiB ({images} files, {image_bytes} bytes)")
    manifest = json.loads(files["style.json"])
    pack_id = check_manifest(manifest, assets)
    check_css(files["style.css"].decode("utf-8"), assets, pack_id)
    return manifest, images, image_bytes


def read_folder(folder):
    files = {}
    for name in ("style.json", "style.css"):
        with open(os.path.join(folder, name), "rb") as f:
            files[name] = f.read()
    assets_dir = os.path.join(folder, "assets")
    for name in sorted(os.listdir(assets_dir)) if os.path.isdir(assets_dir) else []:
        with open(os.path.join(assets_dir, name), "rb") as f:
            files[f"assets/{name}"] = f.read()
    return files


def main(target):
    if target.endswith(".zip"):
        with zipfile.ZipFile(target) as z:
            files = {n: z.read(n) for n in z.namelist() if not n.endswith("/")}
        zip_path = None
    else:
        files = read_folder(target)
        zip_path = target.rstrip("/") + ".zip"
    manifest, images, image_bytes = check_files(files)
    if zip_path:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for name in sorted(files):
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, files[name])
        data = buffer.getvalue()
        if len(data) > 20 << 20:
            raise PackError("ZIP exceeds 20 MiB")
        with open(zip_path, "wb") as f:
            f.write(data)
    print(f"ok  {manifest['id']}: {images} images, {image_bytes} bytes" + (f" -> {zip_path}" if zip_path else ""))


if __name__ == "__main__":
    try:
        for arg in sys.argv[1:]:
            main(arg)
    except PackError as error:
        sys.exit(f"error: {error}")
