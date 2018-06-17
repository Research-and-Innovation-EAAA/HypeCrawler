const ORM = require('../data/general-orm-1.1.0');

/**
 * @class
 * Simple filter, encapsulating the methods used for iterations through selected Annonces.
 */
class AnnonceFilter {

    /**
     * Compares each Annonce with execution start timestamp, and marks those older as obsolete.
     *
     * @since       1.0.0
     * @access      public
     *
     * @param {String}              jobsite                 Jobsite to apply filter to
     * @param {String}              executionStartTimestamp Start time of current program execution
     */
    static async RunFilter(jobsite, executionStartTimestamp) {
        let annonceList = await ORM.GetAnnoncesFromSite(jobsite);
        for (let annonce of annonceList) {
            if(new Date(executionStartTimestamp) > new Date(annonce.LAST_VISITED_TIMESTAMP &&
                annonce.LAST_VISITED_TIMESTAMP === null)) {
                let closingTimestamp = ORM.CreateTimestampNow();
                await ORM.UpdateClosedAtTimestamp(closingTimestamp, annonce.CHECKSUM);
            }
        }
    }
}


module.exports = AnnonceFilter;