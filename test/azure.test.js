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

    const sourceBlob = "documents/txt/00_README.txt";
    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const sourceLocalFile = `${__dirname}/resources/test.csv`;
    const targetStorageContainerName = "nui-automation";

    let sourceAssetUrl;
    let sourceStorageContainer;
    let targetBlob = "nui-repo-unit-tests/results/node-cloudstorage/";
    let targetStorageContainer;
    let blob;
    let localFile;

    /* Create destination blob prefix for run */
    let date = new Date();
    date = `${(date.getMonth() + 1)}-${(date.getDate() + 1)}-${date.getHours()}-${date.getMinutes()}`;
    const scriptName = __filename.split(`${__dirname}/`).pop();

    targetBlob = `${targetBlob}${scriptName}/${date}/`;

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
                this.skip();
            }
        }

        /* Create source storage container object */
        sourceStorageContainer = new azure({
                accountKey: process.env.AZURE_STORAGE_KEY,
                accountName: process.env.AZURE_STORAGE_ACCOUNT},
            sourceStorageContainerName);

        sourceAssetUrl = sourceStorageContainer.presignGet(sourceBlob, 600000);

        /* Create target storage container object */
        targetStorageContainer = new azure({
                accountKey: process.env.AZURE_STORAGE_KEY,
                accountName: process.env.AZURE_STORAGE_ACCOUNT},
            targetStorageContainerName);

        return done();
    });

    beforeEach("Build destinations", function (done) {

        blob = `${targetBlob}${new Date().getTime()}`;
        localFile = `${__dirname}/resources/${new Date().getTime()}`;
        return done();
    });

    describe("#uploadFromUrl()", function () {

        it("Positive", async function () {

            blob = `${blob}.txt`;
            await targetStorageContainer.uploadFromUrl(sourceAssetUrl, blob);
            const result = await targetStorageContainer.listObjects(blob);
            assert.equal(result[0].name, blob, `Uploaded blob ${result[0].name} should exist in destination: ${blob}`);
        });
    });

    describe("#uploadFromFile()", function () {

        it("Positive", async function () {

            blob = `${blob}.csv`;
            await targetStorageContainer.uploadFromFile(sourceLocalFile, blob);
            const result = await targetStorageContainer.listObjects(blob);
            assert.equal(result[0].name, blob, `Uploaded blob ${result[0].name} should exist in destination: ${blob}`);
        });
    });

    describe("#downloadBlob()", function () {

        it("Positive", async function () {

            const localDestinationFile = `${localFile}.txt`;
            await sourceStorageContainer.downloadBlob(localDestinationFile, sourceBlob);
            assert.equal(fs.existsSync(localDestinationFile), true, `Local file should exist: ${localDestinationFile}`);

            const result = await sourceStorageContainer.listObjects(sourceBlob);
            const stats = fs.statSync(localDestinationFile);
            assert.equal(result[0].contentLength, stats.size, `Local file size ${stats.size} should match blob ${result[0].contentLength}`);

            fs.unlinkSync(localDestinationFile);
        });
    });

    describe("#validate()", function () {

        it("Positive", async function () {

            const result = await targetStorageContainer.validate();
            assert.equal(result._response.status, 200, `HTTP status should be 200: Received ${result._response.status}`);
        });
    });
});