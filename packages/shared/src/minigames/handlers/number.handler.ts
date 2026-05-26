import type {NumberTask, NumberSubmission, StickerCollage, MinigameClientAction} from '../../index.js';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<NumberTask, NumberSubmission> = {
  type: 'number',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'number', title, durationSec,
      min: typeof raw['min'] === 'number' ? raw['min'] : 1,
      max: typeof raw['max'] === 'number' ? raw['max'] : 100,
      default: typeof raw['default'] === 'number' ? raw['default'] : 50,
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-number') return null;
    return {
      type: 'number',
      playerId,
      roundIndex,
      value: action.value,
      submittedAt: now,
    };
  },

  getSnapshotSvg: () => null,

  requiresVoting: () => false,

  evaluateSubmissions(submissions, collages) {
    const collageMap = new Map(collages.map(c => [c.playerId, c]));
    const values = submissions.map(s => s.value);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    const scored = submissions.map(s => ({
      playerId: s.playerId,
      score: Math.abs(s.value - avg),
      collageId: collageMap.get(s.playerId)?.id ?? '',
    }));
    scored.sort((a, b) => a.score - b.score);

    return buildResults(scored);
  },

  getResultSummary(mySubmission, allSubmissions) {
    if (!mySubmission) return 'Keine Teilnahme';
    const values = allSubmissions.map(s => s.value);
    const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    return `Deine Zahl: ${mySubmission.value}. Durchschnitt: ${avg}. Abweichung: ${Math.abs(mySubmission.value - avg)}`;
  },

  getDescription() {
    return 'Gib eine Zahl ein. Wer am nächsten am Durchschnitt aller Spieler liegt, gewinnt.';
  },
};

minigameRegistry.register(handler);
export {handler};
