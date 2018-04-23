
// Imports:
const puppeteer = require('puppeteer');
const ORM = require('../data/general-orm-0.0.6');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');

// XPath selectors:
const TARGET_WEBSITE = 'https://www.jobindex.dk';

// Constants:
const ADVERTS_PER_PAGE = 20;
const AREA_NAMES = ['storkoebenhavn', 'nordsjaelland', 'region-sjaelland', 'fyn', 'region-nordjylland',
    'region-midtjylland', 'sydjylland', 'bornholm', 'skaane', 'groenland', 'faeroeerne', 'udlandet'];
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'PaidJob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'PaidJob',
        TITLE_XPATH_ATTRIBUTES: '/a/*[1]'
    },
    {
        URL_XPATH_CLASS: 'jix_robotjob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'jix_robotjob',
        TITLE_XPATH_ATTRIBUTES: '/a/strong'
    }
];

// Counters:
let successCounter = 0, existingCounter = 0, errorCounter = 0;



async function main() {
    // Initialization:
    const browser = await puppeteer.launch({
        headless: true
    });
    const page = await browser.newPage();
    // let startTime = Date.now();
    await initializeDatabase();

    await scrapeRegions(page);

    printDatabaseResult();

    // Clean up:
    browser.close();

}

let currentRegionObject = 0;
let currentRegionID;

async function scrapeRegions(page) {
    // goto next page:
    for (let i = 0; i < AREA_NAMES.length; i++) {
        currentRegionObject = await ORM.FindRegionID(AREA_NAMES[i]);
        currentRegionID = currentRegionObject[0].id;

        console.log(`BEGINNING SCRAPING IN REGION: ${AREA_NAMES[i]}`);
        const REGION_PAGE_SELECTOR = `${TARGET_WEBSITE}/jobsoegning/${AREA_NAMES[i]}`;

        await page.goto(REGION_PAGE_SELECTOR);
        const NUM_PAGES = await getNumPages(page, ADVERTS_PER_PAGE);

        for (let index = 1; index <= NUM_PAGES; index++) {
            console.log('BEGINNING SCRAPING ON PAGE: ' + index);

            //const PAGE_SELECTOR = REGION_PAGE_SELECTOR.replace('PAGE_INDEX', index);
            const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`?page=${index}`);

            let pageURLsAndTitles = await getCurrentPageURLTitles(page, PAGE_SELECTOR);
            await scrapePageList(page, pageURLsAndTitles);
        }
    }
}

async function getPageTitlesAndUrls(page, titleClass, titleAttributes, urlClass, urlAttributes) {
    let xpathTitleData = await page.$x(`//div[@class="${titleClass}"]${titleAttributes}`);
    let xpathUrlData = await page.$x(`//div[@class="${urlClass}"]${urlAttributes}`);

    let titles = [], urls = [];
    for (let i = 0; i < xpathTitleData.length; i++) {
        let xpathTitleTextContent = await xpathTitleData[i].getProperty('textContent');
        let xpathUrlTextContent = await xpathUrlData[i].getProperty('textContent');

        let titleText = await xpathTitleTextContent.jsonValue();
        let urlText = await xpathUrlTextContent.jsonValue();

        if (titleText.length !== 0 && urlText !== 0) {
            titles.push(titleText);
            urls.push(urlText);
        }
    }

    return {titleList: titles, urlList: urls};
}

async function getCurrentPageURLTitles(page, PAGE_SELECTOR) {
    await page.goto(PAGE_SELECTOR);

    let counter = 0;
    let titles = [], urls = [];

    while (titles.length === 0 && counter < PATH_VARIATIONS.length) {
        let currentObject = PATH_VARIATIONS[counter];
        let candidateObj = await getPageTitlesAndUrls(page, currentObject.TITLE_XPATH_CLASS,
            currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES);
        titles = candidateObj.titleList;
        urls = candidateObj.urlList;
        counter++;
    }

    return {PAGE_TITLES: titles, PAGE_URLS: urls}; // TODO Håndter object i scrapePageListV3
}

