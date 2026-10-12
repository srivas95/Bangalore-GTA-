// Copies the root project's web build (../../dist) into ./web for packaging, and the icon into ./build.
const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../dist');
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('No web build found. Run `npm run build` in the project root first.');
  process.exit(1);
}
fs.rmSync(path.join(__dirname, 'web'), { recursive: true, force: true });
fs.cpSync(src, path.join(__dirname, 'web'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
fs.copyFileSync(path.resolve(__dirname, '../assets/icon.png'), path.join(__dirname, 'build', 'icon.png'));
console.log('Copied the web build into apps/desktop/web');
