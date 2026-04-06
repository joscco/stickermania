/**
 * Screenshot script — builds the frontend, starts the mock server,
 * captures every distinct screen, then shuts down.
 *
 * Usage:
 *   npm run screenshots
 *
 * Each screen is addressed via a dedicated session code (MOCK-<screen-id>)
 * so no frontend changes are needed — the app behaves exactly as in production.
 *
 * Override the base URL to use an already-running server:
 *   SCREENSHOT_BASE_URL=http://localhost:3001 npm run screenshots
 */

import {chromium} from 'playwright';
import {mkdirSync} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {execSync} from 'child_process';
import {createMockServer} from './mock-server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const OUT_DIR   = join(ROOT, 'screenshots');
const PHONE_VP  = {width: 390, height: 844};    // iPhone 14
const BOARD_VP  = {width: 1920, height: 1080};  // Full HD TV

// When SCREENSHOT_BASE_URL is set we skip the build+mock-server phase
const EXTERNAL_URL = process.env.SCREENSHOT_BASE_URL ?? null;

/**
 * All screens to capture.
 * The screen id is passed as a cookie (mock-screen=<id>) — not in the URL —
 * so the session code shown in the UI is always the clean "MOCK" string.
 *
 *   Player screens: /#/player?session=MOCK
 *   Board screens:  /#/board/MOCK
 */
const SCREENS = [
    // ── Player – connection states ─────────────────────────────────────────────
    {id: 'player-connecting',         screenKey: 'connecting',         vp: PHONE_VP, path: '/#/player?session=MOCK', waitMs: 600},
    {id: 'player-reconnecting',       screenKey: 'reconnecting',       vp: PHONE_VP, path: '/#/player?session=MOCK', waitMs: 1200},
    {id: 'player-disconnected',       screenKey: 'disconnected',       vp: PHONE_VP, path: '/#/player?session=MOCK', waitMs: 600},

    // ── Player – lobby ─────────────────────────────────────────────────────────
    {id: 'player-lobby-name',         screenKey: 'lobby-name',         vp: PHONE_VP, path: '/#/player?session=MOCK'},
    {id: 'player-lobby-avatar',       screenKey: 'lobby-avatar',       vp: PHONE_VP, path: '/#/player?session=MOCK'},
    {id: 'player-lobby-waiting',      screenKey: 'lobby-waiting',      vp: PHONE_VP, path: '/#/player?session=MOCK'},

    // ── Player – building ──────────────────────────────────────────────────────
    {id: 'player-building',           screenKey: 'building',           vp: PHONE_VP, path: '/#/player?session=MOCK'},
    {id: 'player-building-submitted', screenKey: 'building-submitted', vp: PHONE_VP, path: '/#/player?session=MOCK'},
    // building-skipped is a local UI state: click the skip button to reach it
    {id: 'player-building-skipped',   screenKey: 'building',           vp: PHONE_VP, path: '/#/player?session=MOCK',
        postAction: async (page) => {
            await page.getByRole('button', {name: /überspringen/i}).click();
            await page.waitForTimeout(300);
        }
    },

    // ── Player – voting / results ──────────────────────────────────────────────
    {id: 'player-voting',             screenKey: 'voting',             vp: PHONE_VP, path: '/#/player?session=MOCK'},
    {id: 'player-results',            screenKey: 'results',            vp: PHONE_VP, path: '/#/player?session=MOCK'},
    {id: 'player-next-round',         screenKey: 'next-round',         vp: PHONE_VP, path: '/#/player?session=MOCK'},

    // ── Board ──────────────────────────────────────────────────────────────────
    {id: 'board-lobby',               screenKey: 'board-lobby',        vp: BOARD_VP, path: '/#/board/MOCK'},
    {id: 'board-building',            screenKey: 'board-building',     vp: BOARD_VP, path: '/#/board/MOCK'},
    {id: 'board-voting',              screenKey: 'board-voting',       vp: BOARD_VP, path: '/#/board/MOCK'},
    {id: 'board-results',             screenKey: 'board-results',      vp: BOARD_VP, path: '/#/board/MOCK'},
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function build() {
    console.log('🔨 Building frontend...');
    execSync('npm run _build:party', {cwd: ROOT, stdio: 'inherit'});
    console.log('✅ Build done.\n');
}

async function waitForServer(baseUrl, {retries = 40, intervalMs = 300} = {}) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(`${baseUrl}/api/sessions`, {signal: AbortSignal.timeout(1000)});
            if (res.status < 500) { console.log('✅ Server ready.\n'); return; }
        } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Server at ${baseUrl} did not become ready.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    mkdirSync(OUT_DIR, {recursive: true});

    let mockServer = null;
    let baseUrl    = EXTERNAL_URL;

    try {
        if (!EXTERNAL_URL) {
            build();
            mockServer = createMockServer();
            await mockServer.start();
            baseUrl = `http://localhost:${mockServer.port}`;
            console.log(`🚀 Mock server running at ${baseUrl}\n`);
        } else {
            console.log(`ℹ️  Using existing server at ${baseUrl}\n`);
            await waitForServer(baseUrl);
        }

        const browser = await chromium.launch();
        let ok = 0, fail = 0;

        for (const screen of SCREENS) {
            // Fresh context per screen — isolates localStorage, cookies, etc.
            const context = await browser.newContext({ viewport: screen.vp });
            const page = await context.newPage();
            try {
                // Intercept the by-code API call and inject the screen key as a
                // custom response field. The mock server reads it back via WS.
                // We use a dedicated session ID per screen so the server can map
                // the right state even if multiple connections arrive simultaneously.
                const sessionIdForScreen = `MOCK-${screen.screenKey}`;
                await page.route('**/api/sessions/by-code/**', route => {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            sessionId:   sessionIdForScreen,
                            sessionCode: 'MOCK',
                            createdAt:   Date.now(),
                            expiresAt:   Date.now() + 86_400_000,
                        }),
                    });
                });

                await page.goto(`${baseUrl}${screen.path}`, {waitUntil: 'networkidle', timeout: 20_000});
                await page.waitForTimeout(screen.waitMs ?? 800);
                if (screen.postAction) await screen.postAction(page);
                const outPath = join(OUT_DIR, `${screen.id}.png`);
                await page.screenshot({path: outPath, fullPage: false});
                console.log(`  ✅ ${screen.id}`);
                ok++;
            } catch (err) {
                console.error(`  ❌ ${screen.id}: ${err.message}`);
                fail++;
            } finally {
                await context.close();
            }
        }

        await browser.close();
        console.log(`\nDone: ${ok} ok, ${fail} failed.  →  ${OUT_DIR}`);
        if (fail > 0) process.exitCode = 1;

    } finally {
        if (mockServer) {
            await mockServer.stop();
            console.log('🛑 Mock server stopped.');
        }
    }
}

run().catch(err => { console.error(err); process.exit(1); });
