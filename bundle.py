"""Embed local game assets so index.html also works as a standalone file."""
from pathlib import Path
import re
import base64
import mimetypes

root = Path(__file__).resolve().parent
page = (root / "index.html").read_text()
css = (root / "style.css").read_text()
# The downloadable game must work without fonts or other network resources.
css = re.sub(r"^@import[^\n]*\n", "", css)
def asset_uri(name):
    asset = (root / name).resolve()
    if not asset.is_relative_to(root / 'assets'):
        raise ValueError('Image must be under assets/')
    mime = mimetypes.guess_type(asset.name)[0]
    if mime not in ('image/webp', 'image/png', 'image/jpeg', 'font/woff', 'font/woff2'):
        raise ValueError('Expected a compressed raster image or bundled web font')
    return 'data:' + mime + ';base64,' + base64.b64encode(asset.read_bytes()).decode()

# The sprite sheet is embedded once; individual icons reuse its CSS variable.
css = re.sub(r'url\("(assets/[^"\n]+)"\)', lambda m: 'url("' + asset_uri(m.group(1)) + '")', css)
scripts = "\n".join((root / name).read_text() for name in ("engine.js", "social-config.js", "social.js", "game.js", "community.js"))
if "</script" in scripts.lower() or "</style" in css.lower():
    raise ValueError("Asset contains an unexpected HTML closing tag")

style_block = "<!-- GAME STYLE START -->\n<style>\n" + css + "\n</style>\n<!-- GAME STYLE END -->"
script_block = "<!-- GAME SCRIPT START -->\n<script>\n" + scripts + "\n</script>\n<!-- GAME SCRIPT END -->"
if "<!-- GAME STYLE START -->" in page:
    page, count = re.subn(r"<!-- GAME STYLE START -->.*?<!-- GAME STYLE END -->", lambda _: style_block, page, flags=re.S)
    if count != 1:
        raise ValueError("Expected exactly one style block")
else:
    page = page.replace('<link rel="stylesheet" href="style.css">', style_block)
    page = page.replace('  <script src="engine.js" defer></script>\n', '')
    page = page.replace('  <script src="game.js" defer></script>\n', '')
if "<!-- GAME SCRIPT START -->" in page:
    page, count = re.subn(r"<!-- GAME SCRIPT START -->.*?<!-- GAME SCRIPT END -->", lambda _: script_block, page, flags=re.S)
    if count != 1:
        raise ValueError("Expected exactly one script block")
else:
    page = page.replace('</body>', script_block + '\n</body>')
# Keep the art inside the single downloadable file, including script-free previews.
def embed_asset(match):
    tag = match.group(0)
    source = asset_uri(match.group(1))
    tag = re.sub(r'\s+src="[^"]*"', '', tag)
    return tag[:-1] + ' src="' + source + '">'
page = re.sub(r'<img\b[^>]*data-asset="([^"]+)"[^>]*>', embed_asset, page)
if len(page.encode()) > 1_200_000:
    raise ValueError('Standalone page must stay below 1.2 MB')
(root / "index.html").write_text(page)
print("Built standalone index.html")
