import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright'; // Corrected the import name
import retry from 'async-retry';
import fs from 'fs/promises';

const SBR_CDP = `wss://${process.env.USERNAME}:${process.env.PASSWORD}@${process.env.HOST}`;

const takeScreenshot = async (page, log) => {
    console.log(log ? `${log}...📸` : 'Taking screenshot');
    await page.screenshot({ path: 'page.png', fullPage: true });
};

const scrapeFlights = async (page) => {
    await page.goto("https://www.united.com/en/us", { timeout: 2 * 60 * 1000 });
    console.log('Navigated to united.com');
    await takeScreenshot(page, '🔍 Searching for flights');

    await page.getByPlaceholder('Origin').fill('NYC');
    await page.getByRole('button', { name: 'All Airports' }).click();
    await page.getByPlaceholder('Destination').fill('SFO');
    await page.getByRole('button', { name: 'San Francisco' }).first().click();
    await page.getByPlaceholder('Depart').click();
    await page.getByLabel('August 10').click();
    await page.getByLabel('August 20').click();
    await page.getByRole('button', { name: 'Find flights' }).click();

    await takeScreenshot(page, 'Submitting...');
    await page.getByText('Depart on:').first().waitFor();
    await takeScreenshot(page, 'Flights loaded');

    const data = [];
    const flightType = [
        'info',
        'basic economy',
        'economy',
        'economy - refundable',
        'economy plus',
        'business'
    ];

    const rows = await page.getByRole('row').all();

    for (const row of rows.slice(1, 10)) {
        const flight = { options: [] };
        const cells = await row.getByRole('gridcell').all();

        for (const [index, cell] of cells.entries()) {
            const [cellText] = await cell.allInnerTexts();
            const lines = cellText.split('\n');

            if (index === 0) {
                flight.isNonstop = lines[1] === 'NONSTOP';
                flight.departs = lines[2];
                flight.departsFrom = lines[6];
                flight.arrives = lines[4];
                flight.arrivesAt = lines[10];
                flight.duration = lines[8];
            } else {
                flight.options.push({
                    cost: lines[1],
                    type: flightType[index]
                });
            }
        }
        data.push(flight);
    }

    await fs.writeFile('results.json', JSON.stringify(data, null, 2));
    console.log('✅ Results written to file');
};

async function main() {
    console.log("🟡 Connecting to scraping browser");
    const browser = await chromium.connectOverCDP(SBR_CDP);
    console.log("🟢 Connected! Navigating...");

    const page = await browser.newPage();

    try {
        await scrapeFlights(page);
    } catch (err) {
        await takeScreenshot(page, '🔴 Error');
        throw err;
    } finally {
        await browser.close();
        console.log("🔴 Browser closed");
    }
}

await retry(main, {
    retries: 3,
    onRetry: (err) => {
        console.error("Retrying...", err);
    },
});