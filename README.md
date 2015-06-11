**Notice: Grooveshark is no more.**

Barebones Grooveshark API
=====================

This is a very simple API for Grooveshark. It works by "simulating" the
Grooveshark HTML5 client, so you can interact with GS even if you don't have a
key to the official API.

Usage example:

    var bbgs = require('bb-gs-api');

    var Grooveshark = new bbgs();
    Grooveshark.initSession(function() {
        console.log('Grooveshark session started successfully!');

        console.log('Attempting to retrieve communication token...')
        Grooveshark.callMethod('getCommunicationToken', {
            secretKey: Grooveshark.config.secretKey
        }, function(result) {
            console.log('The communication token is: "' + result + '"');
        });
    });
