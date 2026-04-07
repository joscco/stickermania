/**
 * Lightweight mock server for screenshot tooling.
 *
 * Serves the built Angular frontend and exposes just enough HTTP + WebSocket
 * surface to let the app render every distinct screen without a real session.
 *
 * The screen to display is encoded in the session code:
 *   MOCK-building, MOCK-voting, MOCK-board-results, etc.
 *
 * The screenshot script navigates to:
 *   /#/player?session=MOCK-building   (phone screens)
 *   /#/board/MOCK-board-voting        (board screens)
 *
 * Started and stopped automatically by screenshots.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const PORT      = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 3001;

// ── Fixture data ──────────────────────────────────────────────────────────────

const STICKER_IDS = [
    'sticker_eye_heart', 'sticker_eye_round', 'sticker_eye_sleepy', 'sticker_eye_star',
    'sticker_fruit_apple', 'sticker_fruit_banana', 'sticker_fruit_cherry',
    'sticker_mouth_smile', 'sticker_mouth_tongue', 'sticker_shape_blob',
    'sticker_shape_star', 'sticker_nose_clown',
];

const MOCK_CATALOG = STICKER_IDS.map(id => ({
    id, imageUrl: `assets/png/${id}.png`, categories: ['general'],
}));

const MOCK_HAND = { stickerIds: STICKER_IDS.slice(0, 8), swapsRemaining: 2 };

const MOCK_PLAYERS = {
    'player-1': { id: 'player-1', name: 'Anna',  avatarUrl: 'assets/png/art_bench.png', avatarAssetPath: null, score: 120, joinedAt: 0, connected: true,  isHost: true,  teamId: null },
    'player-2': { id: 'player-2', name: 'Bruno', avatarUrl: 'assets/png/art_bench.png', avatarAssetPath: null, score:  80, joinedAt: 0, connected: true,  isHost: false, teamId: null },
    'player-3': { id: 'player-3', name: 'Clara', avatarUrl: 'assets/png/art_bench.png', avatarAssetPath: null, score:  60, joinedAt: 0, connected: true,  isHost: false, teamId: null },
};

const MOCK_SUBMISSIONS = [
    {
        id: 'col-1', playerId: 'player-1', roundIndex: 0, submittedAt: 0,
        placements: [
            { instanceId: 'i1', stickerId: 'sticker_eye_heart',   x: 20,  y: 20,  rotation:   0, scale: 1.0, zIndex: 1 },
            { instanceId: 'i2', stickerId: 'sticker_mouth_smile',  x: 50,  y: 100, rotation:  10, scale: 1.2, zIndex: 2 },
            { instanceId: 'i3', stickerId: 'sticker_shape_star',   x: 120, y: 40,  rotation: -15, scale: 0.8, zIndex: 3 },
        ],
    },
    {
        id: 'col-2', playerId: 'player-2', roundIndex: 0, submittedAt: 0,
        placements: [
            { instanceId: 'i4', stickerId: 'sticker_fruit_banana', x: 40, y: 60, rotation: 30, scale: 1.0, zIndex: 1 },
            { instanceId: 'i5', stickerId: 'sticker_nose_clown',   x: 80, y: 80, rotation:  0, scale: 1.5, zIndex: 2 },
        ],
    },
    {
        id: 'col-3', playerId: 'player-3', roundIndex: 0, submittedAt: 0,
        placements: [
            { instanceId: 'i6', stickerId: 'sticker_eye_star',   x: 60, y:  30, rotation: -10, scale: 1.0, zIndex: 1 },
            { instanceId: 'i7', stickerId: 'sticker_shape_blob', x: 30, y: 120, rotation:  20, scale: 0.9, zIndex: 2 },
        ],
    },
];

const BASE_MODE_STATE = {
    mode: 'sticker-collage',
    currentRoundIndex: 0,
    currentPrompt: 'Das schönste Geburtstagsmonster',
    roundStartedAt: Date.now() - 60_000,
    roundEndsAt:    Date.now() + 300_000,
    votingEndsAt:   null,
    resultsEndsAt:  null,
    stickerCatalog: MOCK_CATALOG,
    stickerPacks: [{ id: 'pack-1', name: 'Basis', stickerIds: STICKER_IDS, unlockedAtStart: true }],
    unlockedPackIds: ['pack-1'],
    guaranteedPackId: null,
    playerHands: { 'player-1': MOCK_HAND, 'player-2': MOCK_HAND, 'player-3': MOCK_HAND },
    submissions:  { 0: MOCK_SUBMISSIONS },
    skippedPlayerIds: [],
    currentVotes: { 'player-2': ['col-1'], 'player-3': ['col-1', 'col-2'] },
    lastVoteResults: [
        { collageId: 'col-1', playerId: 'player-1', voteCount: 2, pointsAwarded: 100 },
        { collageId: 'col-2', playerId: 'player-2', voteCount: 1, pointsAwarded:  60 },
        { collageId: 'col-3', playerId: 'player-3', voteCount: 0, pointsAwarded:   0 },
    ],
    winnerId: 'player-1',
    promptChoices: ['Das gruseligste Tier', 'Mein Traumfrühstück', 'Ein Roboter im Urlaub'],
    packUnlockChoices: [],
    guaranteedPackChoices: [],
    lastUnlockedPackId: null,
    winnerChoicesDone: false,
    promptHistory: { 0: 'Das schönste Geburtstagsmonster' },
    handSize: 8,
    maxStickersOnCanvas: 12,
    swapCount: 2,
    votesPerPlayer: 3,
};

/**
 * Derives the session-state for a given screen id.
 * The screen id is the suffix after "MOCK-" in the session code.
 */
