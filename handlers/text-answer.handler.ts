import type {TextAnswerTask, TextAnswerSubmission, StickerCollage, MinigameClientAction} from '../../contract';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<TextAnswerTask, TextAnswerSubmission> = {
  type: 'text-answer',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'text-answer', title, durationSec,
      voteQuestion: typeof raw['voteQuestion'] === 'string' ? raw['voteQuestion'] : '',
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-text-answer') return null;
    return {
      type: 'text-answer',
      playerId,
      roundIndex,
      answer: action.answer,
      submittedAt: now,
    };
  },

  getSnapshotSvg(submission) {
    const safe = submission.answer.replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 40);
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#f5f5f5"/><text x="100" y="45" text-anchor="middle" font-size="14" font-family="sans-serif" fill="black">${safe}</text></svg>`
    )}`;
  },

  requiresVoting: () => true,

  evaluateSubmissions() {
    return buildResults([]);
  },

  getResultSummary(mySubmission) {
    return mySubmission ? 'Abstimmungsergebnis' : 'Keine Teilnahme';
  },

  getDescription() {
    return 'Gib deine Antwort ein. Danach wird abgestimmt, welche Antwort am besten ist.';
  },
};

minigameRegistry.register(handler);
export {handler};
