const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let changedFiles = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (content.includes('graph.worldline().getContentOid(')) {
    content = content.replace(/graph\.worldline\(\)\.getContentOid\(/g, 'graph.getContentOid(');
    changed = true;
  }

  if (content.includes('graph.worldline().getContent(')) {
    content = content.replace(/graph\.worldline\(\)\.getContent\(/g, 'graph.getContent(');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content);
    changedFiles++;
    console.log(`Updated ${file}`);
  }
}
console.log(`Updated ${changedFiles} files.`);
