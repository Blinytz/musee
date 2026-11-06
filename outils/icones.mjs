#!/usr/bin/env node
// Extrait de Phosphor Icons (licence MIT, voir standards/logos/PHOSPHOR-LICENSE)
// les pictogrammes de l'interface, vers js/ui/icones.js. Rien n'est dessiné à
// la main.
//
//   npm pack @phosphor-icons/core@2.1.1 && tar xzf phosphor-icons-core-2.1.1.tgz
//   node outils/icones.mjs chemin/vers/package/assets

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2];
if (!SOURCE) { console.error('Chemin vers package/assets requis'); process.exit(1); }

// nom dans l'application → [graisse, nom Phosphor]
const ICONES = {
  musee: ['regular', 'bank'],
  atelier: ['regular', 'paint-brush'],
  arrivages: ['regular', 'package'],
  classement: ['regular', 'ranking'],
  plus: ['regular', 'dots-three-outline'],
  reserve: ['regular', 'archive'],
  privee: ['regular', 'lock-key'],
  investir: ['regular', 'hammer'],
  expositions: ['regular', 'frame-corners'],
  prets: ['regular', 'handshake'],
  rapport: ['regular', 'newspaper'],
  reglages: ['regular', 'gear-six'],
  session: ['regular', 'hourglass-medium'],
  sablier: ['fill', 'hourglass-medium'],
  zoom: ['regular', 'magnifying-glass-plus'],
  fermer: ['regular', 'x'],
  valider: ['regular', 'check'],
  gauche: ['regular', 'caret-left'],
  droite: ['regular', 'caret-right'],
  bas: ['regular', 'caret-down'],
  ajouter: ['regular', 'plus'],
  retirer: ['regular', 'minus'],
  billet: ['regular', 'ticket'],
  visiteurs: ['regular', 'users-three'],
  prestige: ['fill', 'star'],
  reputation: ['regular', 'crown-simple'],
  satisfaction: ['regular', 'smiley'],
  statut: ['regular', 'trophy'],
  notification: ['regular', 'bell'],
  image: ['regular', 'image'],
  alerte: ['regular', 'warning'],
  arreter: ['fill', 'stop'],
  lancer: ['fill', 'play'],
  pause: ['fill', 'pause'],
  libre: ['regular', 'infinity'],
  plan: ['regular', 'blueprint'],
  visite: ['regular', 'frame-corners'],
  collection: ['regular', 'images-square'],
  badge: ['regular', 'identification-card'],
  jour: ['regular', 'sun'],
  nuit: ['regular', 'moon'],
  recruter: ['regular', 'user-plus'],
  affecter: ['regular', 'user-switch'],
  enquete: ['regular', 'detective'],
  reparer: ['regular', 'wrench'],
  alarme: ['regular', 'siren'],
  camera: ['regular', 'security-camera'],
  porte: ['regular', 'door'],
  coffre: ['regular', 'vault'],
  alerteBouclier: ['regular', 'shield-warning'],
  plein: ['regular', 'arrows-out'],
  campagne: ['regular', 'megaphone'],
  globe: ['regular', 'globe-hemisphere-east'],
  historique: ['regular', 'clock-counter-clockwise'],
  maitrise: ['regular', 'medal'],
  aile: ['regular', 'door-open'],
  boutique: ['regular', 'storefront'],
  deconnexion: ['regular', 'sign-out'],
  telecharger: ['regular', 'upload-simple'],
  installer: ['regular', 'download-simple'],
  retour: ['regular', 'arrow-counter-clockwise'],
  palette: ['regular', 'palette'],
  direction: ['regular', 'briefcase'],
  securite: ['regular', 'shield-check'],
  finances: ['regular', 'coins'],
  personnel: ['regular', 'identification-badge'],
};

const lignes = [
  '// Pictogrammes de l\'interface, extraits de Phosphor Icons (licence MIT).',
  '// Fichier produit par outils/icones.mjs : ne pas modifier à la main.',
  '',
  'const SVG = \'http://www.w3.org/2000/svg\';',
  '',
  'const CHEMINS = {',
];
for (const [nom, [graisse, source]] of Object.entries(ICONES)) {
  const fichier = join(SOURCE, graisse, graisse === 'regular' ? `${source}.svg` : `${source}-${graisse}.svg`);
  const svg = readFileSync(fichier, 'utf8');
  const chemins = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (!chemins.length) throw new Error(`Aucun tracé dans ${fichier}`);
  lignes.push(`  ${nom}: ${JSON.stringify(chemins)},`);
}
lignes.push('};', '');
lignes.push(
  '/** Élément <svg> de 256 × 256 qui hérite de `currentColor`. */',
  'export function icone(nom, classe = \'icone\') {',
  '  const noeud = document.createElementNS(SVG, \'svg\');',
  '  noeud.setAttribute(\'viewBox\', \'0 0 256 256\');',
  '  noeud.setAttribute(\'fill\', \'currentColor\');',
  '  noeud.setAttribute(\'aria-hidden\', \'true\');',
  '  noeud.setAttribute(\'class\', classe);',
  '  for (const d of CHEMINS[nom] || []) {',
  '    const p = document.createElementNS(SVG, \'path\');',
  '    p.setAttribute(\'d\', d);',
  '    noeud.append(p);',
  '  }',
  '  return noeud;',
  '}',
  '',
);
writeFileSync(join(ICI, '..', 'js', 'ui', 'icones.js'), lignes.join('\n'));
console.log(`${Object.keys(ICONES).length} icônes écrites dans js/ui/icones.js`);
