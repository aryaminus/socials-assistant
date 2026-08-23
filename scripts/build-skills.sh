#!/usr/bin/env bash
# Build .skill bundles (claude.ai web upload) for every skill in skills/.
# A .skill file is a ZIP of the skill directory renamed to .skill
# (same format aryaminus/astro ships). Output: dist/skills/<name>.skill
set -euo pipefail
cd "$(dirname "$0")/.."

OUTDIR="dist/skills"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

for skill_dir in skills/*/; do
  name="$(basename "$skill_dir")"
  (cd "$skill_dir" && zip -qr "$OLDPWD/$OUTDIR/$name.skill" SKILL.md scripts/ references/ assets/ -x '*.pyc' '__pycache__/*' 2>/dev/null || zip -qr "$OLDPWD/$OUTDIR/$name.skill" SKILL.md references/ assets/ 2>/dev/null || zip -qr "$OLDPWD/$OUTDIR/$name.skill" SKILL.md)
  echo "built $OUTDIR/$name.skill"
done

echo "Done: $(ls "$OUTDIR" | wc -l | tr -d ' ') skill bundle(s) in $OUTDIR/"
