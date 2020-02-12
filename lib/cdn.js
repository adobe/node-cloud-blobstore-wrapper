/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2019 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
**************************************************************************/

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
        } else {
            return false;
        }
    }
}

module.exports = {
    CDN
}