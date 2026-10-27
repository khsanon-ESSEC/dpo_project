/** Page où revenir après une action : seulement certaines pages de l'application (jamais une adresse externe). */
export function retourValide(v: unknown): string | null {
  const s = String(v ?? "");
  return /^\/(semaine|charge|projets\/[0-9a-f-]{36}(\/(liste|tableau|gantt|calendrier|charge))?|equipe(\/[0-9a-f-]{36})?)$/.test(s) ? s : null;
}
