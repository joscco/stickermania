# Minigame Folder Contract

Ein Ordner unter `minigames/<minigame-id>` soll ein einzelnes wiederverwendbares Minigame beschreiben. Die Runtime in Backend und Frontend darf spaeter daraus die passenden Teile in ihre Huelle einhaengen.

## Empfohlene Dateien

- `game.ts`: Exportiert die `*Game`-Klasse, die `Minigame<TVariantData, TSubmission, TResult>` implementiert.
- `variants.ts`: Exportiert konkrete Variant-Daten fuer Content und Balancing.
- `player-ui/ui-contract.ts`: Definiert den Zustand, den die Player-Huelle in Angular hineinreicht, und Events, die die Komponente zuruecksendet.
- `player-ui/phase-N-<name>/*`: Eine Angular-Komponente pro interaktiver Runde.
- `player-ui/result/*`: Eine Angular-Komponente fuer die Auswertung.
- `README.md`: Minigame-spezifische Notizen, Annahmen und Datenfluss.

## Quadratische Spielflaeche

Jede Player-UI-Komponente wird fuer eine quadratische Grundflaeche entworfen. Die empfohlene virtuelle Design-Groesse ist `200 x 200`. Die spaetere Player-Huelle entscheidet, wie gross dieses Quadrat auf dem konkreten Geraet dargestellt wird.

Die Minigame-Komponente soll deshalb immer `width: 100%`, `height: 100%` und eine bereits skalierte Stage erwarten. Sie darf keine Annahmen ueber das restliche Screen-Layout treffen.

Die Huelle rendert dafuer `MinigameStageComponent` aus `minigames/_shared/minigame-stage`. Diese Komponente:

- misst das responsive Quadrat aussen
- rendert innen eine feste `200 x 200`-Buehne
- skaliert diese Buehne per `transform: scale(...)`

Innerhalb eines Minigames werden normale Tailwind-Groessen verwendet, z. B. `text-sm`, `p-8`, `gap-5` oder `h-16`. Diese Werte werden als Ganzes skaliert und bleiben dadurch proportional stabil.

Aktionen der Huelle gehoeren nicht in die Spielflaeche:

- `Submit`
- `Aussetzen`
- Navigation zur naechsten Runde

Nur echte Spielinteraktionen liegen im Quadrat, zum Beispiel Zeichnen, Platzieren, Auswaehlen oder beim Timer `Start` und `Stopp`.

## Datenmodell

- `TMinigameVariantData`: Statischer Input fuer eine konkrete Variante, z. B. Titel, Sekunden, Zielwerte, Bilder oder Optionen.
- `TMinigameSubmission`: Der ueber mehrere Runden aufgebaute Spielerbeitrag. Bei mehreren Runden kann dieser Typ optionale Felder oder eine explizite `rounds`-Struktur enthalten.
- `TMinigamePlayerResult`: Das Ergebnis pro Spieler fuer den Auswertungsscreen.

## Beispiel

`timer-stop` ist aktuell das Referenz-Minispiel. Es hat eine interaktive Runde, eine Submission und eine rein serverseitig berechenbare Platzierung.
