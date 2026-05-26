import type {ChoiceTask, ChoiceSubmission, StickerCollage, MinigameClientAction} from '../../contract';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<ChoiceTask, ChoiceSubmission> = {
  type: 'choice',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'choice', title, durationSec,
      options: Array.isArray(raw['options'])
        ? (raw['options'] as unknown[]).map((o: any) => ({label: String(o?.label ?? ''), emoji: typeof o?.emoji === 'string' ? o.emoji : undefined}))
        : [],
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-choice') return null;
    return {
      type: 'choice',
      playerId,
      roundIndex,
      selectedIndices: action.selectedIndices,
      submittedAt: now,
    };
  },

  getSnapshotSvg: () => null,

  requiresVoting: () => false,

  evaluateSubmissions(submissions, collages) {
    const collageMap = new Map(collages.map(c => [c.playerId, c]));
    const optionCounts = new Map<number, number>();
    const playerChoices = new Map<string, number[]>();

    for (const s of submissions) {
      playerChoices.set(s.playerId, s.selectedIndices);
      for (const idx of s.selectedIndices) {
        optionCounts.set(idx, (optionCounts.get(idx) ?? 0) + 1);
      }
    }

    let bestOption = -1, bestCount = -1;
    for (const [opt, count] of optionCounts) {
      if (count > bestCount) { bestCount = count; bestOption = opt; }
    }

    const scored: Array<{playerId: string; score: number; collageId: string}> = [];
    for (const [playerId, choices] of playerChoices) {
      const c = collageMap.get(playerId);
      scored.push({playerId, score: choices.includes(bestOption) ? 0 : 1, collageId: c?.id ?? ''});
    }
    scored.sort((a, b) => a.score - b.score);

    return buildResults(scored);
  },

  getResultSummary(mySubmission) {
    return mySubmission ? 'Die beliebteste Wahl gewinnt' : 'Keine Teilnahme';
  },

  getDescription() {
    return 'Wähle eine Option aus. Die Mehrheitsentscheidung gewinnt.';
  },
};

minigameRegistry.register(handler);
export {handler};
