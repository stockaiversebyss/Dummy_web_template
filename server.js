const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = 3000;
const SRC_DIR  = path.join(__dirname, 'src');
const DATA_DIR = 'D:\\databank\\csvjson';

const MIME = {
  '.html' : 'text/html; charset=utf-8',
  '.css'  : 'text/css',
  '.js'   : 'application/javascript',
  '.json' : 'application/json',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.svg'  : 'image/svg+xml',
};

function latestTrendingFile() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^trendingstock_pricemover\d{8}\.json$/.test(f))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DATA_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(DATA_DIR, files[0].name) : null;
}

function latestVolumeshockerFile() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^trendingstock_volumeshocker_\d{8}\.json$/.test(f))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DATA_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(DATA_DIR, files[0].name) : null;
}

http.createServer(function(req, res) {
  let urlPath = req.url.split('?')[0];

  // Auto-resolve latest trendingstock file
  if (urlPath === '/data/trending-latest') {
    const file = latestTrendingFile();
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No trendingstock_details file found in ' + DATA_DIR);
      return;
    }
    fs.readFile(file, function(err, data) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading file: ' + file);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
    return;
  }

  // Serve trending data for a specific date: /data/trending/YYYYMMDD
  if (urlPath.startsWith('/data/trending/')) {
    const dateStr = urlPath.slice(15);
    if (!/^\d{8}$/.test(dateStr)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid date. Use YYYYMMDD.' }));
      return;
    }
    const file = path.join(DATA_DIR, 'trendingstock_pricemover' + dateStr + '.json');
    fs.readFile(file, function(err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No data found for date ' + dateStr }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
    return;
  }

  // Auto-resolve latest volumeshocker file
  if (urlPath === '/data/volumeshocker-latest') {
    const file = latestVolumeshockerFile();
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No trendingstock_volumeshocker file found in ' + DATA_DIR }));
      return;
    }
    fs.readFile(file, function(err, data) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading file: ' + file);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
    return;
  }

  // Serve volumeshocker data for a specific date: /data/volumeshocker/YYYYMMDD
  if (urlPath.startsWith('/data/volumeshocker/')) {
    const dateStr = urlPath.slice(20);
    if (!/^\d{8}$/.test(dateStr)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid date. Use YYYYMMDD.' }));
      return;
    }
    const file = path.join(DATA_DIR, 'trendingstock_volumeshocker_' + dateStr + '.json');
    fs.readFile(file, function(err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No volumeshocker data found for date ' + dateStr }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
    return;
  }

  // Serve any specific file from databank via /data/
  if (urlPath.startsWith('/data/')) {
    const file = path.join(DATA_DIR, urlPath.slice(6));
    fs.readFile(file, function(err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found: ' + file);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
    return;
  }

  // Default to stock-tech-app.html
  if (urlPath === '/') urlPath = '/stock-tech-app.html';

  const filePath = path.join(SRC_DIR, urlPath);
  fs.readFile(filePath, function(err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, function() {
  console.log('');
  console.log('  StockAiVerse server running');
  console.log('  Open: http://localhost:' + PORT);
  console.log('');
});
