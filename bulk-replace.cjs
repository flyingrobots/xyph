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

  // Replace `graph.hasNode(` with `graph.worldline().hasNode(`
  if (content.includes('graph.hasNode(')) {
    content = content.replace(/graph\.hasNode\(/g, 'graph.worldline().hasNode(');
    changed = true;
  }

  // Replace `graph.getNodeProps(` with `graph.worldline().getNodeProps(`
  if (content.includes('graph.getNodeProps(')) {
    content = content.replace(/graph\.getNodeProps\(/g, 'graph.worldline().getNodeProps(');
    changed = true;
  }

  // Replace `graph.query()` with `graph.worldline().query()`
  if (content.includes('graph.query()')) {
    content = content.replace(/graph\.query\(\)/g, 'graph.worldline().query()');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content);
    changedFiles++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Updated ${changedFiles} files.`);
