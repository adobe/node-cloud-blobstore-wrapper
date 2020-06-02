#!/usr/bin/env node

/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

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

// Inspired by https://github.com/aws/aws-sdk-js/blob/master/dist-tools/browser-builder.js
// Tool to build aws-sdk for browser https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/building-sdk-for-browsers.html

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
        services: process.argv[2] || process.env.USED_AWS_SERVICES,
        minify: true
    };
    build(opts, function (err, code) {
        if (err) console.error(err.message);
        else console.log(code);
    });
}

module.exports = build;
