const fs = require('fs');
const html = fs.readFileSync('src/pages/index.html', 'utf8');
let escaped = html.replace(/\\/g, '\\\\');
escaped = escaped.replace(/`/g, '\\`');
escaped = escaped.replace(/\$/g, '\\$');
const js = 'export const INDEX_HTML = `' + escaped + '`;';
fs.writeFileSync('src/pages/index.html.js', js);
console.log('生成成功，大小:', js.length, '字节');