function buildStateForScreen(screenId, sessionCode) {
    let phase           = 'LOBBY';
    let playerHands     = BASE_MODE_STATE.playerHands;
    let submissions     = BASE_MODE_STATE.submissions;
    let skippedPlayerIds = [];
    let mockPlayers     = MOCK_PLAYERS;

    switch (screenId) {
        case 'lobby-name':
            phase = 'LOBBY';
            mockPlayers = {
                ...MOCK_PLAYERS,
                'player-1': {...MOCK_PLAYERS['player-1'], name: '', avatarUrl: null},
            };
            break;

        case 'lobby-avatar':
            phase = 'LOBBY';
            // Player has a name but no avatar → app routes to LOBBY_AVATAR
            mockPlayers = {
                ...MOCK_PLAYERS,
                'player-1': {...MOCK_PLAYERS['player-1'], avatarUrl: null},
            };
            break;

        case 'lobby-waiting':       phase = 'LOBBY';           break;

        case 'building':
            phase = 'BUILDING';
            submissions = { 0: MOCK_SUBMISSIONS.filter(s => s.playerId !== 'player-1') };
            break;

        case 'building-submitted':
            phase = 'BUILDING';
            // player-1 has already submitted
            break;

        case 'building-skipped':
            phase = 'BUILDING';
            // player-1 has skipped
            skippedPlayerIds = ['player-1'];
            submissions = { 0: MOCK_SUBMISSIONS.filter(s => s.playerId !== 'player-1') };
            break;

        case 'voting':              phase = 'VOTING';           break;
        case 'results':             phase = 'RESULTS';          break;
        case 'next-round':          phase = 'NEXT_ROUND_SETUP'; break;
        case 'board-lobby':         phase = 'LOBBY';            break;
        case 'board-building':      phase = 'BUILDING';         break;
        case 'board-voting':        phase = 'VOTING';           break;
        case 'board-results':       phase = 'RESULTS';          break;
    }

    return {
        sessionId:   sessionCode,
        sessionCode: sessionCode,
        players:     mockPlayers,
        activeMode:  'sticker-collage',
        modeState:   { ...BASE_MODE_STATE, phase, playerHands, submissions, skippedPlayerIds },
        revision:    1,
        updatedAt:   Date.now(),
        createdAt:   Date.now(),
        expiresAt:   Date.now() + 86_400_000,
    };
}

// ── Frontend dist ─────────────────────────────────────────────────────────────

