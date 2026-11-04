// Genre d'un prénom, pour que le portrait d'un employé lui ressemble. Les
// prénoms sont ceux de js/moteur/noms.js ; un épicène (Dominique, Claude…)
// tire son genre du nom complet, toujours le même pour une personne.

import { empreinte } from '../moteur/alea.js';

export const FEMININS = new Set([
  'Camille', 'Louise', 'Jeanne', 'Alice', 'Léa', 'Chloé', 'Inès', 'Manon', 'Zoé', 'Lina',
  'Juliette', 'Agathe', 'Margaux', 'Clara', 'Rose', 'Anna', 'Élise', 'Salomé', 'Nina', 'Mila',
  'Yasmine', 'Sofia', 'Amina', 'Hélène', 'Mathilde', 'Victoire', 'Constance', 'Garance', 'Iris', 'Romane',
]);

export const MASCULINS = new Set([
  'Lucas', 'Hugo', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Adam', 'Raphaël', 'Paul', 'Victor',
  'Antoine', 'Théo', 'Nathan', 'Mathis', 'Léon', 'Sacha', 'Élias', 'Malo', 'Baptiste', 'Simon',
  'Karim', 'Youssef', 'Mehdi', 'Samuel', 'Bastien', 'Étienne', 'Félix', 'Augustin', 'Marius', 'Noé',
]);

export const EPICENES = new Set(['Dominique', 'Claude', 'Alix', 'Andréa', 'Charlie', 'Eden', 'Maxime', 'Sasha', 'Morgan', 'Lou']);

/** 'f' ou 'h' pour un nom complet « Prénom Nom ». */
export function genre(nomComplet) {
  const prenom = String(nomComplet).split(' ')[0];
  if (FEMININS.has(prenom)) return 'f';
  if (MASCULINS.has(prenom)) return 'h';
  return empreinte(`genre:${nomComplet}`) % 2 ? 'f' : 'h';
}

// Coiffures et tenues du style Notionists, triées à l'œil sur une planche :
// cheveux longs, carré, queue de cheval, chignon, foulard d'un côté ;
// cheveux courts, rasés, banane, casquette de l'autre. Quatre coiffures
// ambiguës (14, 20, 40, 43) ne servent à personne.
const v = (...n) => n.map((x) => `variant${String(x).padStart(2, '0')}`);

export const APPARENCES = {
  f: {
    hair: v(2, 4, 8, 10, 11, 23, 28, 29, 36, 37, 39, 41, 45, 46, 47, 48, 57, 58, 59, 61, 62, 63),
    beardProbability: 0,
    // Tout sauf les deux cravates.
    body: v(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25),
  },
  h: {
    hair: ['hat', ...v(1, 3, 5, 6, 7, 9, 12, 13, 15, 16, 17, 18, 19, 21, 22, 24, 25, 26, 27, 30, 31, 32, 33, 34, 35, 38, 42, 44, 49, 50, 51, 52, 53, 54, 55, 56, 60)],
    beardProbability: 35,
  },
};
