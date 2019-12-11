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

class CloudStorage {
    /**
     * Either all AWS or all Azure properties must be provided
     * @typedef {Object} Auth
     * @property {String} [accountName=] - Azure account name
     * @property {String} [accountKey=] - Azure account key
     * @property {String} [accessKeyId=] - AWS access key
     * @property {String} [secretAccessKey=] - AWS secret key
     */
    /**
     * @typedef {Object} ContainerOptions
     * @property {String} [cdnUrl=] Overrides the protocol and host of presigned GET/PUT urls, e.g. https://cdnhost
     * @property {String} [bucketRegion=] - AWS S3 bucket region - required if using AWS
     */
    /**
     * Returns the correct cloud storage object
     * @param {Auth} auth
     * @param {String} - Either AWS bucket name or Azure container name
     * @param {ContainerOptions} options
     */
    constructor(auth, containerName, options) {

        if (auth.accountName && auth.accountKey && auth.accessKeyId && auth.secretAccessKey) {
            throw "Only one set of cloud storage credentials are allowed. Both Azure and AWS credentials are currently defined";
        }
        /* Azure Container */
        if (auth.accountName && auth.accountKey) {

            const { ContainerAzure } = require('./azure.js');
            return Object.create(new ContainerAzure(auth, containerName, options));

        /* AWS Container */
        } else if (auth.accessKeyId && auth.secretAccessKey) {

            const { ContainerAws } = require('./aws.js');
            return Object.create(new ContainerAws(auth, containerName, options));

        } else {
            throw "AWS nor Azure credentials were provided";
        }
    }
}

module.exports = {
    CloudStorage
}