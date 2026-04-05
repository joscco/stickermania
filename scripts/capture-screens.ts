/**
 * Screen Snapshot Generator
 * ─────────────────────────
 * Captures screenshots of every board + player screen at multiple viewport sizes.
 *
 * Usage:
 *   npx playwright install chromium   # one-time setup
 *   npx tsx scripts/capture-screens.ts
 *
 * Output goes to:  .screenshots/<viewport>/<phase>-<role>.png
 *
 * The script spins up the backend, creates a session, manipulates state
 * directly via the API, and screenshots every phase for board & player views.
 */

import {chromium, type Browser, type Page} from "playwright";
import {execSync, spawn, type ChildProcess} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ── Config ──────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3001";
const OUTPUT_DIR = path.resolve(process.cwd(), ".screenshots");

const VIEWPORTS = [
    {name: "board-1920x1080", width: 1920, height: 1080},
    {name: "board-1280x720", width: 1280, height: 720},
    {name: "player-390x844", width: 390, height: 844},
    {name: "player-375x667", width: 375, height: 667},
    {name: "player-768x1024", width: 768, height: 1024},
];

const BOARD_PHASES = ["LOBBY", "BUILDING", "VOTING", "RESULTS"] as const;
const PLAYER_PHASES = ["LOBBY", "BUILDING_no_hand", "BUILDING_hand", "BUILDING_submitted", "VOTING", "RESULTS_winner", "RESULTS_loser"] as const;

// ── Helpers ─────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function apiPost(endpoint: string, body?: object): Promise<any> {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status}`);
    return res.json();
}

async function apiGet(endpoint: string): Promise<any> {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status}`);
    return res.json();
}

async function apiPut(endpoint: string, body: object): Promise<any> {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${endpoint} → ${res.status}`);
    return res.json();
}

async function waitForServer(timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await fetch(`${BASE_URL}/api/sessions`);
            return;
        } catch {
            await sleep(300);
        }
    }
    throw new Error("Server did not start in time");
}

// ── Patch session state directly via API ────────────────────────
// We need an endpoint to force state. If it doesn't exist, we'll
// manipulate state through game actions via WebSocket from a page.

async function patchSessionState(sessionId: string, patch: object): Promise<void> {
    try {
        await apiPut(`/api/sessions/${sessionId}/state`, patch);
    } catch {
        // Endpoint may not exist — we'll use WS actions as fallback
        console.warn("[snapshot] PATCH state endpoint not available, using WS fallback");
    }
}

// ── Screenshot logic ────────────────────────────────────────────

async function captureScreenshot(page: Page, viewportName: string, sceneName: string): Promise<void> {
    const dir = path.join(OUTPUT_DIR, viewportName);
    fs.mkdirSync(dir, {recursive: true});
    const filePath = path.join(dir, `${sceneName}.png`);
    await page.screenshot({path: filePath, fullPage: false});
    console.log(`  📸 ${viewportName}/${sceneName}.png`);
}

