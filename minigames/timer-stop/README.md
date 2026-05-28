# Timer Stop

Dieses Minigame dient als Referenz fuer die Ordnerstruktur.

## Dateien

- `game.ts`: Domain-Typen, Variant-Daten, Submission-Daten und Result-Berechnung.
- `variants.ts`: Konkrete Varianten, die vom Host oder Backend ausgewaehlt werden koennen.
- `player-ui/ui-contract.ts`: Vertrag zwischen Player-Huelle und Angular-Komponenten.
- `player-ui/phase-0-stop/*`: Spielerkomponente fuer die interaktive Runde.
- `player-ui/result/*`: Spielerkomponente fuer die Auswertung.

## Layout

Die Komponenten erwarten eine Hochformat-Huelle und fuellen diese mit `width: 100%` und `height: 100%`. Sie entwerfen intern gegen die zentrale virtuelle Grundgroesse aus `minigames/_shared/minigame-stage-size.ts`.

Die responsive Skalierung passiert ueber `MinigameStageComponent`. Die Timer-Komponenten nutzen deshalb feste Stage-Pixel fuer Typografie, Abstaende und Buttons. Dadurch veraendert sich beim Skalieren nur die Gesamtgroesse, nicht das Layout-Verhaeltnis.

`Start` und `Stopp` sind Teil der Spielinteraktion und bleiben in der Spielflaeche. `Submit` und `Aussetzen` sind Aktionen der Player-Huelle und liegen ausserhalb der Minigame-Komponente.

## Datenfluss

1. Die Runtime erstellt `new TimerStopGame(variant)` und ruft `provideData()` auf.
2. Die Player-Huelle rendert `TimerStopPhaseComponent` in der Minigame-Stage und uebergibt `TimerStopPlayerUiState`.
3. Die Komponente sendet `TimerStopPlayerUiEvent` mit einem Draft-Wert, sobald gestoppt wurde.
4. Die Player-Huelle erstellt daraus erst bei `Submit` eine `TimerStopSubmission`.
5. Die Runtime sammelt alle Submissions und ruft `calculateResults(submissions)` auf.
6. Die Player-Huelle rendert `TimerStopResultComponent` mit dem eigenen Resultat.
