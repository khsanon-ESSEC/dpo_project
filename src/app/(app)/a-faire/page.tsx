import { redirect } from "next/navigation";

/**
 * Ancienne adresse de « Mes tâches » (l'onglet « À faire » de Semaine) : les liens gardés et les favoris y mènent
 * toujours, avec le filtre choisi. L'ancre (#mes-taches) suit d'elle-même la redirection.
 */
const VOIR = new Set(["retard", "bloquees", "afaire", "faites"]);

export default async function AncienneAdresse({ searchParams }: { searchParams: Promise<{ voir?: string }> }) {
  const { voir } = await searchParams;
  redirect(voir && VOIR.has(voir) ? `/taches?voir=${voir}` : "/taches");
}