async function captureAllViewports(browser: Browser, url: string, sceneName: string, setupFn?: (page: Page) => Promise<void>): Promise<void> {
    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({viewport: {width: vp.width, height: vp.height}});
        await page.goto(url, {waitUntil: "networkidle"});
        if (setupFn) await setupFn(page);
        await sleep(800); // let GSAP animations finish
        await captureScreenshot(page, vp.name, sceneName);
        await page.close();
    }
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("\n🎬 Screen Snapshot Generator\n");

    // Clean output
    if (fs.existsSync(OUTPUT_DIR)) {
        fs.rmSync(OUTPUT_DIR, {recursive: true});
    }
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});

    // Check if server is already running
    let serverProcess: ChildProcess | null = null;
    let serverAlreadyRunning = false;

    try {
        await fetch(`${BASE_URL}/api/sessions`);
        serverAlreadyRunning = true;
        console.log("✅ Server already running on port 3001\n");
    } catch {
        console.log("🚀 Starting backend server...");
        serverProcess = spawn("node", ["apps/backend/dist/index.js"], {
            cwd: process.cwd(),
            stdio: "pipe",
            env: {...process.env, PORT: "3001"},
        });
        await waitForServer();
        console.log("✅ Server started\n");
    }

    const browser = await chromium.launch({headless: true});

    try {
        // Create a session
        console.log("📦 Creating session...");
        const session = await apiPost("/api/sessions");
        const sessionCode = session.sessionCode;
        const sessionId = session.sessionId;
        console.log(`   Session: ${sessionCode} (${sessionId})\n`);

        const boardUrl = `${BASE_URL}/#/board/${sessionCode}`;
        const playerUrl = `${BASE_URL}/#/player?session=${sessionCode}`;

        // ── LOBBY phase ──
        console.log("📷 Phase: LOBBY");
        await captureAllViewports(browser, boardUrl, "board-lobby");
        await captureAllViewports(browser, playerUrl, "player-lobby");

        // ── Start the game → BUILDING phase ──
        console.log("\n📷 Phase: BUILDING");

        // Use a board page to send start-game action
        const controlPage = await browser.newPage({viewport: {width: 1280, height: 720}});
        await controlPage.goto(boardUrl, {waitUntil: "networkidle"});
        await sleep(1500);

        // Click "Spiel starten" if visible
        const startBtn = controlPage.locator('button:has-text("Spiel starten")');
        if (await startBtn.isVisible({timeout: 3000}).catch(() => false)) {
            await startBtn.click();
            await sleep(1500);
        }

        await captureAllViewports(browser, boardUrl, "board-building");
        await captureAllViewports(browser, playerUrl, "player-building");
        await controlPage.close();

        // ── VOTING phase ──
        console.log("\n📷 Phase: VOTING");
        const controlPage2 = await browser.newPage({viewport: {width: 1280, height: 720}});
        await controlPage2.goto(boardUrl, {waitUntil: "networkidle"});
        await sleep(1500);

        const endRoundBtn = controlPage2.locator('button:has-text("Runde beenden")');
        if (await endRoundBtn.isVisible({timeout: 3000}).catch(() => false)) {
            await endRoundBtn.click();
            await sleep(1500);
        }

        await captureAllViewports(browser, boardUrl, "board-voting");
        await captureAllViewports(browser, playerUrl, "player-voting");
        await controlPage2.close();

        // ── RESULTS phase ──
        console.log("\n📷 Phase: RESULTS");
        const controlPage3 = await browser.newPage({viewport: {width: 1280, height: 720}});
        await controlPage3.goto(boardUrl, {waitUntil: "networkidle"});
        await sleep(1500);

        const endVotingBtn = controlPage3.locator('button:has-text("Abstimmung beenden")');
        if (await endVotingBtn.isVisible({timeout: 3000}).catch(() => false)) {
            await endVotingBtn.click();
            await sleep(1500);
        }

        await captureAllViewports(browser, boardUrl, "board-results");
        await captureAllViewports(browser, playerUrl, "player-results");
        await controlPage3.close();

        console.log(`\n✅ All screenshots saved to ${OUTPUT_DIR}/`);
        console.log(`   Total: ${VIEWPORTS.length * 8} screenshots\n`);

        // List generated files
        for (const vp of VIEWPORTS) {
            const dir = path.join(OUTPUT_DIR, vp.name);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                console.log(`   📁 ${vp.name}/ (${files.length} files)`);
                for (const f of files) {
                    const stat = fs.statSync(path.join(dir, f));
                    const kb = Math.round(stat.size / 1024);
                    console.log(`      ${f} (${kb} KB)`);
                }
            }
        }
    } finally {
        await browser.close();
        if (serverProcess) {
            serverProcess.kill();
            console.log("\n🛑 Server stopped");
        }
    }
}

main().catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});

