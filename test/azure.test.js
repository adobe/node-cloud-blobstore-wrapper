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
/* eslint-env mocha */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const yaml = require('js-yaml');
const assert = require('assert');

const azure = require('../lib/azure.js').ContainerAzure;


describe('Azure Test', function () {

    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceStorageContainerName = "adobe-sample-asset-repository";

    let sourceStorageContainer;

    before("Check Azure Credentials", function (done) {
        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if (!process.env.AZURE_STORAGE_KEY && !process.env.AZURE_STORAGE_ACCOUNT) {

            const credentialFile = process.env.NUI_CREDENTIALS_YAML || path.join(os.homedir(), ".nui/credentials.yaml");
            console.log(`  INFO: AZURE_STORAGE_KEY and/or AZURE_STORAGE_ACCOUNT are not set, trying file: ${credentialFile}\n`);

            if (fs.existsSync(credentialFile)) {

                const storageCredentials = yaml.safeLoad(fs.readFileSync(credentialFile, 'utf8'));
                process.env.AZURE_STORAGE_KEY = storageCredentials.azure.accountKey;
                process.env.AZURE_STORAGE_ACCOUNT = storageCredentials.azure.accountName;
            } else {
                console.log('No Azure storage credentials found, skipping test');
                this.skip();
            }
        }

        /* Create source storage container object */
        sourceStorageContainer = new azure({
                accountKey: process.env.AZURE_STORAGE_KEY,
                accountName: process.env.AZURE_STORAGE_ACCOUNT},
            sourceStorageContainerName);

        return done();
    });

    describe("#getContentLength()", function () {

        it("Positive", async function () {

            const blobName = "images/jpeg/1.JPG";
            const expected = 24759;

            const length = await sourceStorageContainer.getContentLength(blobName);
            assert.equal(length, expected, `Blob Content Length is ${length} but should be equal to ${expected}`);
        });
    });

    describe("#getContentType()", function () {

        it("Positive", async function () {

            const blobName = "images/jpeg/1.JPG";
            const expected = "image/jpeg";

            const mime = await sourceStorageContainer.getContentType(blobName);
            assert.equal(mime, expected, `Blob Content Type is ${mime} but should be equal to ${expected}`);
        });
    });
});