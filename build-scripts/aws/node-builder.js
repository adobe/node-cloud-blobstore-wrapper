#!/usr/bin/env node

'use strict';

const path = require('path');
const uglify = require('uglify-js');
const img = require('insert-module-globals');
const browserify = require('browserify');
const awsLicense = require('aws-sdk/dist-tools/browser-builder').license;

const STANDALONE_IDENTIFIER = 'AWS'; // namespace for built lib

function minify(code) {
    const minified = uglify.minify(code, { fromString: true });
    return minified.code;
}

function build(options, callback) {
    if (arguments.length === 1) {
        callback = options;
        options = {};
    }

    img.vars.process = function () { return '{browser:false}'; };
    if (options.services) process.env.AWS_SERVICES = options.services;

    const brOpts = {
        basedir: path.resolve(__dirname, '../../node_modules/aws-sdk'),
        standalone: STANDALONE_IDENTIFIER,
        detectGlobals: false,
        browserField: false,
        builtins: false,
        ignoreMissing: true,
        commondir: false,
        insertGlobalVars: {
            process: undefined,
            global: undefined,
            'Buffer.isBuffer': undefined,
            Buffer: undefined
        }
    };

    browserify(brOpts)
        .add('./')
        .ignore('domain')
        .bundle(function (err, data) {
            if (err) return callback(err);

            let code = (data || '').toString();
            if (options.minify) code = minify(code);

            code = awsLicense + code;
            callback(null, code);
        });
}

// run if we called this tool directly
if (require.main === module) {
    const opts = {
        services: process.argv[2] || process.env.SERVICES,
        minify: process.env.MINIFY ? true : false
    };
    build(opts, function (err, code) {
        if (err) console.error(err.message);
        else console.log(code);
    });
}

module.exports = build;
