import type {StickerPlaceTask, StickerPlaceSubmission, StickerCollage, MinigameClientAction, StickerPlaceGoal} from '../../contract';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<StickerPlaceTask, StickerPlaceSubmission> = {
  type: 'sticker-place',

  parseTask(raw, id, title, durationSec) {
    const goalRaw = raw['goal'];
    const goal: StickerPlaceGoal | undefined =
      goalRaw === 'closest-to-average' || goalRaw === 'furthest-from-average' ? goalRaw : undefined;
    const svgs = Array.isArray(raw['stickerSvgs'])
      ? (raw['stickerSvgs'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : typeof raw['stickerSvg'] === 'string' ? [raw['stickerSvg']] : ['sticker-shapes-heart'];
    return {
      id, type: 'sticker-place', title, durationSec,
      stickerSvgs: svgs,
      backgroundSvg: typeof raw['backgroundSvg'] === 'string' ? raw['backgroundSvg'] : undefined,
      goal,
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-sticker-place') return null;
    return {
      type: 'sticker-place',
      playerId,
      roundIndex,
      positions: action.positions,
      submittedAt: now,
    };
  },

  getSnapshotSvg(submission) {
    const dots = submission.positions.map(p =>
      `<circle cx="${p.x * 2}" cy="${p.y * 2}" r="8" fill="black"/>`
    ).join('');
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${dots}</svg>`
    )}`;
  },

  requiresVoting: () => false,

  evaluateSubmissions(submissions, collages, task) {
    const collageMap = new Map(collages.map(c => [c.playerId, c]));
    const goal: StickerPlaceGoal | undefined = (task as any).goal;
    const furthest = goal === 'furthest-from-average';

    const posBySticker = new Map<string, Array<{playerId: string; x: number; y: number}>>();
    for (const s of submissions) {
      for (const p of s.positions) {
        if (!posBySticker.has(p.stickerId)) posBySticker.set(p.stickerId, []);
        posBySticker.get(p.stickerId)!.push({playerId: s.playerId, x: p.x, y: p.y});
      }
    }

    const playerScores = new Map<string, number>();
    for (const [, positions] of posBySticker) {
      const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
      const avgY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
      for (const p of positions) {
        const dist = Math.hypot(p.x - avgX, p.y - avgY);
        playerScores.set(p.playerId, (playerScores.get(p.playerId) ?? 0) + dist);
      }
    }

    const scored = Array.from(playerScores).map(([playerId, score]) => ({
      playerId,
      score,
      collageId: collageMap.get(playerId)?.id ?? '',
    }));
    scored.sort((a, b) => furthest ? b.score - a.score : a.score - b.score);

    return buildResults(scored);
  },

  getResultSummary(mySubmission) {
    return mySubmission ? 'Platzierung nach Abstand zum Durchschnitt' : 'Keine Teilnahme';
  },

  getDescription() {
    return 'Platziere die Sticker auf der Fläche. Der durchschnittliche Abstand der Positionen entscheidet.';
  },
};

minigameRegistry.register(handler);
export {handler};
