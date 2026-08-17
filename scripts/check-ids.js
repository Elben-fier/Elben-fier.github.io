const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('js/app.js', 'utf8');

const htmlIds = new Set();
for (const m of html.matchAll(/id="([^"]+)"/g)) htmlIds.add(m[1]);

const jsIds = new Set();
for (const m of js.matchAll(/\$\('([^']+)'\)/g)) jsIds.add(m[1]);
for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) jsIds.add(m[1]);

// classes referenced via querySelectorAll
const classes = [];
for (const m of js.matchAll(/querySelectorAll\('\.([a-zA-Z-]+)'\)/g)) classes.push(m[1]);

const missing = [...jsIds].filter(id => !htmlIds.has(id));
console.log('HTML ids:', htmlIds.size, '| JS referenced ids:', jsIds.size, '| classes:', classes.join(','));

const missingClasses = classes.filter(c => !html.includes('class="' + c) && !html.includes(c + ' '));
if (missingClasses.length) console.log('MISSING class refs:', missingClasses);

if (missing.length) {
    console.log('MISSING in HTML:', missing);
    process.exit(1);
} else {
    console.log('All JS-referenced ids exist in HTML ✓');
}
