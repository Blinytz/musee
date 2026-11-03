#!/usr/bin/env node
// Assemble l'Edge Function en un seul fichier, moteurs du jeu compris :
// supabase/functions/musee/index.ts. Un fichier unique se colle tel quel dans
// l'éditeur de fonctions du tableau de bord Supabase.
//
//   node outils/fonction.mjs
//
// esbuild n'est pas une dépendance du dépôt : npx le récupère le temps de
// l'assemblage.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'supabase', 'functions', 'musee', 'index.ts');
mkdirSync(dirname(SORTIE), { recursive: true });

// Chemins relatifs : sous Windows, npx passe par un shell qui couperait un
// chemin absolu contenant une espace.
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  '--yes', 'esbuild@0.24.0',
  'supabase/source/musee.js',
  '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
  '--outfile=supabase/functions/musee/index.ts',
], { stdio: 'inherit', shell: process.platform === 'win32', cwd: RACINE });

const code = readFileSync(SORTIE, 'utf8');
writeFileSync(SORTIE, [
  '// @ts-nocheck',
  '// Fichier produit par outils/fonction.mjs à partir de supabase/source/musee.js',
  '// et des moteurs js/moteur : ne pas modifier à la main.',
  code,
].join('\n'));
console.log(`${SORTIE} (${Math.round(code.length / 1024)} Ko)`);
