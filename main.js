let puppeteer = require('puppeteer');
const ORM = require('./data/general-orm-1.1.0');
let jobindexClass = require('./scrapers/jobindex-scraper-1.0.0');
let careerjetClass = require('./scrapers/careerjet-scraper-1.0.0');
let filter = require('./filter/annonce-filter-1.0.0');

async function main() {

    let executionStartTimestamp = ORM.CreateTimestampNow();

    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({ // Handling of correct reading of danish alphabet
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    if (process.env.SCRAPER === "" || process.env.SCRAPER === "jobindex") {
        let scraper = new jobindexClass();
        await run(scraper, browser, page)
            .catch((error) => {
              throw new Error(error);
           });

        // Search for obsolete annonces
        if(process.env.SEARCH_FOR_OBSOLETE === "true") {
           await filter.RunFilter("jobindex", executionStartTimestamp)
               .catch((error) => {
                   throw new Error("Error at main → filter.RunFilter(): " + error);
               });
        }
        //Print result
        scraper.printDatabaseResult();
    }

    if (process.env.SCRAPER === "" || process.env.SCRAPER === "careerjet") {

        let scraper = new careerjetClass();
        await run(scraper, browser, page)
            .catch((error) => {
            throw new Error(error);
        });

        // Search for obsolete annonces
        if(process.env.SEARCH_FOR_OBSOLETE === "true") {
            await filter.RunFilter("careerjet", executionStartTimestamp)
                .catch((error) => {
                throw new Error("Error at main → filter.RunFilter(): " + error);
            });
        }
        //Print result
        scraper.printDatabaseResult();
    }


    // Clean up:
    browser.close();

    console.log("Start time: " + executionStartTimestamp);
    console.log("End time: " + ORM.CreateTimestampNow());

}

async function run(scraper, browser, page) {
    await scraper.initializeDatabase()
        .catch((error) => {
            throw Error("Error at main → initializeDatabase(): " + error);
        });

    //<editor-fold desc="TestArea for interface">
    await scraper.beginScraping(page, browser, 1, 3)
        .catch((error) => {
            console.log("Error at main → beginScraping(): " + error);

        });
}

main().then((result) => {
    console.log("Successful termination: " + result);

}, (error) => {
    console.log("Failed termination: " + error);
});
