// Puppeteer debug script - captures ALL logs and errors including those happening after page load
import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
    const browser = await puppeteer.launch({ headless: false, devtools: true }); // open devtools
    const page = await browser.newPage();

    const logs = [];
    const log = (msg) => { logs.push(msg); console.log(msg); };

    page.on('console', msg => {
        log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
        // Try to get arg values for error messages
        if (msg.type() === 'error') {
            msg.args().forEach(async (arg) => {
                try {
                    const val = await arg.jsonValue();
                    log(`  ARG: ${JSON.stringify(val)}`);
                } catch (e) { }
            });
        }
    });

    page.on('pageerror', err => {
        log(`[PAGEERROR] ${err.toString()}`);
        log(`[PAGEERROR STACK] ${err.stack}`);
    });

    page.on('requestfailed', req => {
        log(`[REQFAIL] ${req.url()} - ${req.failure()?.errorText}`);
    });

    await page.goto('http://localhost:5173/FunctionalFitnessPlanner/', { timeout: 15000 });
    log('=== Page loaded ===');

    // Wait for the login button and click it to simulate login
    await page.waitForSelector('button', { timeout: 5000 }).catch(() => log('No button found'));

    log('Waiting 8s for any data-driven crashes...');
    await new Promise(r => setTimeout(r, 8000));

    const bodyText = await page.evaluate(() => document.body.innerText);
    log(`\n=== PAGE BODY (first 3000 chars) ===\n${bodyText.substring(0, 3000)}`);

    fs.writeFileSync('debug_log.txt', logs.join('\n'));
    log('\nSaved debug log to debug_log.txt');

    // Keep browser open 30s for manual inspection
    log('Browser open for 30 more seconds for manual inspection...');
    await new Promise(r => setTimeout(r, 30000));

    await browser.close();
})();
