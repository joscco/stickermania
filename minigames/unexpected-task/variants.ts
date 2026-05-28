import type {UnexpectedTaskVariantData} from "./game.js";

export const UNEXPECTED_TASK_VARIANTS: UnexpectedTaskVariantData[] = [
  {
    id: "italian-food-calories",
    title: "Unerwartete Aufgabe: Italiener",
    firstRoundSeconds: 35,
    secondRoundSeconds: 25,
    answerQuestion: "Nenne ein Gericht vom Italiener.",
    ratingQuestion: "Welches Gericht hat mehr Kalorien?",
    sampleAnswers: ["Lasagne", "Pizza Salami", "Tiramisu", "Spaghetti Carbonara", "Risotto"],
  },
  {
    id: "holiday-place-expensive",
    title: "Unerwartete Aufgabe: Urlaub",
    firstRoundSeconds: 35,
    secondRoundSeconds: 25,
    answerQuestion: "Nenne eine Urlaubs-Location.",
    ratingQuestion: "Welcher Ort klingt teurer?",
    sampleAnswers: ["Maldiven", "Sylt", "New York", "Tokio", "St. Moritz"],
  },
  {
    id: "movie-character-survival",
    title: "Unerwartete Aufgabe: Filmfigur",
    firstRoundSeconds: 35,
    secondRoundSeconds: 25,
    answerQuestion: "Nenne eine bekannte Filmfigur.",
    ratingQuestion: "Wer wuerde eine Zombie-Apokalypse eher ueberleben?",
    sampleAnswers: ["James Bond", "Lara Croft", "Sherlock Holmes", "Elsa", "Indiana Jones"],
  },
];
