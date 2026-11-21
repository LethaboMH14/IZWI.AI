#!/usr/bin/env python3
"""Verify committed assets, local documentation links and presentation structure."""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    manifest = json.loads((ROOT / 'assets/manifest.json').read_text())
    errors = []
    seen = set()
    for item in manifest['assets']:
        relative = item['path']
        p = (ROOT / relative).resolve()
        if not p.is_relative_to(ROOT) or relative in seen:
            errors.append(f'Invalid or duplicate asset path: {relative}')
            continue
        seen.add(relative)
        if not p.is_file():
            errors.append(f'Missing: {relative}')
            continue
        data = p.read_bytes()
        # Windows checkouts with core.autocrlf turn LF into CRLF in text files; compare the committed form.
        if p.suffix in {'.txt', '.md', '.csv', '.json'} and b'\r\n' in data:
            data = data.replace(b'\r\n', b'\n')
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            errors.append(f'Checksum/size mismatch: {relative}')
        if p.suffix == '.png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            errors.append(f'Invalid PNG signature: {relative}')
        if p.suffix == '.pdf' and not data.startswith(b'%PDF-'):
            errors.append(f'Invalid PDF signature: {relative}')
        if p.suffix in {'.pptx', '.zip'}:
            try:
                with zipfile.ZipFile(p) as z:
                    bad = z.testzip()
                    if bad:
                        errors.append(f'Corrupt archive member: {relative}: {bad}')
                    if p.suffix == '.pptx':
                        slides = [n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)]
                        if len(slides) != 12:
                            errors.append(f'Expected 12 slides: {relative}, got {len(slides)}')
            except zipfile.BadZipFile:
                errors.append(f'Invalid archive: {relative}')
    for md in ROOT.rglob('*.md'):
        if '.git' in md.parts or 'node_modules' in md.parts or '.next' in md.parts:
            continue
        for target in re.findall(r'\]\(([^)]+)\)', md.read_text(encoding='utf-8')):
            if '://' in target or target.startswith(('#', 'mailto:')):
                continue
            local = unquote(target.split('#', 1)[0])
            if local and not (md.parent / local).exists():
                errors.append(f'Broken link in {md.relative_to(ROOT)}: {target}')
    sys.path.insert(0, str(ROOT / 'scripts'))
    from criteria_check import check as check_criteria
    criteria_errors, _ = check_criteria()
    errors.extend(criteria_errors)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f'PASS: {len(seen)} asset checksums, document links and 12-slide presentations verified.')
    print('This checks handoff integrity, not app behaviour or PowerPoint animation playback.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
