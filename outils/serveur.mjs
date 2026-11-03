#!/usr/bin/env node
// Serveur de développement : fichiers statiques, jamais mis en cache (sinon
// le navigateur garde d'anciens modules entre deux essais).
//
//   node outils/serveur.mjs [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 4337);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  try {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fichier = normalize(join(RACINE, chemin));
    if (!fichier.startsWith(RACINE)) { res.writeHead(403).end(); return; }
    if ((await stat(fichier).catch(() => null))?.isDirectory()) fichier = join(fichier, 'index.html');
    const corps = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(corps);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end('Introuvable');
  }
}).listen(PORT, () => console.log(`Musée sur http://localhost:${PORT}`));
