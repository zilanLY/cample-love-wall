const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');

// 读取 HTML 文件并转换为 JS 导出
function buildPage(htmlFile, jsFile, exportName) {
  const htmlPath = path.join(pagesDir, htmlFile);
  const jsPath = path.join(pagesDir, jsFile);
  
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  
  // 转义反斜杠、反引号和 ${}
  const escapedContent = htmlContent
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  
  const jsContent = `export const ${exportName} = \`${escapedContent}\`;\n`;
  
  fs.writeFileSync(jsPath, jsContent, 'utf-8');
  console.log(`✓ Built ${htmlFile} -> ${jsFile}`);
}

console.log('Building pages...');

buildPage('admin.html', 'admin.html.js', 'ADMIN_HTML');
buildPage('index.html', 'index.html.js', 'INDEX_HTML');

console.log('Done!');
