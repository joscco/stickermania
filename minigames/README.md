# Minigame Folder Contract

Ein Ordner unter `minigames/<minigame-id>` soll ein einzelnes wiederverwendbares Minigame beschreiben. Die Runtime in Backend und Frontend darf spaeter daraus die passenden Teile in ihre Hülle einhaengen.

Die wichtigste Strukturregel: Minigames sind selbstbeschreibend. App-Shells wie Player-Hülle, Result-Screen, Catalog, Editor und Shared Contract dürfen keine spezifische Spielelogik oder spezielle Task-Typen kennen. Details wie Varianten, Payloads, UI-State, Result-Texte, Scoring und Komponenten werden vom jeweiligen Minigame über Registry/Definitionen bereitgestellt.

Siehe `minigames/ARCHITECTURE.md` für die verbindlichen Architekturregeln und die Checkliste für neue Minigames.

## Empfohlene Dateien

- `game.ts`: Exportiert die `*Game`-Klasse, die `Minigame<TVariantData, TSubmission, TResult>` implementiert.
- `variants.ts`: Exportiert konkrete Variant-Daten für Content und Balancing.
- `server-handler.ts`: Erstellt Submissions, wertet serverseitig aus und stellt Tasks aus `variants.ts` bereit.
- `player-ui/ui-contract.ts`: Definiert den Zustand, den die Player-Hülle in Angular hineinreicht, und Events, die die Komponente zurücksendet.
- `player-ui/phase-N-<name>/*`: Eine Angular-Komponente pro interaktiver Runde.
- `player-ui/result/*`: Eine Angular-Komponente für die Auswertung.
- `README.md`: Minigame-spezifische Notizen, Annahmen und Datenfluss.

## Quadratische Spielflaeche

Jede Player-UI-Komponente wird für eine quadratische Grundflaeche entworfen. Die empfohlene virtuelle Design-Groesse ist `200 x 200`. Die spaetere Player-Hülle entscheidet, wie gross dieses Quadrat auf dem konkreten Geraet dargestellt wird.

Die Minigame-Komponente soll deshalb immer `width: 100%`, `height: 100%` und eine bereits skalierte Stage erwarten. Sie darf keine Annahmen über das restliche Screen-Layout treffen.

Die Hülle rendert dafür `MinigameStageComponent` aus `minigames/_shared/minigame-stage`. Diese Komponente:

- misst das responsive Quadrat aussen
- rendert innen eine feste `200 x 200`-Bühne
- skaliert diese Bühne per `transform: scale(...)`

Innerhalb eines Minigames werden normale Tailwind-Groessen verwendet, z. B. `text-sm`, `p-8`, `gap-5` oder `h-16`. Diese Werte werden als Ganzes skaliert und bleiben dadurch proportional stabil.

Aktionen der Hülle gehoeren nicht in die Spielflaeche:

- `Submit`
- `Aussetzen`
- Navigation zur naechsten Runde

Nur echte Spielinteraktionen liegen im Quadrat, zum Beispiel Zeichnen, Platzieren, Auswaehlen oder beim Timer `Start` und `Stopp`.

## Datenmodell

- `TMinigameVariantData`: Statischer Input für eine konkrete Variante, z. B. Titel, Sekunden, Zielwerte, Bilder oder Optionen.
- `TMinigameSubmission`: Der über mehrere Runden aufgebaute Spielerbeitrag. Bei mehreren Runden kann dieser Typ optionale Felder oder eine explizite `rounds`-Struktur enthalten.
- `TMinigamePlayerResult`: Das Ergebnis pro Spieler für den Auswertungsscreen.

## Beispiel

* `timer-stop` ist aktuell das Referenz-Minispiel. Es hat eine interaktive Runde, eine Submission und eine rein serverseitig berechenbare Platzierung. 

* `estimate-opinions` zeigt zusaetzlich, wie ein Minigame eigene Optionsdaten, Draft-State, Slider-Input und Ergebnisdarstellung kapselt.
