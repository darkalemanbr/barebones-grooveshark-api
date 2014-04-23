// WARNING: Upon reading the following code, your eyes might catch fire.
/**
 * A barebones Grooveshark API for node.js
 * @module bb-gs-api
 */

var http = require('http');
var https = require('https');
var util = require('util');
var crypto = require('crypto');
var uuid = require('node-uuid');

const GS_HOST = 'html5.grooveshark.com';
const GS_GATEWAY = '/more.php';
const GS_CLIENT = 'mobileshark';

/**
 * @constructor
 */
var API = function() {
    this._host = GS_HOST;
    this._gateway = GS_GATEWAY;
    this._client = GS_CLIENT;
    /**
     * This contains the GS.config object extracted from the HTML5 Grooveshark index, plus the UUID, the secret key, the one-time token salt and the Grooveshark HTML5 client revision.
     * Only available after the session has initialized.
     * @readOnly
     * @type {String}
     */
    this.config = null;
};

/**
 * Starts a new session, replacing the previous one.
 * Keep in mind that the session lasts 7 days.
 * @param {Function} cb - Called on success.
 */
API.prototype.initSession = function(cb) {
    var self = this;

    // Reset all instance variables
    self.config = {};

    // Retrieve the index page from Grooveshark HTML5
    var indexData = '';
    http.get({
        host: self._host,
        headers: {
            'Accept-Encoding': '' // Tells the server to only send plain data
        }
    }, function(indexRes) {
        indexRes.on('data', function(chunk) {
            indexData += chunk.toString();
        });

        indexRes.on('end', function() {
            self.config = JSON.parse(indexData.match(/GS\.config\s*=\s*(.*?);/)[1]); // Find GS.config object in the data and parse that
            self.config.secretKey = crypto.createHash('md5').update(self.config.sessionID).digest('hex'); // Secret key is just an MD5 hash of the PHP session ID
            self.config.UUID = uuid.v4();

            // Find the client revision and salt
            // They are used to generate one-time tokens
            // Both are hardcoded inside one of the many scripts linked at the index page
            // This may seem like craze, but this is a very quick way to obtain them
            var appjsData = '';
            http.get({
                host: self._host,
                path: indexData.match(/src="(.*app.min.js\?\d{10})/i)[1],
                headers: {
                    'Accept-Encoding': '',
                    'Referer': util.format('http://%s/', self._host) // Makes it harder for them to spot us :P (not really, but who knows...)
                }
            }, function(appjsRes) {
                appjsRes.on('data', function(chunk) {
                    appjsData += chunk.toString();
                });

                appjsRes.on('end', function() {
                    console.log(self._host);
                    var saltStoredAt = appjsData.match(/revToken\:([a-zA-Z]+)/)[1];
                    self.config.salt = new RegExp(util.format('var %s="(.*?)"', saltStoredAt)).exec(appjsData)[1];

                    self.config.clientRevision = appjsData.match(/clientRevision\:"(\w+)/)[1];
                    if (typeof cb === 'function') cb();
                });

                appjsRes.on('error', function() {});
            });
        });
        indexRes.on('error', function() {});
    });
};

/**
 * Generates a new one-time token.
 * Those are used with certain API methods, mostly stream-related (get a stream key for a song and such).
 * @param {String} apiMethod API method which this token is being generated for.
 * @returns {String} New one-time token.
 */
API.prototype.generateToken = function(apiMethod) {
    var self = this;

    // For the format used here, see:
    // http://nettech.wikia.com/wiki/Grooveshark_Internal_API#Using_the_Token

    if (self.config === null)
        return '';

    var randHex = '';
    for (var i = 0; i < 6; i++)
        randHex += Math.floor(Math.random() * 16).toString(16);

    var hash = crypto.createHash('sha1').update([apiMethod, Grooveshark.config.secretKey, randHex].join(':')).digest('hex');

    return randHex + hash;
};

/**
 * Call API method at the Grooveshark gateway.
 * @param {String}   method Method to be called.
 * @param {Object}   params Object containing parameters.
 * @param {Function} cb     Called with the object returned by the server as the first parameter.
 */
API.prototype.callMethod = function(method, params, cb) {
    var self = this;

    if (self.config === null)
        return;

    var requestData = JSON.stringify({
        header: {
            client: self._client,
            clientRevision: self.config.clientRevision,
            country: self.config.country,
            privacy: 0,
            session: self.config.sessionID,
            uuid: self.config.UUID
        },
        method: method,
        parameters: params
    });

    apiReq = https.request({
        method: 'POST',
        host: self._host,
        path: util.format('%s?%s', self._gateway, method),
        headers: {
            'Accept-Encoding': '',
            'Content-Length': requestData.length,
            'Content-Type': 'text/plain',
            'Cookie': util.format('PHPSESSID=%s', self.config.sessionID), // Pass back the session cookie, otherwise the session will expire at the server
            'Origin': util.format('http://%s', self._host),
            'Referer': util.format('http://%s/', self._host)
        }
    }, function(apiRes) {
        var apiData = '';

        apiRes.on('data', function(chunk) {
            apiData += chunk.toString();
        });

        apiRes.on('end', function() {
            if (typeof cb === 'function') cb(JSON.parse(apiData).result);
        });

        apiRes.on('error', function() {});
    }).end(requestData);
};

module.exports = API;