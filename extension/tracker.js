// NodeCG extension code for pulling donation totals and current bids from the donation tracker site.

'use strict';

// Referencing packages.
let request = require('request-promise').defaults({jar: true}); // Automatically saves and re-uses cookies.

// Declaring other variables.
let nodecg = require('./utils/nodecg-api-context').get();

// Replicants.
let donationTotal = nodecg.Replicant('donationTotal', {defaultValue: 0});
let bids = nodecg.Replicant('bids', {defaultValue: []});

// Get donation total from HTTPS API, backup for the repeater socket server.
// We need to add both events together to get the correct total.
function updateDonationTotalFromAPI() {
    let url = nodecg.bundleConfig.tracker.url + "/" +
        nodecg.bundleConfig.tracker.eventId + "?json";
    nodecg.log.debug('Fetching donation total from URL: ' + url);
    request(url, (err, resp, body) => {
        if (!err && resp.statusCode === 200) {
            body = JSON.parse(body);
            let total = body.agg.amount ? parseFloat(body.agg.amount) : 0;
            nodecg.log.debug('Got donation total:', '$' + total);
            if (donationTotal.value !== total)
                nodecg.log.info('API donation total changed:', '$' + total);
            donationTotal.value = total;
        } else {
            nodecg.log.error('Error updating donation total:', err);
        }
    });
}

// Get the open bids from the API.
function updateBids() {
    let url = nodecg.bundleConfig.tracker.url +
        "/search?event=" + nodecg.bundleConfig.tracker.eventId +
        "&type=allbids&state=OPENED";
    nodecg.log.debug('Fetching bids from URL: ' + url);
    request(url, (err, resp, body) => {
        if (!err && resp.statusCode === 200) {
            let currentBids = processRawBids(JSON.parse(body));
            nodecg.log.debug('Got ' + currentBids.length + ' bids');
            bids.value = currentBids;
        } else {
            nodecg.log.error('Error updating bids:', err);
        }
    });
}

// Processes the response from the API above.
function processRawBids(bids) {
    let parentBidsByID = {};
    let childBids = [];

    bids.forEach(bid => {
        // Ignore denied/pending entries.
        if (bid.fields.state === 'DENIED' || bid.fields.state === 'PENDING')
            return;

        // bid is an option for a bid war if the parent is set.
        if (bid.fields.parent)
            childBids.push(bid);
        else {
            // We want to use the short description if possible.
            let description = bid.fields.shortdescription;
            if (!description || description === '')
                description = bid.fields.description;

            let formattedParentBid = {
                id: bid.pk,
                name: bid.fields.name,
                total: parseFloat(bid.fields.total),
                game: bid.fields.speedrun__name,
                category: bid.fields.speedrun__category,
                description: description,
                end_time: Date.parse(bid.fields.speedrun__endtime)
            };

            // If the bid isn't a target, it will be a bid war.
            if (!bid.fields.istarget) {
                formattedParentBid.war = true;
                formattedParentBid.allow_user_options = bid.fields.allowuseroptions;
                formattedParentBid.options = [];
            } else
                formattedParentBid.goal = parseFloat(bid.fields.goal);

            parentBidsByID[bid.pk] = formattedParentBid;
        }
    });

    childBids.forEach(bid => {
        let formattedChildBid = {
            id: bid.pk,
            parent: bid.fields.parent,
            name: bid.fields.name,
            total: parseFloat(bid.fields.total)
        };

        // If we have a parent for this child, add it to the parent.
        let parent = parentBidsByID[bid.fields.parent];
        if (parent)
            parentBidsByID[bid.fields.parent].options.push(formattedChildBid);
    });

    // Transfer object made above to an array instead.
    let bidsArray = [];
    for (let id in parentBidsByID) {
        if (!{}.hasOwnProperty.call(parentBidsByID, id))
            continue;

        let bid = parentBidsByID[id];

        if (bid.options && bid.options.length) {
            // Sort bid war options from largest to smallest.
            bid.options = bid.options.sort((a, b) => {
                if (a.total > b.total)
                    return -1;
                if (a.total < b.total)
                    return 1;

                // a must be equal to b
                return 0;
            });
        }

        bidsArray.push(bid);
    }

    // Sort by earliest first.
    bidsArray.sort((a, b) => {
        if (a.end_time < b.end_time)
            return -1;
        if (a.end_time > b.end_time)
            return 1;

        // a must be equal to b
        return 0;
    });

    return bidsArray;
}

// Make the GDQ tracker stuff optional if you just want the layout switching.
if (nodecg.bundleConfig.tracker && nodecg.bundleConfig.tracker.enable) {
    let refreshTime = 60 * 1000; // Get tracker info every 60s.

    // Get initial donation total on startup and every 60 seconds.
    updateDonationTotalFromAPI();
    setInterval(updateDonationTotalFromAPI, refreshTime);

    // Get bids on startup and every 60 seconds.
    updateBids();
    setInterval(updateBids, refreshTime);
}
