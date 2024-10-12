'use strict';

const MovieDbSdk = require('./libs/movies');
const { confirm } = require('./libs/lex');
const IntentHandler = require('./intents');

// --------------- Events -----------------------

async function dispatch(intentRequest, callback) {
    console.log(`request received for userId=${intentRequest.userId}, intentName=${intentRequest.currentIntent.name}`);
    const { name } = intentRequest.currentIntent;
    console.log('==> IntentHandler', IntentHandler);
    return IntentHandler[name].handler({ intentRequest, callback });
}

// --------------- Main handler -----------------------

// Route the incoming request based on intent.
// The JSON body of the request is provided in the event slot.
exports.handler = (event, context, callback) => {
    try {
        dispatch(event,
            (response) => {
                callback(null, response);
            });
    } catch (err) {
        callback(err);
    }
};
