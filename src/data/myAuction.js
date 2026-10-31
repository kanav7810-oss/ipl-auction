// IDs verified against players.js; Shikhar Dhawan is absent. MS Dhoni is listed as Mahendra Singh Dhoni.
export const RETAINED = {
  me: ['p_137', 'p_142', 'p_104', 'p_138', 'p_621'],
  friend: ['p_622', 'p_125', 'p_103', 'p_140'],
};
export const RTM = {
  me: ['p_115', 'p_128', 'p_135', 'p_154', 'p_168', 'p_107', 'p_134', 'p_166', 'p_119', 'p_145', 'p_136', 'p_139', 'p_144', 'p_106', 'p_118', 'p_193', 'p_129'],
  friend: ['p_146', 'p_111', 'p_279', 'p_116', 'p_281', 'p_196', 'p_127', 'p_112', 'p_101', 'p_120', 'p_130', 'p_141', 'p_126', 'p_272', 'p_102', 'p_110', 'p_156', 'p_117'],
};
export const RETAINED_IDS = new Set([...RETAINED.me, ...RETAINED.friend]);
