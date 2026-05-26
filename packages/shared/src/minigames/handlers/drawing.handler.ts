import type {DrawingTask, DrawingSubmission, StickerCollage, MinigameClientAction} from '../../index.js';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<DrawingTask, DrawingSubmission> = {
  type: 'drawing',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'drawing', title, durationSec,
      backgroundSvg: typeof raw['backgroundSvg'] === 'string' ? raw['backgroundSvg'] : undefined,
      extraTasks: Array.isArray(raw['extraTasks'])
        ? (raw['extraTasks'] as unknown[]).filter((e): e is string => typeof e === 'string' && e.length > 0)
        : undefined,
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-drawing') return null;
    return {
      type: 'drawing',
      playerId,
      roundIndex,
      imageDataUrl: action.imageDataUrl,
      submittedAt: now,
    };
  },

  getSnapshotSvg(submission) {
    return submission.imageDataUrl;
  },

  requiresVoting: () => true,

  evaluateSubmissions(submissions, collages) {
    return buildResults([]);
  },

  getResultSummary(mySubmission) {
    return mySubmission ? 'Abstimmungsergebnis' : 'Keine Teilnahme';
  },

  getDescription() {
    return 'Male etwas in den quadratischen Bereich. Danach wird abgestimmt, wer es am besten umgesetzt hat.';
  },
};

minigameRegistry.register(handler);
export {handler};
