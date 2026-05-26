import {Minigame, MinigameVariantData} from "../../packages/shared/src/minigame";

export type UnexpectedTaskGameVariantData = {
    id: string;  // draw-george-hair
    title: string; // Male George eine Frisur
    firstRoundSeconds: number; // 30
    secondRoundSeconds: number; // 20
    backgroundImage: string; // george-without-hair.png
    specialTasks: string[] // ["80er Disco", "Steuerberater", "Afro"]
}

export type UnexpectedTaskGameSubmission = {
    playerId: string;
}

export type UnexpectedTaskGamePlayerResult = {
    playerId: string;

}

export class UnexpectedTaskGame implements Minigame<
    UnexpectedTaskGameVariantData,
    UnexpectedTaskGameSubmission,
    UnexpectedTaskGamePlayerResult
> {

}

