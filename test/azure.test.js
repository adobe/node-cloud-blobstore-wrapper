/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const yaml = require('js-yaml');
const assert = require('chai').assert;

const azure = require('../lib/azure.js').ContainerAzure;


describe("Azure Test", function () {

    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceBlob = "documents/txt/00_README.txt";
    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const sourceLocalFile = `${__dirname}/resources/00_README.txt`;
    const targetStorageContainerName = "nui-automation";
    const expiry = 1000;
    const cdnUrl = "http://fake.site.com:8080";

    let sourceAssetUrl;
    let sourceStorageContainer;
    let targetBlob = "Unit/node-cloudstorage/Results/";
    let targetStorageContainer;
    let blob;
    let localFile;
    let regexPresignedUrlPut = [];
    let regexPresignedUrlGet = [];


    /* Create destination blob prefix for run */
    let date = new Date();
    date = `${(date.getMonth() + 1)}-${(date.getDate() + 1)}-${date.getHours()}-${date.getMinutes()}`;
    const scriptName = path.basename(__filename);

    targetBlob = `${targetBlob}${scriptName}/${date}/`;

    before("Check Azure Credentials", function (done) {
        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if (!process.env.AZURE_STORAGE_KEY && !process.env.AZURE_STORAGE_ACCOUNT) {

            const credentialFile = process.env.ASSET_COMPUTE_CREDENTIALS_YAML || path.join(os.homedir(), ".adobe-asset-compute/credentials.yaml");
            console.log(`  INFO: AZURE_STORAGE_KEY and/or AZURE_STORAGE_ACCOUNT are not set, trying file: ${credentialFile}\n`);

            if (fs.existsSync(credentialFile)) {

                const storageCredentials = yaml.safeLoad(fs.readFileSync(credentialFile, "utf8"));
                process.env.AZURE_STORAGE_KEY = storageCredentials.azure.accountKey;
                process.env.AZURE_STORAGE_ACCOUNT = storageCredentials.azure.accountName;
            } else {
                console.log("No Azure storage credentials found, skipping test");
                this.skip();
            }
        }

        /* Create source storage container object */
        sourceStorageContainer = new azure({
            accountName: process.env.AZURE_STORAGE_ACCOUNT,
            accountKey: process.env.AZURE_STORAGE_KEY},
        sourceStorageContainerName);

        sourceAssetUrl = sourceStorageContainer.presignGet(sourceBlob, 600000);

        /* Create target storage container object */
        targetStorageContainer = new azure({
            accountName: process.env.AZURE_STORAGE_ACCOUNT,
            accountKey: process.env.AZURE_STORAGE_KEY},
        targetStorageContainerName);

        regexPresignedUrlPut = [
            new RegExp(`^https:\\/\\/${process.env.AZURE_STORAGE_ACCOUNT}\\.blob\\.core\\.windows\\.net/${targetStorageContainerName}/${targetBlob}\\?.*`, "i"),
            new RegExp('.*sv=[0-9]{4}-[0-9]{2}-[0-9]{2}.*', "i"),
            new RegExp('.*spr=https.*', "i"),
            new RegExp('.*se=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z.*', "i"),
            new RegExp('.*sr=b.*', "i"),
            new RegExp('.*sp=cw.*', "i"),
            new RegExp('.*sig=[0-9a-zA-Z/+]{43}=.*', "i"),
            new RegExp('.*comp=block.*', "i"),
            new RegExp('.*blockid=[a-zA-Z]+.*', "i")
        ];

        regexPresignedUrlGet = [
            new RegExp(`^https:\\/\\/${process.env.AZURE_STORAGE_ACCOUNT}\\.blob\\.core\\.windows\\.net/${sourceStorageContainerName}/${sourceBlob}\\?.*`, "i"),
            new RegExp('.*sv=[0-9]{4}-[0-9]{2}-[0-9]{2}.*', "i"),
            new RegExp('.*spr=https.*', "i"),
            new RegExp('.*se=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z.*', "i"),
            new RegExp('.*sr=b.*', "i"),
            new RegExp('.*sp=r.*', "i"),
            new RegExp('.*sig=[0-9a-zA-Z/+]{43}=.*', "i")
        ];

        return done();
    });

    beforeEach("Build destinations", function (done) {

        blob = `${targetBlob}${new Date().getTime()}.txt`;
        localFile = `${__dirname}/resources/${new Date().getTime()}`;
        return done();
    });

    describe("constructor", function () {

        describe("Negative)", function () {

            it("Invisible characters", async function () {

                try {
                    new azure({
                        accountName: "\n",
                        accountKey: process.env.AZURE_STORAGE_KEY},
                    sourceStorageContainerName);

                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Invisible characters should be caught");
                }

                try {
                    new azure({
                        accountName: process.env.AZURE_STORAGE_ACCOUNT,
                        accountKey: "\t"},
                    sourceStorageContainerName);

                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Invisible characters should be caught");
                }

                try {
                    new azure({
                        accountName: process.env.AZURE_STORAGE_ACCOUNT,
                        accountKey: process.env.AZURE_STORAGE_KEY},
                    "\r");

                } catch (error) {
                    assert.strictEqual(error, "Azure container name was not provided", "Invisible characters should be caught");
                }
            });

            it("No authentication values passed in", function () {
                try{
                    new azure();
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }

                try{
                    new azure({});
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }
            });

            it("accountKey only", function () {
                try{
                    new azure({accountKey: process.env.AZURE_STORAGE_KEY});
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }
            });

            it("accountName only", function () {
                try{
                    new azure({accountName: process.env.AZURE_STORAGE_ACCOUNT});
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }
            });

            it("Missing container name", function () {
                try{
                    new azure({
                        accountName: process.env.AZURE_STORAGE_ACCOUNT,
                        accountKey: process.env.AZURE_STORAGE_KEY});

                } catch (error) {
                    assert.strictEqual(error, "Azure container name was not provided", "Should fail if Azure container name was not defined");
                }
            });
        });
    });

    describe("#presignPut()", function () {

        describe("Positive", function () {

            it.only("See if URL syntax is correct", async function () {

                let url = targetStorageContainer.presignPut(targetBlob, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedUrlPut) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }
            });
        });
    });

    describe("#presignGet()", function () {

        describe("Positive", function () {

            it("See if URL syntax is correct", async function () {

                let url = sourceStorageContainer.presignGet(sourceBlob, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedUrlGet) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }
            });
        });
    });

    describe("#downloadAsset()", function () {

        it("Positive", async function () {

            const localDestinationFile = `${localFile}.txt`;
            await sourceStorageContainer.downloadAsset(localDestinationFile, sourceBlob);
            assert.strictEqual(fs.existsSync(localDestinationFile), true, `Local file should exist: ${localDestinationFile}`);

            const result = await sourceStorageContainer.listObjects(sourceBlob);
            const stats = fs.statSync(localDestinationFile);
            assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

            fs.unlinkSync(localDestinationFile);
        });

        it("Negative", async function () {

            const blobName = "fake.txt";
            const localDestinationFile = `${localFile}.txt`;

            try {
                await sourceStorageContainer.downloadAsset(localDestinationFile, blobName);

            } catch (error) {
                assert.isDefined(error, "Error should be thrown");
                assert.strictEqual(error.statusCode, 404, "Error code should be present");
            }
        });
    });

    describe("#validate()", function () {

        it("Positive", async function () {
            assert.strictEqual(await targetStorageContainer.validate(), true);
        });

        describe("Negative", function () {

            it("Non existent bucket should result in InvalidResourceName", async function () {

                const container = new azure({
                    accountKey: process.env.AZURE_STORAGE_KEY,
                    accountName: process.env.AZURE_STORAGE_ACCOUNT},
                "fakeBucket");

                try {
                    await container.validate();
                } catch (error) {
                    assert.strictEqual(error.body.Code, "InvalidResourceName", `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
                }
            });
        });
    });

    describe("#getMetadata()", function () {

        it("Positive", async function () {

            const blobName = "images/jpeg/1.JPG";
            const expectedLength = 24759;
            const expectedContentType = "image/jpeg";

            const metadata = await sourceStorageContainer.getMetadata(blobName);
            assert.strictEqual(metadata.contentLength, expectedLength, `Blob Content Length is ${metadata.contentLength} but should be equal to ${expectedLength}`);
            assert.strictEqual(metadata.contentType, expectedContentType, `Blob Mime Type is ${metadata.contentType} but should be equal to ${expectedContentType}`);
            assert.strictEqual(metadata.name, blobName, `Blob Name is ${metadata.name} but should be equal to ${blobName}`);
        });

        it("Negative", async function () {

            const blobName = "fakeBlob";
            assert.strictEqual(await sourceStorageContainer.getMetadata(blobName), undefined, "Non existent object should return no metadata");
        });
    });

    describe("#listObjects()", function () {
        describe("Positive", function () {
            it("Looping without prefix", async function () {

                const result = await sourceStorageContainer.listObjects();
                assert.isAbove(result.length, 5000, "Listing objects should page after 5000 objects");

                assert.isDefined(result[0].name, "Object should contain 'name'");
                assert.isDefined(result[0].contentLength, "Object should contain 'contentLength'");
                assert.isDefined(result[0].contentType, "Object should contain 'contentType'");
            });

            it("Looping with prefix", async function () {

                const result = await sourceStorageContainer.listObjects("images");
                assert.isAbove(result.length, 5000, "Listing objects should page after 5000 objects");

                assert.isDefined(result[0].name, "Object should contain 'name'");
                assert.isDefined(result[0].contentLength, "Object should contain 'contentLength'");
                assert.isDefined(result[0].contentType, "Object should contain 'contentType'");
            });

            it("No looping with prefix", async function () {

                const prefix = "images/svg";
                const result = await sourceStorageContainer.listObjects(prefix);
                assert.isAtLeast(result.length, 1, `Listing objects in ${prefix} should return at least one object`);
                assert.isAtMost(result.length, 5000, `Listing objects in ${prefix} should not page`);

                assert.isDefined(result[0].name, "Object should contain 'name'");
                assert.isDefined(result[0].contentLength, "Object should contain 'contentLength'");
                assert.isDefined(result[0].contentType, "Object should contain 'contentType'");
            });

            it("Prefix does not exist", async function () {

                const prefix = "fake/path";
                const result = await sourceStorageContainer.listObjects(prefix);
                assert.strictEqual(result.length, 0, `Listing objects from ${prefix} should not return any objects`);
            });
        });
    });

    describe("CDN insertion", function () {

        describe("Positive", function () {

            it("CDN value present", async function () {

                const container = new azure({
                    accountName: process.env.AZURE_STORAGE_ACCOUNT,
                    accountKey: process.env.AZURE_STORAGE_KEY},
                sourceStorageContainerName, {
                    cdnUrl: cdnUrl
                });

                let url = container.presignGet(sourceBlob, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^${cdnUrl}/${sourceStorageContainerName}/${sourceBlob}\\?.*`, "i"),
                    new RegExp('.*sv=[0-9]{4}-[0-9]{2}-[0-9]{2}.*', "i"),
                    new RegExp('.*spr=https.*', "i"),
                    new RegExp('.*se=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z.*', "i"),
                    new RegExp('.*sr=b.*', "i"),
                    new RegExp('.*sp=r.*', "i"),
                    new RegExp('.*sig=[0-9a-zA-Z/+]{43}=.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }
            });
        });

        describe("Negative", function () {

            it("CDN is white space", async function () {

                const container = new azure({
                    accountName: process.env.AZURE_STORAGE_ACCOUNT,
                    accountKey: process.env.AZURE_STORAGE_KEY},
                sourceStorageContainerName, {
                    cdnUrl: "\n"
                });

                let url = container.presignGet(sourceBlob, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedUrlGet) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }
            });

            it("CDN is not a web URI", async function () {

                const cdnUrl = "fake.string.uri";

                try{
                    new azure({
                        accountName: process.env.AZURE_STORAGE_ACCOUNT,
                        accountKey: process.env.AZURE_STORAGE_KEY},
                    sourceStorageContainerName, {
                        cdnUrl: cdnUrl
                    });

                } catch (error) {
                    assert.strictEqual(error, `CDN URL is not valid, it may be missing protocol: ${cdnUrl}`, `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
                }
            });
        });
    });

    describe("#upload()", function () {

        describe("Positive", function () {

            it.only("Upload from local file", async function () {

                await targetStorageContainer.upload(sourceLocalFile, blob);
                const result = await targetStorageContainer.listObjects(blob);

                assert.isDefined(result, "Result should be defined");
                assert.strictEqual(result.length, 1, "Result should contain an object");
                assert.isAtLeast(Object.keys(result[0]).length, 2, "Object should have 2 or more elements");
                assert.strictEqual(result[0].name, blob, "Uploaded asset key name should match the passed in key name");
                assert.isAbove(result[0].contentLength, 0, "Content Length value should be greater than 0");
            });

            it.only("Upload from URL", async function () {

                await targetStorageContainer.upload(sourceAssetUrl, blob);
                const result = await targetStorageContainer.listObjects(blob);

                assert.isDefined(result, "Result should be defined");
                assert.strictEqual(result.length, 1, "Result should contain an object");
                assert.isAtLeast(Object.keys(result[0]).length, 2, "Object should have 2 or more elements");
                assert.strictEqual(result[0].name, blob, "Uploaded asset key name should match the passed in key name");
                assert.isAbove(result[0].contentLength, 0, "Content Length value should be greater than 0");
            });

            it.only("Force Multipart with a 500MB+ asset", async function () {
                this.timeout(3000000);
                const sourceObjectLarge = "images/psd/Sunflower-text-500MB.psd";
                blob = blob.replace("txt", "psd");

                const sourceAssetUrlLarge = sourceStorageContainer.presignGet(sourceObjectLarge, 100000);
                await targetStorageContainer.upload(sourceAssetUrlLarge, blob);

                const result = await targetStorageContainer.listObjects(blob);

                assert.isDefined(result, "Result should be defined");
                assert.strictEqual(result.length, 1, "Result should contain an object");
                assert.isAtLeast(Object.keys(result[0]).length, 2, "Object should have 2 or more elements");
                assert.strictEqual(result[0].name, blob, "Uploaded asset key name should match the passed in key name");
                assert.isAtLeast(result[0].contentLength, 500000000, "Content Length value should be greater than 500000000");
            });
        });

        describe("Negative", function () {

            it("Bad URL syntax", async function () {

                const url = "just a string";

                try {
                    await targetStorageContainer.upload(url, blob);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });

            it("Missing protocol", async function () {

                const url = "www.google.com";

                try {
                    await targetStorageContainer.upload(url, blob);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });

            it("Incorrect protocol", async function () {

                const url = "file://www.google.com";

                try {
                    await targetStorageContainer.upload(url, blob);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });

            it("Domain does not exist", async function () {

                const url = "https://fake.domain.com";

                try {
                    await targetStorageContainer.upload(url, blob);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ECONNREFUSED");
                    assert.strictEqual(error.message, `request to ${url}/ failed, reason: connect ECONNREFUSED 127.0.0.1:443`, "Error message should match");
                }
            }).timeout(70000);

            it("Local file does not exist", async function () {

                const file = "no/such/file.txt";

                try {
                    await targetStorageContainer.upload(file, blob);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });
        });
    });
});
