// Lecture du catalogue statique (voir docs/CATALOGUE.md). Les tranches sont
// gardées en mémoire ; le service worker les conserve hors ligne.

export function createCatalogue({ base = './catalogue/', fetch: f = (...a) => globalThis.fetch(...a) } = {}) {
  const tranches = new Map();
  const index = new Map();
  let meta = null;
  let musees = null;
  let fusions = null;
  const museesDetail = new Map();

  async function json(chemin) {
    const r = await f(`${base}${chemin}`);
    if (!r.ok) throw new Error(`Catalogue indisponible (${chemin})`);
    return r.json();
  }

  async function chargerMeta() {
    if (!meta) meta = await json('meta.json');
    return meta;
  }

  function nomTranche(id, taille) {
    return `oeuvres/${String(Math.floor(id / taille)).padStart(4, '0')}.json`;
  }

  async function tranche(nom) {
    if (!tranches.has(nom)) {
      tranches.set(nom, json(nom).then((liste) => new Map(liste.map((o) => [o.id, o]))).catch((e) => {
        tranches.delete(nom);
        throw e;
      }));
    }
    return tranches.get(nom);
  }

  async function chargerFusions() {
    if (!fusions) fusions = await json('fusions.json').catch(() => ({}));
    return fusions;
  }

  /** Id canonique : un id fusionné renvoie vers celui qui l'a absorbé. */
  async function canonique(id) {
    const f = await chargerFusions();
    let c = id;
    for (let i = 0; i < 5 && f[c] !== undefined; i++) c = f[c];
    return c;
  }

  async function fiche(id) {
    const m = await chargerMeta();
    const c = await canonique(id);
    const t = await tranche(nomTranche(c, m.tranche || 1000));
    return t.get(c) || null;
  }

  async function fiches(ids) {
    return Promise.all(ids.map((id) => fiche(id).catch(() => null)));
  }

  return {
    meta: chargerMeta,
    fiche,
    fiches,
    canonique,
    async musees() {
      if (!musees) musees = await json('musees.json');
      return musees;
    },
    async oeuvresDuMusee(id) {
      if (!museesDetail.has(id)) museesDetail.set(id, json(`musees/${id}.json`).catch(() => []));
      return museesDetail.get(id);
    },
    async index(support, niveau) {
      const cle = `${support}-${niveau}`;
      if (!index.has(cle)) index.set(cle, json(`index/${cle}.json`).catch(() => []));
      return index.get(cle);
    },
  };
}
