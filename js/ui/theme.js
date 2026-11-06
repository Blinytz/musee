// Ambiance du musée : Relief le jour, Nocturne le soir. Par défaut elle suit
// l'heure de l'appareil (nuit de 20 h à 8 h) ; un réglage la fige.

export const AMBIANCES = [['auto', 'Selon l\'heure'], ['jour', 'Jour'], ['nuit', 'Nuit']];

const COULEURS = { jour: '#f4e9d6', nuit: '#140a0c' };

/** Ambiance à appliquer maintenant : `reglage` vaut auto, jour ou nuit. */
export function ambiance(reglage = 'auto', date = new Date()) {
  if (reglage === 'jour' || reglage === 'nuit') return reglage;
  const heure = date.getHours();
  return heure >= 20 || heure < 8 ? 'nuit' : 'jour';
}

/** Pose l'ambiance sur la page et la barre d'état du téléphone. */
export function appliquerAmbiance(reglage) {
  const a = ambiance(reglage);
  const racine = document.documentElement;
  if (racine.dataset.ambiance !== a) racine.dataset.ambiance = a;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = COULEURS[a];
  return a;
}
