/** « Ajouter à mon agenda » contre la base : une réunion, la série à venir, et seulement pour qui y participe. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as AgendaModule from "@/lib/donnees/agenda";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("fichier d'agenda d'une réunion", () => {
  let D: typeof DbModule;
  let G: typeof AgendaModule;
  const ids: string[] = [];
  let serieId = "";
  let myriam = "";
  let joel = "";
  let daphnee = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    G = await import("@/lib/donnees/agenda");
    const gens = await D.db.select({ id: D.schema.personnes.id, courriel: D.schema.personnes.courriel }).from(D.schema.personnes);
    const id = (c: string) => gens.find((g) => g.courriel === `${c}@demo.dpo.local`)!.id;
    [myriam, joel, daphnee] = [id("myriam.valcin"), id("joel.dorval"), id("daphnee.joseph")];
    const [s] = await D.db.insert(D.schema.seriesReunion).values({ rythme: "semaine", jusquau: "2026-11-13", creeParId: myriam }).returning();
    serieId = s.id;
    for (const jour of ["2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"]) {
      const [r] = await D.db.insert(D.schema.reunions).values({ titre: "Point d'équipe; hebdo", jour, heure: "09:00", dureeMinutes: 30, notes: "Note confidentielle", noteeParId: myriam, serieId }).returning();
      ids.push(r.id);
      await D.db.insert(D.schema.participantsReunion).values([
        { reunionId: r.id, personneId: myriam },
        { reunionId: r.id, personneId: joel },
      ]);
    }
  });
  afterAll(async () => {
    await D.db.delete(D.schema.participantsReunion).where(inArray(D.schema.participantsReunion.reunionId, ids));
    await D.db.delete(D.schema.reunions).where(inArray(D.schema.reunions.id, ids));
    await D.db.delete(D.schema.seriesReunion).where(eq(D.schema.seriesReunion.id, serieId));
    await globalThis.__pgClient?.end();
  });

  it("une réunion, puis la série à venir ; jamais les notes", async () => {
    const une = await G.agendaDeReunion(joel, ids[1], false);
    expect(une?.nom).toBe("reunion-2026-10-30.ics");
    expect(une?.fichier.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(une?.fichier).toContain("SUMMARY:Point d'équipe\\; hebdo");
    expect(une?.fichier).not.toContain("confidentielle");
    const serie = await G.agendaDeReunion(joel, ids[1], true);
    // À partir d'aujourd'hui (30 octobre) : trois réunions, pas celle du 23.
    expect(serie?.fichier.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(serie?.nom).toBe("reunion-2026-10-30-serie.ics");
    expect(serie?.fichier).not.toContain("20261023");
  });
  it("une personne qui n'y participe pas n'obtient rien", async () => {
    expect(await G.agendaDeReunion(daphnee, ids[1], false)).toBeNull();
    expect(await G.agendaDeReunion(daphnee, ids[1], true)).toBeNull();
    expect(await G.agendaDeReunion(joel, "pas-un-identifiant", false)).toBeNull();
  });
});
