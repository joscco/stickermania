import {TimerStopVariantData} from "./game";

export const TIMER_STOP_VARIANTS: TimerStopVariantData[] = [
  {
    id: "stop-at-five",
    title: "Stopp die Uhr bei exakt 5 Sekunden!",
    firstRoundSeconds: 10,
    targetSeconds: 5,
    toleranceSeconds: 0.15,
  },
  {
    id: "stop-at-ten",
    title: "Stopp die Uhr bei exakt 10 Sekunden!",
    firstRoundSeconds: 15,
    targetSeconds: 10,
    toleranceSeconds: 0.25,
  },
];
