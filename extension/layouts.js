const clone = require('clone');
const nodecg = require('./utils/nodecg-api-context').get();

// The bundle name where all the run information is pulled from.
const speedcontrolBundle = 'nodecg-speedcontrol';

// A replicant that stores all the data for possible game layouts.
// It is intended that everything is set here and nowhere else.
// name: formal name used for GUI (e.g.: selecting in the override panel).
// code: the name used everywhere else, including the CSS file.
// These are the default values, additional ones can be added in the config.
const defaultLayouts = [
    {name: '4:3 1 Player', code: '4_3'},
    {name: '4:3 2 Player', code: '4_3_2p'},
    {name: '4:3 3 Player', code: '4_3_3p'},
    {name: '4:3 4 Player (Currently unused)', code: '4_3-4p'},
    {name: '16:9 1 Player', code: '16_9'},
    {name: '16:9 2 Player (Currently unused)', code: '16_9_2p'},
    {name: '16:9 3 Player', code: '16_9_3p'},
    {name: '16:9 4 Player (Currently unused)', code: '16_9_4p'},
    {name: '3:2 1 Player', code: '3_2'},
	{name: '9:16 2 Player', code:'9_16_2p'}
];

// If we have extra layouts in the bundle config, add them at the end.
if (nodecg.bundleConfig.extraLayouts) {
    for (var l of nodecg.bundleConfig.extraLayouts) {
        defaultLayouts.push(l);
    }
}

// Actual replicant in memory.
const layouts = nodecg.Replicant('gameLayouts', {
    defaultValue: defaultLayouts,
    persistent: false
});

// Current layout info stored in here. Defaults to the first one in the list above.
const currentGameLayout = nodecg.Replicant('currentGameLayout', {defaultValue: clone(layouts.value[0])});

// Message used to change layout, usually manually.
nodecg.listenFor('changeGameLayout', (code, callback) => {
    const layoutInfo = findLayoutInfo(code);
    if (layoutInfo) {
        changeGameLayout(layoutInfo, callback);
    } else {
        nodecg.log.error("Got bad changeGameLayout event code %s", code);
    }
});

// Listens for the current run to change, to get it's layout info.
const runDataActiveRun = nodecg.Replicant('runDataActiveRun', speedcontrolBundle);
runDataActiveRun.on('change', (newVal, oldVal) => {
    // If the run has the same ID, we don't need to change the layout.
    // This stops the layout messing up if you force change it and *then* edit run data.
    if (newVal && oldVal && newVal.runID === oldVal.runID) {
        nodecg.log.debug("Run ID %s did not change, not updating layout", newVal.runID);
        return;
    }

    if (newVal) {
        var layoutCode;
        if (newVal.customData && newVal.customData.layout) {
            layoutCode = newVal.customData.layout;
        } else {
            nodecg.log.warn("Run ID %s does not have custom data for layout", newVal.runID);
            return;
        }

        // Only trigger a change if the layout is actually different.
        const layoutInfo = findLayoutInfo(layoutCode);
        if (layoutInfo) {
            if (!currentGameLayout.value || layoutInfo.code !== currentGameLayout.value.code) {
                changeGameLayout(layoutInfo);
            } else {
                nodecg.log.debug("Current layout %s matches new run ID %s, not changing", layoutInfo.code, newVal.runID);
            }
        } else {
            nodecg.log.error("No layout found for run ID %s, layout %s", newVal.runID, layoutCode);
        }
    }
});

function changeGameLayout(info, callback) {
    // Set replicant to have the correct information for use elsewhere.
    currentGameLayout.value = clone(info);
    nodecg.log.info('Game Layout changed to %s.', info.name);
    if (callback) {
        callback();
    }
}

// Find information about layout based on it's code.
function findLayoutInfo(code) {
    var layoutInfo;
    for (var layout of layouts.value) {
        if (code && layout.code === code.toLowerCase()) {
            layoutInfo = layout;
            break;
        }
    }
    return layoutInfo;
}
