import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/lib/auth/session";
import { contexteAssistant } from "@/lib/contexte-assistant";
import { CONSIGNES_ASSISTANT, demanderIA, iaDisponible, IaIndisponible } from "@/lib/ia";
import { noter } from "@/lib/journal";

const ECRANS = new Set(["semaine", "rapport", "equipe", "projet", "portefeuille", "conseil", "organisation"]);
const fenetre = new Map<string, number[]>();

function tropDeQuestions(id: string) {
  const maintenant = Date.now();
  const recentes = (fenetre.get(id) ?? []).filter((t) => maintenant - t < 60_000);
  recentes.push(maintenant);
  fenetre.set(id, recentes);
  return recentes.length > 10;
}

export async function POST(req: Request) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée. Reconnectez-vous." }, { status: 401 });
  if (!iaDisponible()) {
    return NextResponse.json({ erreur: "L'assistant n'est pas encore branché. Un administrateur doit choisir un fournisseur d'IA (IA_FOURNISSEUR)." }, { status: 503 });
  }
  if (tropDeQuestions(u.id)) return NextResponse.json({ erreur: "Trop de questions d'affilée. Réessayez dans une minute." }, { status: 429 });

  const corps = (await req.json().catch(() => null)) as { ecran?: string; chemin?: string; question?: string } | null;
  const question = (corps?.question ?? "").trim().slice(0, 1000);
  const ecran = ECRANS.has(corps?.ecran ?? "") ? corps!.ecran! : "semaine";
  const chemin = (corps?.chemin ?? "/").slice(0, 200);
  if (!question) return NextResponse.json({ erreur: "Posez une question." }, { status: 400 });

  try {
    const contexte = await contexteAssistant(u, ecran, chemin);
    const reponse = await demanderIA(`${CONSIGNES_ASSISTANT}\n\n<donnees>\n${contexte}\n</donnees>`, [{ role: "user", contenu: question }]);
    await noter(u.id, "assistant", ecran, { longueurQuestion: question.length });
    return NextResponse.json({ reponse: reponse || "Je n'ai pas de réponse à proposer." });
  } catch (e) {
    if (e instanceof IaIndisponible) return NextResponse.json({ erreur: e.message }, { status: 503 });
    console.error("assistant :", (e as Error).message);
    return NextResponse.json({ erreur: "L'assistant ne répond pas pour le moment. Réessayez plus tard." }, { status: 502 });
  }
}
