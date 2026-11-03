// Adresse de l'image d'une œuvre, à la taille voulue (voir docs/CATALOGUE.md).
// `cote` est la plus grande dimension souhaitée, en pixels.

/** Adresse d'une description d'image `im` (l'image principale ou son secours). */
function adresse(im, cote) {
  if (!im) return null;
  const dims = Math.max(im.w || 0, im.h || 0) || cote;
  // `max` : certaines sources refusent de servir au-delà d'une taille.
  const L = Math.max(64, Math.round(Math.min(cote, dims, im.max || Infinity)));
  switch (im.src) {
    case 'rijks':
    case 'aic':
    case 'nga':
      return `${im.iiif.replace(/\/$/, '')}/full/!${L},${L}/0/default.jpg`;
    case 'met':
      return L <= 1000 && im.petite ? im.petite : im.url;
    case 'commons':
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(im.fichier)}?width=${largeurPour(im, L)}`;
    case 'enwiki':
      return `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(im.fichier)}?width=${largeurPour(im, L)}`;
    default:
      return im.url || null;
  }
}

export function urlImage(fiche, cote) {
  return adresse(fiche?.image, cote);
}

/** Image de repli, quand la source principale ne répond pas. */
export function urlSecours(fiche, cote) {
  return adresse(fiche?.image?.secours, cote);
}

// Special:FilePath ne connaît que la largeur : pour une œuvre en hauteur, on
// la déduit de la plus grande dimension voulue.
function largeurPour(im, cote) {
  if (!im.w || !im.h) return cote;
  return Math.max(32, Math.min(im.w, Math.round(im.w >= im.h ? cote : cote * im.w / im.h)));
}

/** Rapport largeur / hauteur de l'image, ou des dimensions de l'œuvre. */
export function ratio(fiche) {
  const im = fiche?.image;
  if (im?.w && im?.h) return im.w / im.h;
  if (fiche?.dim?.[0] && fiche?.dim?.[1]) return fiche.dim[1] / fiche.dim[0];
  return 0.8;
}

/** Zoom maximal du mode inspection : jamais au-delà d'un pixel source par pixel affiché. */
export function zoomMax(fiche, largeurAffichee, densite = 1) {
  const w = Math.min(fiche?.image?.w || 0, fiche?.image?.max || Infinity);
  if (!w || !largeurAffichee) return 1;
  return Math.max(1, w / (largeurAffichee * densite));
}
