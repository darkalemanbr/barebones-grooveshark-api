// WARNING: Upon reading the following code, your eyes might catch fire.
/**
 * A barebones Grooveshark API for node.js
 * @module bbgsapi
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
 * @param {String} host - Use a custom host.
 * @param {String} gateway - Use a custom gateway.
 * @param {String} client - Use a custom client.
 */
var API = function(host, gateway, client) {
	this._host = host || GS_HOST;
	this._gateway = gateway || GS_GATEWAY;
	this._client = client || GS_CLIENT;
	/**
	 * This contains the GS.config object extracted from the HTML5 Grooveshark index, plus the UUID, the secret key, the one-time token salt and the Grooveshark HTML5 client revision.
	 * Only available after the session has initialized.
	 * @readOnly
	 * @type {String}
	 */
	this.Config = null;
};

/**
 * Starts a new session, replacing the previous one.
 * Keep in mind that the session lasts 7 days.
 * @param {Function} cb - Called on success.
 */
API.prototype.InitSession = function(cb) {
	var self = this;

	// Reset all instance variables
	self.Config = {};

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
			self.Config = JSON.parse(indexData.match(/GS\.config\s*=\s*(.*?);/)[1]); // Find GS.config object in the data and parse that
			self.Config.secretKey = crypto.createHash('md5').update(self.Config.sessionID).digest('hex'); // Secret key is just an MD5 hash of the PHP session ID
			self.Config.UUID = uuid.v4();

			// Find the client revision and salt
			// They are used to generate one-time tokens
			// Both are hardcoded inside one of the many scripts linked at the index page
			// This may seem like craze, but this is a very quick way to obtain them
			var appjsData = '';
			http.get({
				host: this._host,
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
					var saltStoredAt = appjsData.match(/revToken\:([a-zA-Z]+)/)[1];
					self.Config.salt = new RegExp(util.format('var %s="(.*?)"', saltStoredAt)).exec(appjsData)[1];

					self.Config.clientRevision = appjsData.match(/clientRevision\:"(\w+)/)[1];
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
API.prototype.GenerateToken = function(apiMethod) {
	var self = this;

	// The format is:
	// 5 random numbers, in hex format + sha1_hex(API method being called 'colon' secret key 'colon' same 5 numbers in hex from start)

	if (self.Config === null)
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
API.prototype.CallMethod = function(method, params, cb) {
	var self = this;

	if (self.Config === null)
		return;

	var requestData = JSON.stringify({
		header: {
			client: self._client,
			clientRevision: self.Config.clientRevision,
			country: self.Config.country,
			privacy: 0,
			session: self.Config.sessionID,
			uuid: self.Config.UUID
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
			'Cookie': util.format('PHPSESSID=%s', self.Config.sessionID), // Pass back the session cookie, otherwise the session will expire at the server
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