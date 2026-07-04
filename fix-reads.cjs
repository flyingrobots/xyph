const fs = require('fs');
const path = require('path');

const DIRECT_REPLACE_METHODS = [
  'hasNode',
  'getNodeProps',
  'getNodes',
  'getEdges',
  'neighbors',
  'queryNodes',
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git') && !filePath.includes('dist')) {
        results = results.concat(walk(filePath));
      }
    } else if (filePath.endsWith('.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let count = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  for (const method of DIRECT_REPLACE_METHODS) {
    // Replace `graph.method` with `graph.worldline().method`
    const regex = new RegExp(`(?<!worldline\\(\\))\\.(${method})\\(`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, `.worldline().$1(`);
      changed = true;
    }
  }

  // Handle getContentOid specially
  const contentRegex = /(?<!worldline\(\))\.getContentOid\(([^)]+)\)/g;
  if (contentRegex.test(content)) {
    // Instead of `graph.getContentOid(id)`, do `(await graph.worldline().getNodeProps(id))?.['_content'] ?? null`
    // Wait, `await graph.getContentOid(id)` is common.
    // If we replace `.getContentOid(id)` with `.worldline().getNodeProps($1).then(p => typeof p?.['_content'] === 'string' ? p['_content'] : null)`
    // That avoids needing to mess with `await`.
    content = content.replace(contentRegex, `.worldline().getNodeProps($1).then((p: any) => typeof p?.['_content'] === 'string' ? p['_content'] : null)`);
    changed = true;
  }

  // Also replace .getContent(
  const blobRegex = /(?<!worldline\(\))\.getContent\(([^)]+)\)/g;
  if (blobRegex.test(content)) {
    // Wait, does worldline have getContent? No.
    // How does git-warp get content without materializing?
    // We didn't solve `getContent` yet!
  }

  if (changed) {
    if (file.includes('.test.ts')) {
      // For tests, we might need to fix `worldline()` mocks
      // E.g. changing `hasNode: vi.fn()` to `worldline: vi.fn(() => ({ hasNode: vi.fn() }))`
      // But it's easier to just run the script, see what breaks, and fix manually or script the fixes.
    }
    fs.writeFileSync(file, content, 'utf8');
    count++;
    console.log(`Updated ${file}`);
  }
}
console.log(`Updated ${count} files.`);
