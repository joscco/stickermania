# Minigame Architecture

Dieses Projekt behandelt Minigames als selbstbeschreibende Module. Ein neues Spiel soll im Ordner `minigames/<minigame-id>` implementiert und dann nur ueber generische Registries in Backend und Frontend sichtbar gemacht werden.

## Ziel

Die App-Shell soll keine Spielelogik kennen. Player-Huelle, Result-Screen, Catalog, Minigame-Editor, Shared Contract und Backend-Rundenlogik sollen generische Minigame-Faehigkeiten nutzen, aber keine Felder wie `targetSeconds`, `optionA`, `choseOptionA` oder konkrete Resultdaten interpretieren.

Wenn eine Shell neue Informationen braucht, wird das generische Minigame-Interface oder die Minigame-Definition erweitert. Es wird kein neuer `if (task.type === "...")`-Branch in Shell-Code geschrieben.

## Wo Spezifisches Hingehört

- Varianten und Content: `minigames/<id>/variants.ts`
- Scoring und reines Datenmodell: `minigames/<id>/game.ts`
- Backend-Submission, Auswertung, Summary und Task-Erzeugung: `minigames/<id>/server-handler.ts`
- Frontend-Shell-Adapter, Komponenten, Labels, Drafts und Editor-Testdaten: `minigames/<id>/frontend-definition.ts`
- Player-UI-State und Player-Events: `minigames/<id>/player-ui/ui-contract.ts`
- Interaktive Angular-Komponenten: `minigames/<id>/player-ui/phase-*`
- Result-Angular-Komponenten: `minigames/<id>/player-ui/result`
- Backend-Verfuegbarkeit: `minigames/registry.ts`
- Frontend-Verfuegbarkeit: `minigames/frontend-registry.ts`

## Wo Spezifisches Nicht Hingehört

Diese Dateien duerfen keine neuen spiel-spezifischen Branches oder Spezialtypen bekommen:

- `packages/shared/src/contract.ts`
- `frontend/src/app/features/game/player/scenes/building/*`
- `frontend/src/app/features/game/player/scenes/results/*`
- `frontend/src/app/features/game/player/player-screen-data.service.ts`
- `frontend/src/app/features/shared/round-info/round-info.component.ts`
- `frontend/src/app/features/catalog/*`
- `frontend/src/app/features/editors/minigame-editor/*`
- zentrale JSON-Dateien wie `minigame.config.json`

Erlaubt ist dort Registry-Zugriff, z. B. `getMinigameFrontendDefinition(task.type)`, und generische Fallbacks fuer noch nicht migrierte alte Task-Arten.

## Variant-Daten

Minigame-Varianten kommen aus `variants.ts`. Eine zentrale `minigame.config.json` ist nicht die Quelle fuer spielbare Minigame-Runden.

Backend-Handler stellen Tasks aus Varianten bereit:

```ts
public createTasks(): MinigameTask[] {
  return VARIANTS.map((variant) => ({
    id: variant.id,
    type: this.type,
    title: variant.title,
    durationSec: variant.firstRoundSeconds,
    variantData: variant,
  }));
}
```

Das konkrete `variantData` ist fuer die Shell opaque. Nur das Minigame liest und typisiert diese Daten.

## Frontend-Definition

Jedes Frontend-Minigame stellt in `minigames/<id>/frontend-definition.ts` eine Definition bereit. Diese Definition ist der Adapter zwischen generischer App-Shell und spezifischem Spiel.

`minigames/frontend-registry.ts` darf nur Definitionen importieren, in einer Liste registrieren und Lookup-Funktionen bereitstellen. Es darf keine spezifische Minigame-Logik, keine UI-State-Erzeugung und keine Result-Formatierung enthalten.

Eine Definition liefert unter anderem:

- `phaseComponent`
- `resultComponent`
- `variants`
- `taskFromVariant`
- `variantFromTask`
- `initialDraft`
- `reducePlayerEvent`
- `canSubmit`
- `createSubmitPayload`
- `createPlayState`
- `createResultState`
- `scoringInfo`
- `resultSummary`
- Editor-Labels und Sample-Submissions

Shell-Komponenten rendern nur noch `phaseComponent` oder `resultComponent` ueber `MinigameComponentHostComponent` und reichen den von der Definition erzeugten State durch.

## Backend-Handler

Backend-Handler kapseln:

- Annahme und Validierung von Client-Payloads
- Erstellung von `OpenMinigameSubmission`
- Auswertung der Submissions
- Winner-/Tie-Bestimmung
- Result-Summary
- Task-Erzeugung aus `variants.ts`

Die globale Rundenlogik ruft nur generische Handler-Methoden auf.

## Shared Contract

Der Shared Contract beschreibt nur das offene Protokoll:

- `BaseMinigameTask`
- `MinigameTask`
- `OpenMinigameSubmission`
- `MinigameClientAction`
- `MinigameHandler`

Keine spezifischen Task-Interfaces wie `TimerStopTask` oder `EstimateOpinionsTask` im Contract. Diese Typen gehoeren in das jeweilige Minigame, falls sie intern gebraucht werden.

## Checkliste Für Neue Minigames

1. Ordner `minigames/<id>` anlegen.
2. `game.ts` mit Variant-, Submission- und Result-Typen plus Scoring implementieren.
3. `variants.ts` mit konkreten spielbaren Varianten anlegen.
4. `server-handler.ts` implementieren, inklusive `createTasks()`.
5. Handler in `minigames/registry.ts` registrieren.
6. `player-ui/ui-contract.ts` definieren.
7. Interaktive Phase-Komponente bauen.
8. Result-Komponente bauen.
9. `frontend-definition.ts` im Minigame-Ordner anlegen.
10. Definition in `minigames/frontend-registry.ts` registrieren.
11. Im Minigame-Editor, Catalog und echten Player testen.

## Review-Regel

Wenn fuer ein neues Minigame eine Aenderung an Shell-Dateien noetig scheint, zuerst pruefen:

- Fehlt eine generische Faehigkeit in der Minigame-Definition?
- Fehlt eine generische Methode im Handler?
- Kann die Information in `variantData`, State-Adapter oder Result-Summary bleiben?

Nur wenn mehrere Minigames dieselbe neue Shell-Faehigkeit brauchen, wird die generische Schnittstelle erweitert.
