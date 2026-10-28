"use client";

import { useEffect, useRef, useState } from "react";
import { phraseOccupe, type Disponibilite } from "@/lib/creneaux";

/**
 * Dans le formulaire d'une réunion : dès que le jour, l'heure, la durée ou les participants changent, on
 * vérifie qui est déjà pris à ce créneau (réunions notées dans l'application). Un avertissement, pas un blocage.
 */
export function VerifierCreneau({ sauf }: { sauf?: string }) {
  const ancre = useRef<HTMLDivElement>(null);
  const [occupes, setOccupes] = useState<Disponibilite[]>([]);
  useEffect(() => {
    const form = ancre.current?.closest("form");
    if (!form) return;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;
    const verifier = () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        const f = new FormData(form);
        const jour = String(f.get("jour") ?? "");
        const heure = String(f.get("heure") ?? "");
        const duree = String(f.get("duree") ?? "");
        if (!jour || !/^\d{2}:\d{2}$/.test(heure)) return setOccupes([]);
        const ids = f.getAll("participants").map(String).join(",");
        ctrl?.abort();
        ctrl = new AbortController();
        fetch(`/api/disponibilites?jour=${jour}&heure=${heure}&duree=${encodeURIComponent(duree)}&ids=${ids}${sauf ? `&sauf=${sauf}` : ""}`, { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((d: Disponibilite[]) => setOccupes(Array.isArray(d) ? d : []))
          .catch(() => {});
      }, 250);
    };
    form.addEventListener("input", verifier);
    form.addEventListener("change", verifier);
    verifier();
    return () => {
      form.removeEventListener("input", verifier);
      form.removeEventListener("change", verifier);
      clearTimeout(minuterie);
      ctrl?.abort();
    };
  }, [sauf]);
  return (
    <div ref={ancre} aria-live="polite">
      {occupes.length ? (
        <div className="avertissement-creneau" role="status">
          {occupes.map((o) => (
            <p key={o.id} style={{ margin: 0 }}>
              {phraseOccupe(o)}.
            </p>
          ))}
          <p className="ton-discret" style={{ margin: "4px 0 0", fontSize: 12 }}>
            Vous pouvez quand même la noter ; les personnes déjà prises seront prévenues.
          </p>
        </div>
      ) : null}
    </div>
  );
}
