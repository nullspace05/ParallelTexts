#!/usr/bin/env python3
"""
Convert an Aozora Bunko XHTML file (Shift_JIS) into an EPUB with embedded images.

Usage:
  python scripts/aozora-to-epub.py books/alice_wond_jp.html
  python scripts/aozora-to-epub.py books/alice_wond_jp.html -o books/alice_wond_jp.epub
"""

from __future__ import annotations

import argparse
import re
import sys
import uuid
import zipfile
from html import escape
from pathlib import Path

ENCODING_ALIASES = {
    "shift_jis": "shift_jis",
    "shiftjis": "shift_jis",
    "sjis": "shift_jis",
    "windows_31j": "cp932",
    "cp932": "cp932",
    "euc_jp": "euc_jp",
    "utf_8": "utf-8",
    "utf8": "utf-8",
}


def detect_encoding(html_bytes: bytes) -> str:
    head = html_bytes[:8192].decode("ascii", errors="ignore")
    match = re.search(
        r'charset\s*=\s*["\']?\s*([^"\'\s;>]+)',
        head,
        flags=re.IGNORECASE,
    )
    if match:
        key = match.group(1).lower().replace("-", "_")
        if key in ENCODING_ALIASES:
            return ENCODING_ALIASES[key]
        return match.group(1)
    # Aozora XHTML downloads are almost always Shift_JIS.
    return "shift_jis"


def decode_html(html_bytes: bytes) -> str:
    encoding = detect_encoding(html_bytes)
    try:
        return html_bytes.decode(encoding)
    except LookupError as exc:
        raise ValueError(f"Unsupported encoding: {encoding}") from exc


