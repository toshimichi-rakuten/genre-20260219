const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.shtml': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// SSI変数を取得
function getSSIVariables(filePath, req) {
  const now = new Date();
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  
  return {
    'DATE_LOCAL': now.toLocaleString('ja-JP'),
    'DATE_GMT': now.toUTCString(),
    'DOCUMENT_NAME': path.basename(filePath),
    'DOCUMENT_URI': req.url,
    'LAST_MODIFIED': stats ? stats.mtime.toLocaleString('ja-JP') : now.toLocaleString('ja-JP'),
    'QUERY_STRING': req.url.split('?')[1] || '',
  };
}

// SSIディレクティブを処理
function processSSI(content, filePath, req, baseDir) {
  const variables = getSSIVariables(filePath, req);
  
  // <!--#include virtual="path" --> を処理
  content = content.replace(/<!--#include\s+virtual="([^"]+)"\s*-->/g, (match, includePath) => {
    try {
      const fullPath = path.join(baseDir, includePath);
      if (fs.existsSync(fullPath)) {
        let includeContent = fs.readFileSync(fullPath, 'utf8');
        // 再帰的にSSIを処理
        return processSSI(includeContent, fullPath, req, baseDir);
      }
      return `<!-- Include file not found: ${includePath} -->`;
    } catch (err) {
      return `<!-- Error including file: ${err.message} -->`;
    }
  });
  
  // <!--#echo var="VAR_NAME" --> を処理
  content = content.replace(/<!--#echo\s+var="([^"]+)"\s*-->/g, (match, varName) => {
    return variables[varName] || '';
  });
  
  // <!--#if expr="${VAR} = /value/" --> を処理（簡易版）
  content = content.replace(/<!--#if\s+expr="\$\{([^}]+)\}\s*=\s*\/([^\/]+)\/"\s*-->([\s\S]*?)<!--#else\s*-->([\s\S]*?)<!--#endif\s*-->/g, 
    (match, varName, value, trueContent, falseContent) => {
      const varValue = variables[varName] || '';
      return varValue.includes(value) ? trueContent : falseContent;
    }
  );
  
  return content;
}

const server = http.createServer((req, res) => {
  // URLをデコードしてクエリパラメータを除去
  let requestPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join('.', requestPath);

  console.log(`Request: ${req.url} -> ${filePath}`);

  // ディレクトリの場合はindex.shtmlまたはindex.htmlを探す
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const indexShtml = path.join(filePath, 'index.shtml');
    const indexHtml = path.join(filePath, 'index.html');

    if (fs.existsSync(indexShtml)) {
      filePath = indexShtml;
      console.log(`  -> Directory, serving: ${filePath}`);
    } else if (fs.existsSync(indexHtml)) {
      filePath = indexHtml;
      console.log(`  -> Directory, serving: ${filePath}`);
    }
  }

  // ファイルが存在するか確認
  if (!fs.existsSync(filePath)) {
    console.log(`  -> File not found: ${filePath}`);
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`<h1>404 - File Not Found</h1><p>Path: ${filePath}</p>`, 'utf-8');
    return;
  }

  const extname = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  // バイナリファイルの場合
  if (!['.html', '.shtml', '.css', '.js', '.json', '.svg'].includes(extname)) {
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
    return;
  }

  // テキストファイルの場合
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.log(`  -> Error reading file: ${err.message}`);
      res.writeHead(500);
      res.end('Server Error: ' + err.code);
    } else {
      // .shtmlまたは.htmlファイルの場合はSSIを処理
      if (extname === '.shtml' || extname === '.html') {
        content = processSSI(content, filePath, req, '.');
      }

      console.log(`  -> Serving: ${filePath} (${contentType})`);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`SSI Server running at http://localhost:${PORT}/`);
});
