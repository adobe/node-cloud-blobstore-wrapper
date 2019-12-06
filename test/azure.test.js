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
const expect = require('expect');

const azure = require('../lib/azure.js').ContainerAzure;


describe("Azure Test", function () {

    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceBlob = "documents/txt/00_README.txt";
    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const sourceLocalFile = `${__dirname}/resources/00_README.txt`;
    const targetStorageContainerName = "nui-automation";
    const expiry = 300;
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
    const scriptName = __filename.split(`${__dirname}/`).pop();

    targetBlob = `${targetBlob}${scriptName}/${date}/`;

    before("Check Azure Credentials", function (done) {
        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if (!process.env.AZURE_STORAGE_KEY && !process.env.AZURE_STORAGE_ACCOUNT) {

            const credentialFile = process.env.NUI_CREDENTIALS_YAML || path.join(os.homedir(), ".nui/credentials.yaml");
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
                    expect(error).toEqual("Authentication was not provided");
                }

                try{
                    new azure({});
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }
            });

            it("accountKey only", function () {
                try{
                    new azure({accountKey: process.env.AZURE_STORAGE_KEY});
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }
            });

            it("accountName only", function () {
                try{
                    new azure({accountName: process.env.AZURE_STORAGE_ACCOUNT});
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }
            });

            it("Missing container name", function () {
                try{
                    new azure({
                        accountName: process.env.AZURE_STORAGE_ACCOUNT,
                        accountKey: process.env.AZURE_STORAGE_KEY});
                } catch (error) {
                    expect(error).toEqual("Azure container name was not provided");
                }
            });
        });
    });

    describe("#presignPut()", function () {

        describe("Positive", function () {

            it("See if URL syntax is correct", async function () {

                let url = await targetStorageContainer.presignPut(targetBlob, expiry);
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

                let url = await sourceStorageContainer.presignGet(sourceBlob, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedUrlGet) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`)
                }
            });
        });
    });

    describe("#uploadFromUrl()", function () {

        it("Positive", async function () {

            await targetStorageContainer.uploadFromUrl(sourceAssetUrl, blob);
            const result = await targetStorageContainer.listObjects(blob);
            assert.equal(result[0].name, blob, `Uploaded blob ${result[0].name} should exist in destination: ${blob}`);
        });

        it("Negative", async function () {

            const url = "notAUrl";

            try {
                await targetStorageContainer.uploadFromUrl(url, blob);

            } catch (error) {
                expect(error).toBeDefined;
                expect(error).toEqual(`sourceUrl value is not a valid web URL: ${url}`);
            }
        });
    });

    describe("#uploadFromFile()", function () {

        it("Positive", async function () {

            await targetStorageContainer.uploadFromFile(sourceLocalFile, blob);
            const result = await targetStorageContainer.listObjects(blob);
            assert.equal(result[0].name, blob, `Uploaded blob ${result[0].name} should exist in destination: ${blob}`);
        });

        it("Negative", async function () {

            const file = "no/such/file.txt";

            try {
                await targetStorageContainer.uploadFromFile(file, blob);

            } catch (error) {
                expect(error).toBeDefined();
                expect(error.code).toEqual("ENOENT");
            }
        });
    });

    describe("#downloadAsset()", function () {

        it("Positive", async function () {

            const localDestinationFile = `${localFile}.txt`;
            await sourceStorageContainer.downloadAsset(localDestinationFile, sourceBlob);
            assert.equal(fs.existsSync(localDestinationFile), true, `Local file should exist: ${localDestinationFile}`);

            const result = await sourceStorageContainer.listObjects(sourceBlob);
            const stats = fs.statSync(localDestinationFile);
            assert.equal(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

            fs.unlinkSync(localDestinationFile);
        });

        it("Negative", async function () {

            const blobName = "fake.txt";
            const localDestinationFile = `${localFile}.txt`;

            try {
                await sourceStorageContainer.downloadAsset(localDestinationFile, blobName);

            } catch (error) {
                expect(error).toBeDefined();
                expect(error.statusCode).toEqual(404);
            }
        });
    });

    describe("#validate()", function () {

        it("Positive", async function () {
            assert.deepStrictEqual(await targetStorageContainer.validate(), true);
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
                    assert.deepStrictEqual(error.body.Code, "InvalidResourceName", `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
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
            assert.equal(metadata.contentLength, expectedLength, `Blob Content Length is ${metadata.contentLength} but should be equal to ${expectedLength}`);
            assert.equal(metadata.contentType, expectedContentType, `Blob Mime Type is ${metadata.contentType} but should be equal to ${expectedContentType}`);
            assert.equal(metadata.name, blobName, `Blob Name is ${metadata.name} but should be equal to ${blobName}`);
        });

        it("Negative", async function () {

            const blobName = "fakeBlob";

            expect(await sourceStorageContainer.getMetadata(blobName)).toBeUndefined();
        });
    });

    describe("#listObjects()", function () {
        describe("Positive", function () {
            it("Looping without prefix", async function () {

                const result = await sourceStorageContainer.listObjects();
                expect(result.length).toBeGreaterThan(5000);

                expect(result[0].name).toBeDefined();
                expect(result[0].contentLength).toBeDefined();
                expect(result[0].contentType).toBeDefined();
            });

            it("Looping with prefix", async function () {

                const result = await sourceStorageContainer.listObjects("images");
                expect(result.length).toBeGreaterThan(5000);

                expect(result[0].name).toBeDefined();
                expect(result[0].contentLength).toBeDefined();
                expect(result[0].contentType).toBeDefined();
            });

            it("No looping with prefix", async function () {

                const result = await sourceStorageContainer.listObjects("images/svg");
                expect(result.length).toBeGreaterThan(0);
                expect(result.length).toBeLessThan(5000);

                expect(result[0].name).toBeDefined();
                expect(result[0].contentLength).toBeDefined();
                expect(result[0].contentType).toBeDefined();
            });

            it("Prefix does not exist", async function () {

                const result = await sourceStorageContainer.listObjects("fake/path");
                expect(result.length).toEqual(0);
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

                let url = await container.presignGet(sourceBlob, expiry);
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

                let url = await container.presignGet(sourceBlob, expiry);
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
                    assert.deepStrictEqual(error, `CDN URL is not valid, it may be missing protocol: ${cdnUrl}`, `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
                }
            });
        });
    });
});
