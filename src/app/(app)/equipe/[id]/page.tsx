import { redirect } from "next/navigation";

/**
 * Ancienne page « tâches et charge d'une personne » : tout est maintenant sur sa fiche (/personnes/[id]),
 * avec les mêmes droits. On y renvoie, en gardant la semaine choisie, pour les liens déjà enregistrés.
 */
export default async function PagePersonne({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semaine?: string }> }) {
  const { id } = await params;
  const { semaine } = await searchParams;
  const ok = /^[0-9a-f-]{36}$/.test(id) ? id : "";
  const s = semaine && /^\d{4}-\d{2}-\d{2}$/.test(semaine) ? `?semaine=${semaine}` : "";
  redirect(ok ? `/personnes/${ok}${s}#charge` : "/equipe");
}
