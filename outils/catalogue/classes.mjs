// Classes Wikidata retenues, en instance DIRECTE (P31), par support.
//
// Pourquoi une liste blanche plutôt que `P279*` : la descendance de
// « sculpture » ramène des portes de ville, des pièces de monnaie, des
// inscriptions runiques et jusqu'à des monster trucks ; celle d'« estampe »,
// des billets de banque et des timbres. Une œuvre absente d'ici n'est pas
// perdue pour autant : elle porte presque toujours aussi l'une de ces classes.
//
// Écartées volontairement : peintures rupestres et pariétales (inexposables),
// installations (ce ne sont pas des sculptures), crèches, colonnes et portes,
// stèles et inscriptions (épigraphie plus qu'œuvre d'art), monnaies.

export const CLASSES = {
  peinture: [
    'Q3305213', // peinture
    'Q22669139', // fresque
    'Q219423', // peinture murale
    'Q99516640', // peinture murale (autre élément)
    'Q132137', // icône
    'Q22970505', // crucifix peint
    'Q18761202', // aquarelle
    'Q1190781', // emaki
    'Q12043905', // pastel
    'Q2026188', // panorama
    'Q1147753', // cyclorama
    'Q8362', // miniature
    'Q3513449', // tableau de dévotion
    'Q10827799', // peinture sur soie
    'Q916651', // thangka
    'Q104438958', // peinture perdue (gardée si une image subsiste)
    'Q79218', // triptyque
    'Q1278452', // polyptyque
    'Q15711026', // retable
  ],
  sculpture: [
    'Q860861', // sculpture
    'Q179700', // statue
    'Q2293362', // groupe sculpté
    'Q1779653', // statue colossale
    'Q241045', // buste
    'Q245117', // relief
    'Q928357', // sculpture en bronze
    'Q3476533', // sculpture monumentale
    'Q1066288', // figurine
    'Q659396', // statue équestre
    'Q837249', // sculpture de marbre
    'Q9325291', // sculpture en plein air
    'Q14562306', // bas-relief
    'Q248726', // Vénus paléolithique
    'Q3062269', // tête colossale
    'Q1000809', // statue de Bouddha
    'Q1051606', // daibutsu
    'Q29857932', // sculpture cinétique
    'Q937330', // kouros
    'Q2793709', // sculpture en bois
    'Q5784272', // haut-relief
    'Q107338575', // ensemble sculptural
    'Q6642845', // gisant
    'Q29168169', // statue monumentale du Christ
    'Q29168168', // statue du Christ
    'Q83809', // mât totémique
    'Q602082', // dogū
    'Q26883973', // sculpture perdue
  ],
  photographie: [
    'Q125191', // photographie
  ],
  estampe: [
    'Q11060274', // estampe
    'Q18396864', // aquatinte
    'Q18219090', // xylogravure
    'Q18887969', // chalcographie
    'Q15123870', // lithographie
    'Q18218093', // eau-forte
    'Q11835431', // gravure
    'Q28913685', // gravure sur bois
  ],
};

// Une œuvre qui cumule plusieurs classes prend le support le plus
// spécifique : une photographie peinte reste une photographie.
export const PRIORITE_SUPPORTS = ['photographie', 'estampe', 'peinture', 'sculpture'];

export function supportDe(classes) {
  for (const s of PRIORITE_SUPPORTS) if (classes.some((c) => CLASSES[s].includes(c))) return s;
  return null;
}

export const TOUTES_CLASSES = Object.values(CLASSES).flat();
