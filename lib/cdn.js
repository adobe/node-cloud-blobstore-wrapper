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

const _string = require('underscore.string');
const validUrl = require('valid-url');

class CDN {

    static getAzureUri(options, accountName) {

        let result = false;

        result = this._verify(options);

        if(result === false) {
            result = `https://${accountName}.blob.core.windows.net`
        }

        return result;
    }

    static getAwsUri(options, bucketName) {

        let result = false;

        result = this._verify(options);

        if(result === false) {
            result = `https://${bucketName}.s3.amazonaws.com`;
        }

        return result;
    }

    static _verify(options) {

        if (options.cdnUrl && !_string.isBlank(options.cdnUrl)) {

            if (!validUrl.isWebUri(options.cdnUrl)) {
                throw `CDN URL is not valid, it may be missing protocol: ${options.cdnUrl}`;
            }
            return options.cdnUrl.trim();
        } else {
            return false;
        }
    }
}

module.exports = {
    CDN
}