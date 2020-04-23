/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

'use strict';

const validUrl = require('valid-url');
const { StringUtils } = require('./string-utils.js');

class CDN {

    static getAzureUri(options, accountName) {

        let result = false;

        if(options.hasOwnProperty("cdnUrl")) {
            result = this._verify(options.cdnUrl);
        }

        if(result === false) {
            result = `https://${accountName}.blob.core.windows.net`
        }

        return result;
    }

    static getAwsUri(cdnUrl) {
        return this._verify(cdnUrl);
    }

    static _verify(cdnUrl) {

        if (!StringUtils.isBlankString(cdnUrl)) {

            if (!validUrl.isWebUri(cdnUrl)) {
                throw `CDN URL is not valid, it may be missing protocol: ${cdnUrl}`;
            }
            return cdnUrl.trim();
        } 
        return false;
    }
}

module.exports = {
    CDN
}