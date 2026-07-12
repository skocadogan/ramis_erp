#!/usr/bin/env bash
# Patches the nsis@1.2.1 bundle's Linux binary with a Wine + path-conversion wrapper.
#
# WHY:
#   - Native Linux NSIS 3.12 binary: lacks !define /IfNDef /math support.
#   - Windows makensis.exe via Wine: requires Unix absolute paths → Z:\ conversion.
#
# RUN ONCE after the bundle is downloaded (first "npm run package:win" downloads it),
# or re-run after clearing the electron-builder cache (~/.cache/electron-builder/):
#
#   bash electron_apps/setup-nsis-wine.sh
#
set -euo pipefail

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/electron-builder"
BUNDLE_DIR=""

for d in "$CACHE_DIR"/nsis@1.2.1/nsis-bundle-*/; do
  if [ -d "$d" ] && [ -f "${d}linux/x64/makensis" ]; then
    BUNDLE_DIR="$d"
    break
  fi
done

if [ -z "$BUNDLE_DIR" ]; then
  echo "❌ nsis@1.2.1 bundle not found in $CACHE_DIR." >&2
  echo "   Run 'cd electron_apps/kds && npm run package:win' first (it will fail)," >&2
  echo "   then re-run this script to apply the patch." >&2
  exit 1
fi

TARGET="${BUNDLE_DIR}linux/x64/makensis"

if head -3 "$TARGET" 2>/dev/null | grep -q "Wine-based wrapper"; then
  echo "✓ Already patched: $TARGET"
  exit 0
fi

# Backup original binary
[ -f "${TARGET}.orig" ] || cp "$TARGET" "${TARGET}.orig"

cat > "$TARGET" << 'EOF'
#!/usr/bin/env bash
# Wine-based wrapper for Linux cross-compilation with path conversion.
# The native Linux NSIS 3.12 binary lacks !define /IfNDef /math support.
# Windows makensis.exe via Wine requires Unix absolute paths → Z:\ conversions.
# NSISDIR is set by the bundle entrypoint script before calling this binary.
exec python3 -c '
import sys, re, subprocess, os

def to_wine(p):
    return "Z:" + p.replace("/", "\\\\")

def maybe_wine(p):
    return to_wine(p) if p.startswith("/") else p

def convert_d_args(args):
    out = []
    for arg in args:
        if arg.startswith("-D") and "=" in arg:
            key, val = arg[2:].split("=", 1)
            val = maybe_wine(val)
            out.append("-D" + key + "=" + val)
        else:
            out.append(arg)
    return out

def convert_script_paths(script):
    return re.sub(
        r"(?m)^(!include\s+)\"(/[^\"]+)\"",
        lambda m: m.group(1) + "\"" + to_wine(m.group(2)) + "\"",
        script
    )

args = sys.argv[1:]
nsisdir = os.environ.get("NSISDIR", "")
makensis_exe = os.path.join(nsisdir, "makensis.exe")
converted_args = convert_d_args(args)

if converted_args and converted_args[-1] == "-":
    raw = sys.stdin.buffer.read()
    try:
        script = raw.decode("utf-8")
    except UnicodeDecodeError:
        script = raw.decode("latin-1")
    converted_script = convert_script_paths(script)
    proc = subprocess.run(
        ["wine", makensis_exe] + converted_args,
        input=converted_script.encode("utf-8"),
        env=dict(os.environ)
    )
    sys.exit(proc.returncode)
else:
    os.execvp("wine", ["wine", makensis_exe] + converted_args)
' "$@"
EOF

chmod +x "$TARGET"
echo "✓ Patched: $TARGET"
