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
            throw "Neither AWS nor Azure credentials were provided";
        }
    }
}

module.exports = {
    CloudStorage
};
