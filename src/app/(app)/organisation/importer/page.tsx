import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerInterne } from "@/lib/auth/session";
import { adActive } from "@/lib/auth/ad";
import { googleActive } from "@/lib/auth/google";
import { peutAdministrer } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { ONGLETS_ORGANISATION, SousOnglets } from "@/components/SousOnglets";
import { ImportOrganisation } from "./ImportOrganisation";

export const metadata: Metadata = { title: "Importer l'organisation" };

/**
 * Importer ou mettre à jour l'organisation (administrateurs) depuis Excel ou Active Directory : on voit
 * d'abord ce qui changerait, puis on importe. Rôles jamais importés, personne n'est désactivé.
 */
export default async function PageImporter() {
  const u = await exigerInterne();
  if (!peutAdministrer(u)) notFound();
  const ad = adActive();
  return (
    <>
      <Bandeau surtitre="Organisation" titre="Importer l'organisation" />
      <div className="page" style={{ maxWidth: 980 }}>
        <SousOnglets onglets={ONGLETS_ORGANISATION} courant="/organisation/importer" label="Organisation" />
        <p className="note" style={{ margin: 0 }}>
          Ajoute les personnes qui manquent et met à jour poste, équipe et supérieur. Les rôles (directeur, exécutif, administrateur) ne s&apos;importent pas, et personne n&apos;est désactivé : on voit d&apos;abord ce qui changerait, puis on importe.
        </p>
        <ImportOrganisation ad={ad} groupe={!!process.env.AD_GROUPE?.trim()} sso={ad || googleActive()} baseDn={process.env.AD_BASE_DN?.trim() ?? ""} />
      </div>
    </>
  );
}
