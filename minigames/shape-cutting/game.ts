import {Minigame} from "../../../packages/shared/src/minigame";

export type Polygon = {x: number, y: number}[]

export type ShapeCuttingGameVariantData = {
    id: string;
    title: string;
    durationSec: number;
    backgroundImage: string;
    polygonToCut: Polygon;
    // target fraction to cut between 0 and 1
    targetFraction: number;
}

export type ShapeCuttingGameSubmissionData = {
    playerId: string;
    cutLine: { a: { x: number; y: number }; b: { x: number; y: number } };
}

export type ShapeCuttingGameResu

export class ShapeCuttingGame implements Minigame<
    ShapeCuttingGameVariantData,
    ShapeCuttingGameSubmissionData,
    any
> {


}