function resolveFrontendDist() {
    const withBrowser = path.join(ROOT, 'apps/frontend/dist/frontend/browser');
    const without     = path.join(ROOT, 'apps/frontend/dist/frontend');
    return fs.existsSync(path.join(withBrowser, 'index.html')) ? withBrowser : without;
}

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png':  'image/png',  '.svg': 'image/svg+xml',         '.ico': 'image/x-icon',
    '.ttf':  'font/ttf',   '.woff2': 'font/woff2',          '.json': 'application/json',
};

// ── Server factory ────────────────────────────────────────────────────────────

export function createMockServer() {
    const frontendDist = resolveFrontendDist();

    const httpServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');

        const urlPath = req.url?.split('?')[0] ?? '/';

        // GET /api/sessions → empty list (health check used by screenshots.mjs)
        if (urlPath === '/api/sessions') {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end('[]');
            return;
        }

        // GET /api/sessions/by-code/:code → always return the fixed MOCK session
        const byCodeMatch = urlPath.match(/^\/api\/sessions\/by-code\/(.+)$/);
        if (byCodeMatch) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                sessionId:   'mock-session',
                sessionCode: 'MOCK',
                createdAt:   Date.now(),
                expiresAt:   Date.now() + 86_400_000,
            }));
            return;
        }

        // Static files
        const filePath = path.join(frontendDist, urlPath === '/' ? 'index.html' : urlPath);
        const ext      = path.extname(filePath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            try {
                res.writeHead(200, {'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
                res.end(fs.readFileSync(filePath));
            } catch {
                res.writeHead(500); res.end();
            }
            return;
        }

        // SPA fallback
        const indexPath = path.join(frontendDist, 'index.html');
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(fs.existsSync(indexPath) ? fs.readFileSync(indexPath) : 'Frontend not built');
    });

    // ── WebSocket ─────────────────────────────────────────────────────────────
    const wss = new WebSocketServer({server: httpServer});

    wss.on('connection', (ws, req) => {
        ws.on('message', raw => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg.type === 'join') {
                const rawId    = (msg.sessionId ?? '').toUpperCase();
                const screenId = rawId.startsWith('MOCK-')
                    ? rawId.slice(5).toLowerCase()
                    : '';
                const playerId = msg.playerId ?? 'player-1';

                // For connecting: don't respond at all — app stays on spinner
                if (screenId === 'connecting') {
                    return;
                }

                // For reconnecting: send welcome once so wasConnected flips to true,
                // then always close immediately on every subsequent join so the app
                // stays permanently in the RECONNECTING spinner.
                if (screenId === 'reconnecting') {
                    ws.send(JSON.stringify({
                        type: 'welcome', clientId: 'mock-client', playerId,
                        sessionId: 'MOCK', serverTime: Date.now(), serverSessionId: 'mock-server',
                    }));
                    // Close after a tiny delay — triggers reconnect loop which we also close,
                    // so the UI stays on the reconnecting spinner indefinitely.
                    setTimeout(() => ws.close(), 100);
                    return;
                }

                // For disconnected: close the socket immediately after welcome
                // so the WS service transitions to "disconnected"
                if (screenId === 'disconnected') {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Session wurde gelöscht.',
                    }));
                    ws.close();
                    return;
                }

                ws.send(JSON.stringify({
                    type:            'welcome',
                    clientId:        'mock-client',
                    playerId,
                    sessionId:       'MOCK',
                    serverTime:      Date.now(),
                    serverSessionId: 'mock-server',
                }));

                ws.send(JSON.stringify({
                    type:  'session-state',
                    state: buildStateForScreen(screenId, 'MOCK'),
                }));
            }

            if (msg.type === 'ping') {
                ws.send(JSON.stringify({type: 'pong', t: msg.t, serverTime: Date.now()}));
            }
        });
    });

    return {
        start: () => new Promise(resolve => httpServer.listen(PORT, '0.0.0.0', resolve)),
        stop:  () => new Promise(resolve => { wss.close(); httpServer.close(resolve); }),
        port:  PORT,
    };
}
