import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const logs = [];
    const log = (msg) => { logs.push(msg); console.log(msg); };

    page.on('console', msg => log(`[${msg.type().toUpperCase()}] ${msg.text()}`));
    page.on('pageerror', err => {
        log(`[PAGEERROR] ${err.toString()}`);
        log(`[STACK] ${err.stack}`);
    });
    page.on('requestfailed', req => log(`[REQFAIL] ${req.url()} - ${req.failure()?.errorText}`));
    page.on('response', async resp => {
        if (!resp.ok() && resp.url().includes('github.io')) {
            log(`[HTTP_ERR] ${resp.status()} ${resp.url()}`);
        }
    });

    log('Navigating to GitHub Pages...');
    await page.goto('https://vbnmzxc9513.github.io/FunctionalFitnessPlanner/', {
        waitUntil: 'networkidle0',
        timeout: 30000
    });

    log('Waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));

    const bodyText = await page.evaluate(() => document.body.innerText);
    log(`\n=== PAGE BODY ===\n${bodyText.substring(0, 2000)}`);

    // Check if #root has content
    const rootHTML = await page.evaluate(() => document.getElementById('root')?.innerHTML || 'NO ROOT');
    log(`\n=== ROOT HTML (first 500) ===\n${rootHTML.substring(0, 500)}`);

    fs.writeFileSync('debug_github_pages.txt', logs.join('\n'));
    log('Saved to debug_github_pages.txt');
    await browser.close();
})();
