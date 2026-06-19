const fs = require('fs');
const html = fs.readFileSync('src/pages/admin.html', 'utf8');
let escaped = html.replace(/\\/g, '\\\\');
escaped = escaped.replace(/`/g, '\\`');
escaped = escaped.replace(/\$/g, '\\$');
const js = 'export const ADMIN_HTML = `' + escaped + '`;';
fs.writeFileSync('src/pages/admin.html.js', js);
console.log('生成成功，大小:', js.length, '字节');
