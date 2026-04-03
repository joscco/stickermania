import type {DrawSearchModeState} from "@birthday/shared";

const TEST_IMAGES = [
    {file: "/assets/png/art_example_0.png", prompt: "Strandkorb im Schnee"},
    {file: "/assets/png/art_example_1.png", prompt: "Nervöser Kaktus"},
    {file: "/assets/png/art_example_2.png", prompt: "Vergesslicher Goldfisch"},
] as const;

/**
 * Inject seed drawings so that there is immediately something to caption and guess.
 */
export function injectTestDrawings(ms: DrawSearchModeState, count: number, now: number): void {
    for (let i = 0; i < count; i++) {
        const testImage = TEST_IMAGES[i % TEST_IMAGES.length];
        const drawingId = `seed-${i + 1}`;

        ms.drawings[drawingId] = {
            id: drawingId,
            artistId: "__seed__",
            prompt: testImage.prompt,
            imageUrl: testImage.file,
            imageAssetPath: "",
            placedAt: now - (count - i) * 1000,
        };

        ms.captions[`real-${drawingId}`] = {
            id: `real-${drawingId}`,
            drawingId,
            text: testImage.prompt,
            authorId: "__system__",
            isReal: true,
        };
    }
}

