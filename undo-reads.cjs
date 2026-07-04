const fs = require('fs');
const path = require('path');

const READ_METHODS = [
  'hasNode',
  'getNodeProps',
  'getNodes',
  'getEdges',
  'getContentOid',
  'neighbors',
  'queryNodes',
  'getNodeValue',
  'resolveNodeContent'
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

const files = walk(path.join(__dirname, 'src')).concat(walk(path.join(__dirname, 'test')));
let count = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  for (const method of READ_METHODS) {
    // Revert `.worldline().method` back to `.method`
    const regex = new RegExp(`\\.worldline\\(\\)\\.(${method})\\(`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, `.$1(`);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    count++;
    console.log(`Reverted ${file}`);
  }
}
console.log(`Reverted ${count} files.`);
