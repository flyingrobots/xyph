const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!filePath.includes('node_modules')) {
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
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('.worldline().')) {
    const newContent = content.replace(/\.worldline\(\)\./g, '.');
    fs.writeFileSync(file, newContent, 'utf8');
    count++;
    console.log(`Updated ${file}`);
  }
}
console.log(`Updated ${count} files.`);
