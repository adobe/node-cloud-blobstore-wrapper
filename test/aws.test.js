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

const aws = require('../lib/aws.js').ContainerAws;


describe("AWS Test", function () {

    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceObject = "documents/txt/00_README.txt";
    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const sourceLocalFile = `${__dirname}/resources/00_README.txt`;
    const targetStorageContainerName = "nui-automation";
    const expiry = 300;
    const containerRegion = "us-east-1";
    const cdnUrl = "http://fake.site.com:8080";

    let sourceAssetUrl;
    let sourceStorageContainer;
    let targetObject = "Unit/node-cloudstorage/Results/";
    let targetStorageContainer;
    let s3Object;
    let localFile;
    let regexPresignedPutUrl = [];
    let regexPresignedGetUrl = [];


    /* Create destination S3 object prefix for run */
    let date = new Date();
    date = `${(date.getMonth() + 1)}-${(date.getDate() + 1)}-${date.getHours()}-${date.getMinutes()}`;
    const scriptName = __filename.split(`${__dirname}/`).pop();

    targetObject = `${targetObject}${scriptName}/${date}/`;

    before("Check AWS Credentials", async function () {
        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if (!process.env.AWS_ACCESS_KEY && !process.env.AWS_SECRET_KEY) {

            const credentialFile = process.env.NUI_CREDENTIALS_YAML || path.join(os.homedir(), ".nui/credentials.yaml");
            console.log(`  INFO: AWS_ACCESS_KEY and/or AWS_SECRET_KEY are not set, trying file: ${credentialFile}\n`);

            if (fs.existsSync(credentialFile)) {
                const storageCredentials = yaml.safeLoad(fs.readFileSync(credentialFile, "utf8"));

                process.env.AWS_ACCESS_KEY = storageCredentials.aws.accessKey;
                process.env.AWS_SECRET_KEY = storageCredentials.aws.secretKey;

            } else {
                console.log("No AWS storage credentials found, skipping test");
                this.skip();
            }
        }

        /* Create source storage container object */
        sourceStorageContainer = new aws({
                accessKeyId: process.env.AWS_ACCESS_KEY,
                secretAccessKey: process.env.AWS_SECRET_KEY},
            sourceStorageContainerName,
            {bucketRegion: containerRegion});

        sourceAssetUrl = await sourceStorageContainer.presignGet(sourceObject, 600000);

        /* Create target storage container object */
        targetStorageContainer = new aws({
                accessKeyId: process.env.AWS_ACCESS_KEY,
                secretAccessKey: process.env.AWS_SECRET_KEY},
            targetStorageContainerName,
            {bucketRegion: containerRegion});

        regexPresignedGetUrl = [
            new RegExp(`^https:\\/\\/${sourceStorageContainerName}\\.s3\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
            new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
            new RegExp(`.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/${containerRegion}/s3/aws4_request.*`, "i"),
            new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
            new RegExp(`.*&X-Amz-Expires=${expiry}.*`, "i"),
            new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
            new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
        ];
    });

    beforeEach("Build destinations", function (done) {

        s3Object = `${targetObject}${new Date().getTime()}.txt`;
        localFile = `${__dirname}/resources/${new Date().getTime()}`;

        regexPresignedPutUrl = [
            new RegExp(`^https:\\/\\/${targetStorageContainerName}\\.s3(\\.?[a-z]{2}-[a-z]+?-?[0-9]{1}\\.|\\.)amazonaws\\.com/${s3Object}\\?.*`, "i"),
            new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
            new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
            new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
            new RegExp(`.*&X-Amz-Expires=${expiry}.*`, "i"),
            new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
            new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
        ];
        return done();
    });


    describe("constructor", function () {

        describe("Positive", function () {

            it("Missing optional bucket region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                    sourceStorageContainerName);

                const result = await container.validate();
                assert.strictEqual(result, true, result);
            });

            it("Bucket is an invisible character", async function () {
                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                    sourceStorageContainerName,
                    { bucketRegion: "\n" });

                    const result = await container.validate();
                    assert.strictEqual(result, true, result);
            });
        });
        describe("Negative", function () {

            it("Invisible characters", async function () {

                try {
                    new aws({
                        accessKeyId: "\n",
                        secretAccessKey: process.env.AWS_SECRET_KEY},
                    sourceStorageContainerName);

                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Invisible characters should be caught");
                }

                try {
                    new aws({
                        accessKeyId: process.env.AWS_ACCESS_KEY,
                        secretAccessKey: "\t"},
                        sourceStorageContainerName);

                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Invisible characters should be caught");
                }

                try {
                    new aws({
                        accessKeyId: process.env.AWS_ACCESS_KEY,
                        secretAccessKey: process.env.AWS_SECRET_KEY},
                        "\r");

                } catch (error) {
                    assert.strictEqual(error, "S3 bucket name was not provided", "Invisible characters should be caught");
                }
            });

            it("No authentication values passed in", function () {
                try{
                    new aws();
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }

                try{
                    new aws({},
                        sourceStorageContainerName,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }
            });

            it("secretAccessKey only", function () {
                try{
                    new aws({secretAccessKey: process.env.AWS_SECRET_KEY},
                        sourceStorageContainerName,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }
            });

            it("accessKeyId only", function () {
                try{
                    new aws({accessKeyId: process.env.AWS_ACCESS_KEY},
                        sourceStorageContainerName,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    expect(error).toEqual("Authentication was not provided");
                }
            });

            it("Missing bucket name", function () {
                try{
                    new aws({
                        accessKeyId: process.env.AWS_ACCESS_KEY,
                        secretAccessKey: process.env.AWS_SECRET_KEY},
                        undefined,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    expect(error).toEqual("S3 bucket name was not provided");
                }
            });
        });
    });

    describe("#presignPut()", function () {

        describe("Positive", function () {

            it("Presigning should be valid", async function () {

                let url = await targetStorageContainer.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));
                for (const regex of regexPresignedPutUrl) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`)
                }

                await targetStorageContainer.uploadFromFile(sourceLocalFile, s3Object);
                const result = await targetStorageContainer.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it("Missing region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                    `${targetStorageContainerName}-frankfurt`);

                let url = await container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${targetStorageContainerName}-frankfurt\\.s3\\.amazonaws\\.com/${s3Object}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`)
                }

                await container.uploadFromFile(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.equal(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it("Fake region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                targetStorageContainerName,
                {region: "fake-region-1"});

                let url = await container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));
                for (const regex of regexPresignedPutUrl) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`)
                }

                await container.uploadFromFile(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.equal(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });
        });
    });

    describe("#presignGet()", function () {

        describe("Positive", function () {

            it("Presigning should be valid", async function () {

                let url = await sourceStorageContainer.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedGetUrl) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                const localDestinationFile = `${localFile}.txt`;
                await sourceStorageContainer.downloadAsset(localDestinationFile, sourceObject);
                const result = await sourceStorageContainer.listObjects(sourceObject);
                const stats = fs.statSync(localDestinationFile);
                assert.equal(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });

            it("Missing region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                `${sourceStorageContainerName}-frankfurt`);

                let url = await container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${sourceStorageContainerName}-frankfurt\\.s3\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                const localDestinationFile = `${localFile}.txt`;
                await container.downloadAsset(localDestinationFile, sourceObject);
                const result = await container.listObjects(sourceObject);
                const stats = fs.statSync(localDestinationFile);
                assert.equal(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });

            it("Fake region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                sourceStorageContainerName,
                {region: "fake-region-1"});

                let url = await container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));
                for (const regex of regexPresignedGetUrl) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                const localDestinationFile = `${localFile}.txt`;
                await container.downloadAsset(localDestinationFile, sourceObject);
                const result = await container.listObjects(sourceObject);
                const stats = fs.statSync(localDestinationFile);
                assert.equal(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });
        });
    });

    describe("#validate()", function () {

        it("Positive", async function () {
            assert.deepStrictEqual(await sourceStorageContainer.validate(), true);
        });

        describe("Negative", function () {

            it("Non existent bucket should result in NoSuchBucket", async function () {

                const badStorageContainer = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                "fakeBucket");

                try{
                    await badStorageContainer.validate();
                } catch (error) {
                    assert.deepStrictEqual(error.code, "NoSuchBucket", `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
                }
            });
        });
    });

    describe("#listObjects()", function () {
        describe("Positive", function () {
            it("Looping without prefix", async function () {

                const result = await sourceStorageContainer.listObjects();
                expect(result.length).toBeGreaterThan(1000);

                expect(result[0].name).toBeDefined();
                expect(result[0].contentLength).toBeDefined();
            });

            it("Looping with prefix", async function () {

                const result = await sourceStorageContainer.listObjects("images");
                expect(result.length).toBeGreaterThan(1000);

                expect(result[0].name).toBeDefined();
                expect(result[0].contentLength).toBeDefined();
            });

            it("No looping with prefix", async function () {

                const result = await sourceStorageContainer.listObjects("images/svg");
                expect(result.length).toBeGreaterThan(0);
                expect(result.length).toBeLessThan(1000);

                expect(result[0].name).toBeDefined();
                expect(result[0].contentLength).toBeDefined();
            });

            it("Prefix does not exist", async function () {

                const result = await sourceStorageContainer.listObjects("fake/path");
                expect(result.length).toEqual(0);
            });
        });
    });

    describe("#getMetadata()", function () {

        it("Positive", async function () {

            const s3ObjectName = "images/jpeg/1.JPG";
            const expectedLength = 24759;

            const metadata = await sourceStorageContainer.getMetadata(s3ObjectName);
            assert.equal(metadata.contentLength, expectedLength, `S3 Object Content Length is ${metadata.contentLength} but should be equal to ${expectedLength}`);
            assert.equal(metadata.name, s3ObjectName, `S3 Object Name is ${metadata.name} but should be equal to ${s3ObjectName}`);
        });

        it("Negative", async function () {

            const s3ObjectName = "fakeS3Object";

            expect(await sourceStorageContainer.getMetadata(s3ObjectName)).toBeUndefined();
        });
    });

    describe("#uploadFromUrl()", function () {

        it("Positive", async function () {

            await targetStorageContainer.uploadFromUrl(sourceAssetUrl, s3Object);
            const result = await targetStorageContainer.listObjects(s3Object);

            expect(result).toBeDefined();
            expect(result[0].name).toEqual(s3Object);
            expect(result[0].contentLength).toBeGreaterThan(0);
        });

        it("Negative", async function () {

            const url = "notAUrl";

            try {
                await targetStorageContainer.uploadFromUrl(url, s3Object);

            } catch (error) {
                expect(error).toBeDefined();
                expect(error).toEqual(`sourceUrl value is not a valid web URL: ${url}`);
            }
        });
    });

    describe("#uploadFromFile()", function () {

        it("Positive", async function () {

            await targetStorageContainer.uploadFromFile(sourceLocalFile, s3Object);
            const result = await targetStorageContainer.listObjects(s3Object);
            assert.equal(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
        });

        it("Negative", async function () {

            const file = "no/such/file.txt";

            try {
                await targetStorageContainer.uploadFromFile(file, s3Object);

            } catch (error) {
                expect(error).toBeDefined;
                expect(error.message).toEqual(`ENOENT: no such file or directory, open '${file}'`);
            }
        });
    });

    describe("#downloadAsset()", function () {

        it("Positive", async function () {

            const localDestinationFile = `${localFile}.txt`;
            await sourceStorageContainer.downloadAsset(localDestinationFile, sourceObject);
            assert.equal(fs.existsSync(localDestinationFile), true, `Local file should exist: ${localDestinationFile}`);

            const result = await sourceStorageContainer.listObjects(sourceObject);
            const stats = fs.statSync(localDestinationFile);
            assert.equal(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

            fs.unlinkSync(localDestinationFile);
        });

        it("Negative", async function () {

            const objectName = "fake.txt";
            const localDestinationFile = `${localFile}.txt`;

            try {
                await sourceStorageContainer.downloadAsset(localDestinationFile, objectName);

            } catch (error) {
                expect(error).toBeDefined();
                expect(error.code).toEqual("NoSuchKey");

                fs.unlinkSync(localDestinationFile);
            }
        });
    });

    describe("CDN insertion", function () {

        describe("Positive", function () {

            it("CDN value present", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                sourceStorageContainerName, {
                    cdnUrl: cdnUrl
                });

                let url = await container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^${cdnUrl}/${sourceObject}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }
            });
        });

        describe("Negative", function () {

            it("CDN is white space", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                sourceStorageContainerName, {
                    cdnUrl: "\n"
                });

                let url = await container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedGetUrl) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }
            });

            it("CDN is not a web URI", async function () {

                const cdnUrl = "fake.string.uri";

                try{
                    new aws({
                        accessKeyId: process.env.AWS_ACCESS_KEY,
                        secretAccessKey: process.env.AWS_SECRET_KEY},
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