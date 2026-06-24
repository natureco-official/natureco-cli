# Note 4 — Workflow Template'leri

> **Release, publish, test, git push workflow'larının kopyala-yapıştır şablonları.**
> Güncelleme: 24 Haziran 2026

## npm Release (NatureCo CLI)

```bash
cd /Users/gencay/Projects/natureco-cli

# 1. Version (2 yerde)
# - package.json: "version": "X.Y.Z"
# - CHANGELOG.md: yeni entry

# 2. Test
node --check bin/natureco.js
npm test

# 3. Publish
npm publish --access public

# 4. Git
git add -A
git -c user.name="Parton" -c user.email="gencay@natureco.me" commit -m "release: vX.Y.Z <description>"
git tag -a vX.Y.Z -m "vX.Y.Z - <description>"
git push origin master
git push origin vX.Y.Z

# 5. GitHub release
gh release create vX.Y.Z --generate-notes
```

## PyPI Release (Codedna)

```bash
cd /Users/gencay/Downloads/codedna_translated

# 1. Version (3 yerde güncelle)
# - pyproject.toml: version = "X.Y.Z"
# - codedna/__init__.py: __version__ = "X.Y.Z"
# - CHANGELOG.md: yeni entry

# 2. Syntax check
python3 -c "import ast; ast.parse(open('codedna/cli.py').read())" && echo "OK"

# 3. Build
rm -rf dist/
uv build

# 4. Publish (PyPI token from /tmp/pypi_token.txt)
python3 /tmp/upload_codedna_X_Y_Z.py

# 5. Cache-bust local install
uv tool uninstall codedna
rm -rf ~/.local/share/uv/tools/codedna
rm -f ~/.local/bin/codedna
uv cache clean
sleep 30
uv tool install --force 'codedna==X.Y.Z'
~/.local/bin/codedna --version

# 6. Git commit + tag + push
git add -A
git -c user.name="Parton" -c user.email="gencay@natureco.me" commit -m "release: vX.Y.Z <description>"
git tag -a vX.Y.Z -m "vX.Y.Z - <description>"

# 7. GitHub push (with token, then clean)
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/natureco-official/codedna.git"
git push origin master
git push origin vX.Y.Z
git remote set-url origin "https://github.com/natureco-official/codedna.git"

# 8. GitHub release
python3 /tmp/publish_vXXX.py
```

## Patch Cascade Karar Ağacı

```
Mevcut: 5.6.43
Patch ekle → 5.6.44 (1)
Patch ekle → 5.6.45 (2)
Patch ekle → 5.6.46 (3)
Patch ekle → 5.6.47 (4)
Patch ekle → 5.6.48 (5! MINOR'A GEÇ!)
  → 5.6.48 + 5.7.0 olarak ayrı yayınla
  → VEYA: 5.6.47 → 5.7.0 direkt atla
```

## Codedna Doctor Test

```bash
~/.local/bin/codedna doctor

# Beklenen çıktı (İngilizce, legacy estetik):
# 🧬 CodeDNA — System health check running...
# ─── Python Environment ───
#   ✓ Python 3.10.20 (≥ 3.10 required)
#   ✓ CodeDNA vX.Y.Z — /path/to/codedna
# ─── Git Integration ───
#   ✓ Git: git version 2.5X.X
# ... (8 kategori, 19 check)
# ─── Summary ───
#   ✗  2 critical issue(s), 0 warning(s).
#     • missing:gitpython
#     • missing:pyjwt
```

## NatureCo CLI Doctor Test

```bash
natureco doctor

# Beklenen: Sistem durumu, provider, model, channel durumu
# v5.6.43+ ile birlikte geldi
```

## Codedna Demo Test

```bash
# 1. Temizle
codedna demo --reset
# Beklenen: "✓ Demo data cleared. Removed: 164 rows"

# 2. Seed
codedna demo --data-only
# Beklenen: 47 commits, 8 files, 4 authors, 3 sprints

# 3. Tekrar seed (idempotent)
codedna demo --data-only
# Beklenen: "⚠ Demo data already seeded"
```

## Test Komutları (Patron'un Windows'unda)

```powershell
# Eski sürümü kaldır
pip uninstall codedna -y

# Yeni sürümü yükle
pip install --upgrade codedna

# PATH ekle (ilk seferde)
$env:Path += ";$env:LocalAppData\Python\pythoncore-3.14-64\Scripts"

# Test
codedna --version
codedna doctor
codedna demo --data-only
codedna setup --show
codedna update --check
```

## Hata Senaryoları

### "uv: no version of codedna==X.Y.Z"
→ PyPI CDN henüz propagate olmamış. 30-60 saniye bekle, tekrar dene.
→ Cache temizle: `rm -rf ~/.cache/uv && uv tool install --force 'codedna==X.Y.Z'`

### "Permission denied" (token dosyası)
→ chmod 644 yap: `chmod 644 /Users/gencay/.natureco/github_token`
→ 600 bash subshell'lerde okunamaz, 644 her yerden okunur.

### Token masking (***)
→ Dosyadan oku, asla inline string yazma.
→ Base64 encode alternatif olarak kullanılabilir.

### Patch cascade ihlali
→ 5+ patch üst üste → minor bump.
→ 5.6.43 → 5.6.44 → 5.6.45 → 5.6.46 → 5.6.47 (4 OK) → 5.6.48 (5! minor'a geç) → 5.7.0

## PyPI Token Upload Script Template

```python
"""Publish codedna X.Y.Z to PyPI. Token reads from file, never inline."""
import subprocess

with open('/tmp/pypi_token.txt') as f:
    raw = f.read()
token = raw.strip()
del raw

result = subprocess.run(
    [
        'uv', 'tool', 'run', '--from', 'twine', 'twine', 'upload',
        'dist/codedna-X.Y.Z-py3-none-any.whl',
        'dist/codedna-X.Y.Z.tar.gz',
        '--username', '__token__',
        '--password', token,
    ],
    capture_output=True,
    text=True,
)
print("Exit:", result.returncode)
print("Last:", result.stdout[-200:])
```

## GitHub Release Script Template

```python
"""Push vX.Y.Z to GitHub + create release."""
import json
import subprocess
import urllib.request
import urllib.error

with open('/Users/gencay/.natureco/github_token') as f:
    raw = f.read()
token_gh = raw.strip()
del raw
REPO = 'owner/repo'

# Push
remote_url = f'https://{token_gh}@github.com/{REPO}.git'
subprocess.run(['git', 'remote', 'set-url', 'origin', remote_url], capture_output=True)
for ref in ['master', 'vX.Y.Z']:
    r = subprocess.run(['git', 'push', 'origin', ref], capture_output=True, text=True, timeout=60)
    print(f"push {ref}: exit {r.returncode}")
subprocess.run(['git', 'remote', 'set-url', 'origin', f'https://github.com/{REPO}.git'])

# Release
body = """## vX.Y.Z — <Title>

### <Section>
- ...
"""

payload = {
    'tag_name': 'vX.Y.Z',
    'name': 'vX.Y.Z — <Title>',
    'body': body,
    'draft': False,
    'prerelease': False,
}
req = urllib.request.Request(
    f'https://api.github.com/repos/{REPO}/releases',
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'Authorization': f'Bearer {token_gh}',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
    },
    method='POST',
)
with urllib.request.urlopen(req, timeout=15) as r:
    rel = json.loads(r.read())
    print(f"Release: {rel['html_url']}")
```