def meta_content(html: str, name: str) -> str | None:
    pattern = rf'<meta\s+name="{re.escape(name)}"\s+content="([^"]*)"'
    match = re.search(pattern, html, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


VOID_ELEMENTS = frozenset({"br", "hr", "img", "meta", "link", "input", "rp"})
TAG_RE = re.compile(r"<(/?)([\w:]+)([^>]*?)(/?)>")


def normalize_for_xhtml(fragment: str) -> str:
    # Aozora files sometimes include a stray </div> before after_text notes.
    fragment = re.sub(
        r"</div>\s*(<div class=\"after_text\">)",
        r"\1",
        fragment,
        count=1,
    )

    for tag in ("br", "hr", "img", "meta", "link", "input"):
        fragment = re.sub(
            rf"<{tag}(\s[^>]*?)?>",
            rf"<{tag}\1/>",
            fragment,
            flags=re.IGNORECASE,
        )
        fragment = re.sub(
            rf"<{tag}(\s[^>]*?)?/></{tag}>",
            rf"<{tag}\1/>",
            fragment,
            flags=re.IGNORECASE,
        )

    return repair_fragment(fragment)


def repair_fragment(fragment: str) -> str:
    stack: list[str] = []
    parts: list[str] = []
    last = 0

    for match in TAG_RE.finditer(fragment):
        parts.append(fragment[last : match.start()])
        closing, tag, _attrs, self_closing = match.groups()
        tag = tag.lower()
        original = match.group(0)

        if self_closing or tag in VOID_ELEMENTS:
            parts.append(original)
        elif closing:
            if not stack:
                last = match.end()
                continue
            if stack[-1] == tag:
                stack.pop()
                parts.append(original)
            elif tag in stack:
                while stack and stack[-1] != tag:
                    parts.append(f"</{stack.pop()}>")
                if stack and stack[-1] == tag:
                    stack.pop()
                    parts.append(original)
            else:
                last = match.end()
                continue
        else:
            stack.append(tag)
            parts.append(original)

        last = match.end()

    parts.append(fragment[last:])
    while stack:
        parts.append(f"</{stack.pop()}>")

    return "".join(parts)


def extract_main_text(html: str) -> str:
    start_marker = '<div class="main_text">'
    end_marker = '<div class="notation_notes">'
    start = html.find(start_marker)
    end = html.find(end_marker)
    if start < 0 or end < 0:
        raise ValueError('Could not find <div class="main_text"> in HTML')
    return html[start + len(start_marker) : end].strip()


def extract_headings(html: str) -> list[tuple[str, str]]:
    return re.findall(
        r'<a class="midashi_anchor" id="(midashi\d+)">([^<]+)</a>',
        html,
    )


def rewrite_asset_paths(content: str, html_dir: Path) -> tuple[str, list[tuple[str, Path]]]:
    assets: dict[str, Path] = {}

    def replace_src(match: re.Match[str]) -> str:
        raw = match.group(1)
        if raw.startswith(("http://", "https://", "data:")):
            return match.group(0)
        resolved = (html_dir / raw).resolve()
        if not resolved.is_file():
            return match.group(0)
        name = resolved.name
        assets[name] = resolved
        return f'src="images/{name}"'

    updated = re.sub(r'src="([^"]+)"', replace_src, content)
    return updated, list(assets.items())


def simplify_css(css_text: str) -> str:
    # Kentenbosen background images are not bundled with browser saves.
    css_text = re.sub(
        r"background:\s*url\([^)]+\)[^;]*;",
        "",
        css_text,
        flags=re.IGNORECASE,
    )
    css_text += "\nimg.illustration { max-width: 100%; height: auto; }\n"
    return css_text


def build_nav_xhtml(title: str, headings: list[tuple[str, str]]) -> str:
    items = []
    for anchor_id, label in headings:
        items.append(
            f'      <li><a href="text.xhtml#{anchor_id}">{escape(label)}</a></li>'
        )
    nav_items = "\n".join(items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
  <head>
    <title>{escape(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>目次</h1>
      <ol>
{nav_items}
      </ol>
    </nav>
  </body>
</html>
"""


def build_content_xhtml(title: str, body_html: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
  <head>
    <meta charset="UTF-8"/>
    <title>{escape(title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <section epub:type="bodymatter chapter" id="main">
{body_html}
    </section>
  </body>
</html>
"""


def build_opf(
    book_id: str,
    title: str,
    creator: str,
    language: str,
    manifest_items: list[tuple[str, str, str] | tuple[str, str, str, str]],
    spine_items: list[str],
) -> str:
    def item_xml(item: tuple) -> str:
        item_id, href, media_type = item[0], item[1], item[2]
        props = item[3] if len(item) > 3 else None
        props_attr = f' properties="{props}"' if props else ""
        return f'    <item id="{item_id}" href="{href}" media-type="{media_type}"{props_attr}/>'

    manifest_xml = "\n".join(item_xml(item) for item in manifest_items)
    spine_xml = "\n".join(
        f'    <itemref idref="{item_id}"/>' for item_id in spine_items
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">{escape(book_id)}</dc:identifier>
    <dc:title>{escape(title)}</dc:title>
    <dc:creator>{escape(creator)}</dc:creator>
    <dc:language>{escape(language)}</dc:language>
    <meta property="dcterms:modified">{__import__("datetime").datetime.now(__import__("datetime").UTC).strftime("%Y-%m-%dT%H:%M:%SZ")}</meta>
  </metadata>
  <manifest>
{manifest_xml}
  </manifest>
  <spine>
{spine_xml}
  </spine>
</package>
"""


def write_epub(
    output_path: Path,
    title: str,
    creator: str,
    language: str,
    body_html: str,
    headings: list[tuple[str, str]],
    css_text: str,
    assets: list[tuple[str, Path]],
) -> None:
    book_id = f"urn:uuid:{uuid.uuid4()}"
    nav_xhtml = build_nav_xhtml(title, headings)
    content_xhtml = build_content_xhtml(title, body_html)

    manifest: list[tuple] = [
        ("nav", "nav.xhtml", "application/xhtml+xml", "nav"),
        ("style", "style.css", "text/css"),
        ("text", "text.xhtml", "application/xhtml+xml"),
    ]
    for index, (name, _) in enumerate(assets, start=1):
        manifest.append((f"img{index}", f"images/{name}", "image/png"))

    manifest.append(("ncx", "toc.ncx", "application/x-dtbncx+xml"))
    spine = ["text"]

    opf = build_opf(book_id, title, creator, language, manifest, spine)
    container = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

    nav_points = []
    for play_order, (anchor_id, label) in enumerate(headings, start=1):
        nav_points.append(
            f"""    <navPoint id="np{play_order}" playOrder="{play_order}">
      <navLabel><text>{escape(label)}</text></navLabel>
      <content src="text.xhtml#{anchor_id}"/>
    </navPoint>"""
        )
    ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="{escape(book_id)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{escape(title)}</text></docTitle>
  <navMap>
{chr(10).join(nav_points)}
  </navMap>
</ncx>
"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w") as archive:
        archive.writestr(
            "mimetype",
            "application/epub+zip",
            compress_type=zipfile.ZIP_STORED,
        )
        archive.writestr("META-INF/container.xml", container)
        archive.writestr("OEBPS/content.opf", opf.encode("utf-8"))
        archive.writestr("OEBPS/nav.xhtml", nav_xhtml.encode("utf-8"))
        archive.writestr("OEBPS/toc.ncx", ncx.encode("utf-8"))
        archive.writestr("OEBPS/text.xhtml", content_xhtml.encode("utf-8"))
        archive.writestr("OEBPS/style.css", css_text.encode("utf-8"))
        for name, asset_path in assets:
            archive.write(asset_path, f"OEBPS/images/{name}")


def looks_like_mojibake(text: str) -> bool:
    if "\ufffd" in text:
        return True
    # Common Shift_JIS read-as-Latin1/UTF-8 artifacts in this corpus.
    suspicious = ("縺", "繧", "繝", "縲", "繧｢", "繝ｪ", "繧ｹ")
    return any(token in text for token in suspicious)


def verify_epub(epub_path: Path, expected_title: str) -> None:
    with zipfile.ZipFile(epub_path, "r") as archive:
        names = archive.namelist()
        if names[0] != "mimetype":
            raise ValueError("EPUB mimetype is not the first zip entry")
        text = archive.read("OEBPS/text.xhtml").decode("utf-8")
        image_count = sum(1 for name in names if name.startswith("OEBPS/images/"))
        if image_count == 0:
            raise ValueError("EPUB contains no images")
        if expected_title not in text:
            raise ValueError(f"Expected title not found in EPUB text: {expected_title}")
        body_start = text.find("<section")
        body_sample = text[body_start : body_start + 500] if body_start >= 0 else text
        if "アリス" not in body_sample and "ふしぎ" not in body_sample:
            raise ValueError("Japanese body text not found in EPUB")
        if looks_like_mojibake(body_sample):
            raise ValueError("EPUB text looks mojibake-corrupted")
        ruby_count = text.count("<ruby>")
        if ruby_count == 0:
            raise ValueError("Expected furigana <ruby> markup in EPUB text")
        print(f"Verified EPUB: {epub_path}")
        print(f"  zip entries: {len(names)}")
        print(f"  images: {image_count}")
        print(f"  ruby tags: {ruby_count}")
        sample_idx = body_sample.find("アリス")
        if sample_idx >= 0:
            print(f"  sample: {body_sample[sample_idx : sample_idx + 40]!r}")


def convert(html_path: Path, output_path: Path) -> None:
    html_bytes = html_path.read_bytes()
    encoding = detect_encoding(html_bytes)
    html = decode_html(html_bytes)
    print(f"Read {html_path} as {encoding}")

    title = meta_content(html, "DC.Title") or "Aozora Bunko"
    creator = meta_content(html, "DC.Creator") or "Unknown"
    language = "ja"

    body_html = extract_main_text(html)
    headings = extract_headings(html)
    body_html = normalize_for_xhtml(body_html)
    body_html, assets = rewrite_asset_paths(body_html, html_path.parent)

    css_path = html_path.parent / f"{html_path.stem}_files" / "aozora.css"
    if css_path.is_file():
        css_text = simplify_css(css_path.read_text(encoding="utf-8", errors="replace"))
    else:
        css_text = "body { margin: 1em; }\nruby rt { font-size: 0.6em; }\n"

    if looks_like_mojibake(body_html):
        raise ValueError(
            f"Decoded HTML still looks corrupted; encoding {encoding!r} may be wrong"
        )

    write_epub(
        output_path=output_path,
        title=title,
        creator=creator,
        language=language,
        body_html=body_html,
        headings=headings,
        css_text=css_text,
        assets=assets,
    )
    verify_epub(output_path, expected_title=title)


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert Aozora Bunko HTML to EPUB")
    parser.add_argument("html", type=Path, help="Input Aozora XHTML file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output EPUB path (default: same name as input, .epub)",
    )
    args = parser.parse_args()

    html_path = args.html.resolve()
    if not html_path.is_file():
        print(f"Input not found: {html_path}", file=sys.stderr)
        return 1

    output_path = (
        args.output.resolve()
        if args.output
        else html_path.with_suffix(".epub")
    )

    try:
        convert(html_path, output_path)
    except Exception as exc:  # noqa: BLE001 - CLI should report conversion failures
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
