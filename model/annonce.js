class Annonce {
    constructor(title, body, regionId, lastVisitedTimestamp, closedAtTimestamp, checksum, url, jobSite) {
        this.titel = title;
        this.body = body;
        this.regionId = regionId;
        this.lastVisitedTimestamp = lastVisitedTimestamp;
        this.closedAtTimestamp = closedAtTimestamp;
        this.checksum = checksum;
        this.url = url;
        this.jobSite = jobSite;
    }
}
module.exports = Annonce;
