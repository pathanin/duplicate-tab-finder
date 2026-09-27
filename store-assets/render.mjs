// Renders Chrome Web Store assets from the real popup code.
//   npm run render            -> all images + video
//   npm run render -- hero    -> just the named shots (hero preview smart undo dark marquee tile video)
//   npm run render -- --serve -> keep the stage server up at http://localhost:8766/store-assets/src/stage.html?shot=hero
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = HERE;
const PORT = 8766;
const FPS = 30;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

// The popup page with the fake chrome API injected before its own scripts.
const harness = async () => (await readFile(join(ROOT, 'popup.html'), 'utf8'))
    .replace('<head>', '<head>\n    <base href="/">')
    .replace('<script src="dupes.js">', '<script src="/store-assets/src/mock.js"></script>\n    <script src="dupes.js">');

const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try {
        const body = path === '/store-assets/src/popup-harness.html' ? await harness() : await readFile(join(ROOT, path));
        res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise(r => server.listen(PORT, r));
const url = shot => `http://localhost:${PORT}/store-assets/src/stage.html?shot=${shot}`;

const args = process.argv.slice(2);
if (args.includes('--serve')) {
    console.log(url('hero'));
} else {
    const IMAGES = { hero: '1-hero', preview: '2-preview', smart: '3-smart', undo: '4-undo', dark: '5-dark', marquee: 'marquee-1400x560', tile: 'small-tile-440x280' };
    const wanted = args.length ? args : [...Object.keys(IMAGES), 'video'];
    const browser = await chromium.launch({ channel: 'chrome' });

    for (const shot of wanted.filter(s => IMAGES[s])) {
        const size = { tile: [440, 280], marquee: [1400, 560] }[shot] || [1280, 800];
        const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, colorScheme: shot === 'dark' ? 'dark' : 'light' });
        await page.goto(url(shot));
        await page.waitForFunction(() => window.__ready);
        // Store requires exact pixel sizes and no alpha channel; these PNGs are opaque RGB at 1x.
        await page.screenshot({ path: join(OUT, `${IMAGES[shot]}.png`) });
        console.log('wrote', `${IMAGES[shot]}.png`);
        await page.close();
    }

    if (wanted.includes('video')) {
        const frames = join(OUT, '.frames');
        await rm(frames, { recursive: true, force: true });
        await mkdir(frames);
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
        await page.goto(url('video'));
        await page.waitForFunction(() => window.__ready);
        const total = Math.round(await page.evaluate(() => window.__duration) * FPS);
        for (let f = 0; f < total; f++) {
            await page.evaluate(dt => window.__frame(dt), 1000 / FPS);
            await page.screenshot({ path: join(frames, `${String(f).padStart(5, '0')}.png`) });
            if (f % 60 === 0) process.stdout.write(`frame ${f}/${total}\r`);
        }
        await page.close();
        await new Promise((res, rej) => spawn('ffmpeg', [
            '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.png'),
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart',
            join(OUT, 'promo-video-1080p.mp4'),
        ], { stdio: 'inherit' }).on('exit', c => c ? rej(new Error('ffmpeg ' + c)) : res()));
        await rm(frames, { recursive: true, force: true });
        console.log('wrote promo-video-1080p.mp4');
    }

    await browser.close();
    server.close();
}
