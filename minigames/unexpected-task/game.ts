import {Minigame, MinigamePlayerResult, MinigameVariantData} from "../../packages/shared/src/minigame";

export interface UnexpectedTaskGameVariantData extends MinigameVariantData {
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

export interface UnexpectedTaskGamePlayerResult extends MinigamePlayerResult {

}

export class UnexpectedTaskGame implements Minigame<
    UnexpectedTaskGameVariantData,
    UnexpectedTaskGameSubmission,
    UnexpectedTaskGamePlayerResult
> {

}

