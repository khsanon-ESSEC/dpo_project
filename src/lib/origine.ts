/**
 * La requête vient-elle d'une page de l'application ? Défense en plus des cookies SameSite : un autre site de
 * la banque (même site, autre sous-domaine) ne peut pas faire envoyer un formulaire ou une question à la place
 * de la personne. Les actions serveur de Next.js font déjà ce contrôle ; ceci sert aux routes POST écrites à la main.
 */
export function hoteDe(h: Headers): string | null {
  return (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0].trim().toLowerCase() || null;
}

export function memeOrigine(h: Headers): boolean {
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin";
  // Navigateur ancien : l'en-tête Origin, s'il est là, doit être celui de l'application.
  const origine = h.get("origin");
  if (!origine) return true;
  try {
    return new URL(origine).host.toLowerCase() === hoteDe(h);
  } catch {
    return false;
  }
}

/** Le chemin d'une adresse de l'application (pour un lien « Retour »), jamais une autre adresse. */
export function cheminInterne(adresse: string | null, h: Headers): string | null {
  if (!adresse) return null;
  try {
    const r = new URL(adresse);
    if (r.host.toLowerCase() !== hoteDe(h) || !r.pathname.startsWith("/") || r.pathname.startsWith("//") || r.pathname.includes("\\")) return null;
    return r.pathname + r.search;
  } catch {
    return null;
  }
}