async function scrapePageList(page, PageTitlesAndURLObject) {
    let cur = PageTitlesAndURLObject;
    for (let index = 0; index < cur.PAGE_TITLES.length; index++) {
        try {
            console.log('Run ' + (index + 1) + ': begun');
            console.time('runTime');

            let annonceTitle = cur.PAGE_TITLES[index];
            let itemUrl = cur.PAGE_URLS[index];

            // Goto linked site and scrape it:
            await page.goto(itemUrl, {
                // timeout: 1000  -- For later reference
            });

            const LINKED_SITE_BODY = await page.$x('/html/body');
            let rawBodyText = await page.evaluate(div => div.textContent, LINKED_SITE_BODY[0]);
            //console.log(rawBodyText);

            // Insert or update annonce to database:
            await insertAnnonce(annonceTitle, rawBodyText, itemUrl);
            console.timeEnd('runTime');

        } catch (e) {
            console.log("SOMETHING WENT WRONG");
            errorCounter++;
        }
    }
}


//<editor-fold desc="HelperMethods">

function printDatabaseResult() {
    let totalEntries = successCounter + existingCounter + errorCounter;

    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log('\t\t\tJOBINDEX.DK SCRAPER STATISTIK');
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[32m" + '\t\t\t' + successCounter + ' OUT OF ' + totalEntries
        + ` (${(successCounter / totalEntries) * 100} %) --- INSERTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');

    console.log("\x1b[33m" + '\t\t\t' + existingCounter + ' OUT OF ' + totalEntries
        + ` (${(existingCounter / totalEntries) * 100} %) --- EXISTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[31m" + '\t\t\t' + errorCounter + ' OUT OF ' + totalEntries
        + ` (${(errorCounter / totalEntries) * 100} %) --- ERRORS`);

    console.log("\x1b[0m", '----------------------------------------------------------');
}

async function getNumPages(page, listLength) {
    const TEXT_FILTER_REGEX = /[^0-9]/g;
    const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
    const ADVERTS_PER_PAGE = listLength;

    let advertContent = await page.$x(TOTAL_ADVERTS_SELECTOR);                      // Collecting the part.
    let rawText = await page.evaluate(div => div.textContent, advertContent[0]);    // Extracting info.
    let filteredText = rawText.replace(TEXT_FILTER_REGEX, '');                      // Filtering number from text.

    let numPages = Math.ceil(filteredText / ADVERTS_PER_PAGE);                      // Calculating page numbers.
    return numPages;
}

async function insertAnnonce(annonceTitle, rawBodyText, annonceURL) {
    if (annonceTitle === '') return;
    let sha1Checksum = sha1(`${annonceTitle}${annonceURL}`);
    let callResult = await ORM.FindChecksum(sha1Checksum);

    if (callResult.length === 0) {
        let newAnnonceModel = await createAnnonceModel(annonceTitle, rawBodyText, currentRegionID, sha1Checksum
        , annonceURL);
        await ORM.InsertAnnonce(newAnnonceModel);
        successCounter++;
    }
    else {
        //console.log('ALREADY IN DATABASE!')// Do nothing - TODO create update method.
        existingCounter++;
    }


}

async function createAnnonceModel(title, body, regionId = null, checksum, url) {
    // Format Timestamp:
    let newDate = new Date();
    let timestampFormat = newDate.getFullYear() + '-' + (newDate.getMonth() < 9 ? '0' : '') + (newDate.getMonth() + 1)
        + '-' + (newDate.getDate() < 9 ? '0' : '') + (newDate.getDate()) + ' ' + newDate.getHours() + ':' +
        newDate.getMinutes() + ':' + newDate.getSeconds();

    // model data into Annonce class:
    return new annonceModel(title, body, regionId, timestampFormat, checksum.toString(), url);
}

async function initializeDatabase() {
    await ORM.CreateRegionTable();
    await ORM.CreateAnnonceTable();

    // Insert the regions:
    for (let element of AREA_NAMES) {
        await ORM.InsertRegion(new regionModel(element));
    }
}
//</editor-fold>


main();