# Usage: build-icon-assets.sh
# Need xcode for this, xcode command line tools is not enough.
# Raster icons are rendered from icon-logo.svg with rsvg-convert (brew install librsvg).

# exit immediately if a command exits with a non-zero status.
set -e

# print commands and their arguments as they are executed.
set -x

function compile() {
  rm -f Assets.car icon-logo.icns icon-logo-legacy.icns

  echo "`pwd`"

  OUTDIR=$(mktemp -d)
  PLISTPATH="$OUTDIR/Info.plist"

  xcrun -v actool "$(pwd)/icon-logo.icon" --compile $OUTDIR \
  --output-format human-readable-text \
  --notices --warnings --errors \
  --output-partial-info-plist $PLISTPATH \
  --app-icon icon-logo \
  --include-all-app-icons \
  --enable-on-demand-resources NO \
  --development-region en \
  --target-device mac \
  --minimum-deployment-target 26.0 \
  --platform macosx

  mv $OUTDIR/Assets.car ./
  # Keep a distinct basename so Electron Packager does not find icon-logo.icon
  # and try to compile it, which requires a macOS 26 build host.
  mv $OUTDIR/icon-logo.icns ./icon-logo-legacy.icns
  rm -rf $OUTDIR
}

# 由 icon-logo.svg 渲染 Windows 的 icon-logo.ico（内嵌多个尺寸的 PNG）
function render_ico() {
  PNGDIR=$(mktemp -d)
  for size in 16 24 32 48 64 128 256; do
    rsvg-convert -w $size -h $size icon-logo.svg -o "$PNGDIR/$size.png"
  done

  node - "$PNGDIR" icon-logo.ico <<'EOF'
const fs = require('fs')
const path = require('path')
const [dir, out] = process.argv.slice(2)
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map(size => fs.readFileSync(path.join(dir, `${size}.png`)))
const header = Buffer.alloc(6 + 16 * images.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
images.forEach((image, i) => {
  const entry = 6 + 16 * i
  header.writeUInt8(sizes[i] % 256, entry)
  header.writeUInt8(sizes[i] % 256, entry + 1)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(image.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += image.length
})
fs.writeFileSync(out, Buffer.concat([header, ...images]))
EOF

  rm -rf "$PNGDIR"
}

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/../app/static/logos"

echo "`pwd`"

# So I have absolutely no idea why but it seems actool gets
# "stuck" sometimes and ignores whatever directory we're switching to and just
# compiles in the last folder it was in. So for example, it could get stuck in the
# prod folder so that the dev folder always gets the prod icons.
#
# If you delete the prod folder and run the script without attempting to compile prod
# it'll give you some error about cwd being nil. Luckily we won't have to do this all
# that often but if you're attempting to regenerate the Assets.car file I would suggest
# doing one folder at a time, zipping up the other to get it out of the way. 
#
# /* com.apple.actool.errors */
# error: NSString *IBCurrentDirectoryPath(NSError *__autoreleasing *) – currentDirectoryPath is unexpectedly nil
#     Failure Reason: Operation not permitted
# error: Not enough arguments provided; where is the input document to operate on?
(cd "prod" && compile && render_ico)
(cd "dev" && compile && render_ico)

# Linux 安装包图标与关于对话框中的应用图标
rsvg-convert -w 512 -h 512 prod/icon-logo.svg -o ../linux/icon-logo.png
rsvg-convert -w 128 -h 128 prod/icon-logo.svg -o ../common/logo-64x64@2x.png
rsvg-convert -w 128 -h 128 prod/icon-logo.svg -o ../common/windows-logo-64x64@2x.png

# Windows 安装过程中显示的启动画面
SPLASH=$(mktemp -d)
rsvg-convert win32-installer-splash.svg -o "$SPLASH/splash.png"
sips -s format gif "$SPLASH/splash.png" --out win32-installer-splash.gif
rm -rf "$SPLASH"
