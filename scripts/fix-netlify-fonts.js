const fs = require('fs');
const path = require('path');

// Netlify doesn't serve files from paths containing "node_modules" or "@" prefixed dirs.
// This script copies font files to a flat /assets/fonts/ directory and rewrites
// references in all HTML and JS files in the dist folder.

const DIST = path.join(__dirname, '..', 'dist');
const FONTS_SRC = path.join(DIST, 'assets', 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'Fonts');
const FONTS_DEST = path.join(DIST, 'assets', 'fonts');

const OLD_PREFIX = '/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/';
const NEW_PREFIX = '/assets/fonts/';

// 1. Copy font files
if (fs.existsSync(FONTS_SRC)) {
  fs.mkdirSync(FONTS_DEST, { recursive: true });
  for (const file of fs.readdirSync(FONTS_SRC)) {
    fs.copyFileSync(path.join(FONTS_SRC, file), path.join(FONTS_DEST, file));
  }
  console.log(`Copied ${fs.readdirSync(FONTS_SRC).length} font files to ${FONTS_DEST}`);
} else {
  console.warn('Font source directory not found, skipping font copy');
  process.exit(0);
}

// 2. Rewrite references in HTML and JS files
function rewriteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(OLD_PREFIX)) {
    const updated = content.split(OLD_PREFIX).join(NEW_PREFIX);
    fs.writeFileSync(filePath, updated, 'utf8');
    return true;
  }
  return false;
}

function walkDir(dir, extensions) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walkDir(fullPath, extensions);
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      if (rewriteFile(fullPath)) count++;
    }
  }
  return count;
}

const rewritten = walkDir(DIST, ['.html', '.js']);
console.log(`Rewrote font paths in ${rewritten} files`);
