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

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const os = require('os');

const assert = require('chai').assert;

const { CloudStorage } = require('../lib/cloudstorage.js');

describe('Cloudstorage Test', function () {

    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceCloudStorageAsset = "documents/txt/00_README.txt";
    const sourceLocalFile = `${__dirname}/resources/00_README.txt`;

    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const targetStorageContainerName = "nui-automation";

    const awsContainerRegion = "us-east-1";

    const expiry = 300;

    let combinedCredentials;
    let azureSourceStorageContainer;
    let azureTargetStorageContainer;
    let awsSourceStorageContainer;
    let awsTargetStorageContainer;
    let azureSourceAssetUrl;
    let awsSourceAssetUrl;
    let targetCloudStoragePath = "Unit/node-cloudstorage/Results/";
    let targetCloudStorageAsset;
    let localFile;

    /* Create destination blob prefix for run */
    let date = new Date();
    date = `${(date.getMonth() + 1)}-${(date.getDate() + 1)}-${date.getHours()}-${date.getMinutes()}`;
    // const scriptName = __filename.split(`${__dirname}/`).pop();
    const scriptName = path.basename(__filename);

    console.log("QQQQQQQQQQQQQQQQQQQQ")
    console.log("DIR:", __dirname)
    console.log("FILENAME:", __filename)
    console.log("SCRIPTNAME:", scriptName)
    console.log("QQQQQQQQQQQQQQQQQQQQ")
    targetCloudStoragePath = `${targetCloudStoragePath}${scriptName}/${date}/`;

    before("Check Credentials", function () {

        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if ((!process.env.AZURE_STORAGE_KEY && !process.env.AZURE_STORAGE_ACCOUNT) || (!process.env.AWS_ACCESS_KEY && !process.env.AWS_SECRET_KEY)) {

            const credentialFile = process.env.ASSET_COMPUTE_CREDENTIALS_YAML || path.join(os.homedir(), ".adobe-asset-compute/credentials.yaml");
            console.log(`  INFO: Cloud Storage environment variables are not set, trying file: ${credentialFile}\n`);

            if (fs.existsSync(credentialFile)) {
                const storageCredentials = yaml.safeLoad(fs.readFileSync(credentialFile, 'utf8'));

                process.env.AZURE_STORAGE_KEY = process.env.AZURE_STORAGE_KEY || storageCredentials.azure.accountKey;
                process.env.AZURE_STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT || storageCredentials.azure.accountName;
                process.env.AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY || storageCredentials.aws.accessKey;
                process.env.AWS_SECRET_KEY = process.env.AWS_SECRET_KEY || storageCredentials.aws.secretKey;

            } else {
                console.log('No Cloud Storage credentials found, skipping test');
                this.skip();
            }
        }

        combinedCredentials = {
            accountKey: process.env.AZURE_STORAGE_KEY,
            accountName: process.env.AZURE_STORAGE_ACCOUNT,
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_KEY
        };

        azureSourceStorageContainer = new CloudStorage({
            accountKey: process.env.AZURE_STORAGE_KEY,
            accountName: process.env.AZURE_STORAGE_ACCOUNT
        },
        sourceStorageContainerName);

        azureSourceAssetUrl = azureSourceStorageContainer.presignGet(sourceCloudStorageAsset, 600000);

        azureTargetStorageContainer = new CloudStorage({
            accountKey: process.env.AZURE_STORAGE_KEY,
            accountName: process.env.AZURE_STORAGE_ACCOUNT},
        targetStorageContainerName);

        awsSourceStorageContainer = new CloudStorage({
            accessKeyId: combinedCredentials.accessKeyId,
            secretAccessKey: combinedCredentials.secretAccessKey
        },
        sourceStorageContainerName,
        {bucketRegion: awsContainerRegion });

        awsSourceAssetUrl = awsSourceStorageContainer.presignGet(sourceCloudStorageAsset, 600000);

        awsTargetStorageContainer = new CloudStorage({
            accessKeyId: combinedCredentials.accessKeyId,
            secretAccessKey: combinedCredentials.secretAccessKey
        },
        targetStorageContainerName,
        {bucketRegion: awsContainerRegion });
    });

    beforeEach("Build destinations", function (done) {

        targetCloudStorageAsset = `${targetCloudStoragePath}${new Date().getTime()}.txt`;
        localFile = `${__dirname}/resources/${new Date().getTime()}`;
        return done();
    });

    describe("1:1 object methods", function () {

        describe("Create Cloud Storage object", function () {

            describe("Negative", function () {

                it("Providing both Azure and AWS credentials", function () {

                    try {
                        new CloudStorage(
                            combinedCredentials,
                            sourceStorageContainerName);

                    } catch (error) {
                        assert.strictEqual(error, "Only one set of cloud storage credentials are allowed. Both Azure and AWS credentials are currently defined", "Should fail if both Azure and AWS credentials are provided");
                    }
                });
            });
        });

        it("#validate()", async function () {
            assert.strictEqual(await azureSourceStorageContainer.validate(), true);
            assert.strictEqual(await azureSourceStorageContainer.validate(), true);
        });

        it("#listObjects()", async function () {
            const prefix = "images/svg";

            const azureUrlResult = await azureSourceStorageContainer.listObjects(prefix);
            assert.isAtLeast(azureUrlResult.length, 1, `Listing objects in ${prefix} should return at least one object`);
            assert.isAtMost(azureUrlResult.length, 5000, `Listing objects in ${prefix} should not page`);

            assert.isDefined(azureUrlResult[0].name, "Object should contain 'name'");
            assert.isDefined(azureUrlResult[0].contentLength, "Object should contain 'contentLength'");
            assert.isDefined(azureUrlResult[0].contentType, "Object should contain 'contentType'");

            const awsUrlResult = await awsSourceStorageContainer.listObjects(prefix);
            assert.isAtLeast(awsUrlResult.length, 1, `Listing objects in ${prefix} should return at least one object`);
            assert.isAtMost(awsUrlResult.length, 1000, `Listing objects in ${prefix} should not page`);

            assert.isDefined(awsUrlResult[0].name, "Object should contain 'name'");
            assert.isDefined(awsUrlResult[0].contentLength, "Object should contain 'contentLength'");
        });

        it("#presignGet", function () {

            const regexAzurePresignedUrlGet = [
                new RegExp(`^https:\\/\\/${process.env.AZURE_STORAGE_ACCOUNT}\\.blob\\.core\\.windows\\.net/${sourceStorageContainerName}/${sourceCloudStorageAsset}\\?.*`, "i"),
                new RegExp('.*sv=[0-9]{4}-[0-9]{2}-[0-9]{2}.*', "i"),
                new RegExp('.*spr=https.*', "i"),
                new RegExp('.*se=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z.*', "i"),
                new RegExp('.*sr=b.*', "i"),
                new RegExp('.*sp=r.*', "i"),
                new RegExp('.*sig=[0-9a-zA-Z/+]{43}=.*', "i")
            ];

            const regexAwsPresignedUrlGet = [
                new RegExp(`^https:\\/\\/${sourceStorageContainerName}\\.s3\\.amazonaws\\.com/${sourceCloudStorageAsset}\\?.*`, "i"),
                new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                new RegExp(`.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/${awsContainerRegion}/s3/aws4_request.*`, "i"),
                new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
                new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
            ];

            let azureUrl = azureSourceStorageContainer.presignGet(sourceCloudStorageAsset, expiry);
            azureUrl = decodeURIComponent(decodeURI(azureUrl));

            for (const regex of regexAzurePresignedUrlGet) {
                assert.strictEqual(regex.test(azureUrl), true, `Presigned URL should contain ${regex}`);
            }

            let awsUrl = awsSourceStorageContainer.presignGet(sourceCloudStorageAsset, expiry);
            awsUrl = decodeURIComponent(decodeURI(awsUrl));

            for (const regex of regexAwsPresignedUrlGet) {
                assert.strictEqual(regex.test(awsUrl), true, `Presigned URL should contain ${regex}`);
            }
        });

        it.only("#presignPut", function () {

            const regexAzurePresignedUrlPut = [
                new RegExp(`^https:\\/\\/${process.env.AZURE_STORAGE_ACCOUNT}\\.blob\\.core\\.windows\\.net/${targetStorageContainerName}/${targetCloudStorageAsset}\\?.*`, "i"),
                new RegExp('.*sv=[0-9]{4}-[0-9]{2}-[0-9]{2}.*', "i"),
                new RegExp('.*spr=https.*', "i"),
                new RegExp('.*se=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z.*', "i"),
                new RegExp('.*sr=b.*', "i"),
                new RegExp('.*sp=cw.*', "i"),
                new RegExp('.*sig=[0-9a-zA-Z/+]{43}=.*', "i"),
                new RegExp('.*comp=block.*', "i"),
                new RegExp('.*blockid=[a-zA-Z]+.*', "i")
            ];

            const regexAwsPresignedUrlPut = [
                new RegExp(`^https:\\/\\/${targetStorageContainerName}\\.s3(\\.?[a-z]{2}-[a-z]+?-?[0-9]{1}\\.|\\.)amazonaws\\.com/${targetCloudStorageAsset}\\?.*`, "i"),
                new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
                new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
            ];

            let azureUrl = azureTargetStorageContainer.presignPut(targetCloudStorageAsset, expiry);
            azureUrl = decodeURIComponent(decodeURI(azureUrl));

            for (const regex of regexAzurePresignedUrlPut) {
                assert.strictEqual(regex.test(azureUrl), true, `Presigned Azure URL should contain ${regex}`);
            }

            let awsUrl = awsTargetStorageContainer.presignPut(targetCloudStorageAsset, expiry);
            awsUrl = decodeURIComponent(decodeURI(awsUrl));

            for (const regex of regexAwsPresignedUrlPut) {
                assert.strictEqual(regex.test(awsUrl), true, `Presigned AWS URL should contain ${regex}`);
            }
        });

        describe("#upload()", function () {

            it.only("Azure upload from URL", async function () {
                await azureTargetStorageContainer.upload(azureSourceAssetUrl, targetCloudStorageAsset);
                const azureUrlResult = await azureTargetStorageContainer.listObjects(targetCloudStorageAsset);
                assert.ok(azureUrlResult.length > 0);
                assert.strictEqual(azureUrlResult[0].name, targetCloudStorageAsset, `Uploaded asset ${azureUrlResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);

            });

            it("AWS upload from URL", async function () {
                await awsTargetStorageContainer.upload(awsSourceAssetUrl, targetCloudStorageAsset);
                const awsUrlResult = await awsTargetStorageContainer.listObjects(targetCloudStorageAsset);
                assert.ok(awsUrlResult.length > 0);
                assert.strictEqual(awsUrlResult[0].name, targetCloudStorageAsset, `Uploaded asset ${awsUrlResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);

            });

            it.only("Azure upload from local file", async function () {
                await azureTargetStorageContainer.upload(sourceLocalFile, targetCloudStorageAsset);
                const azureLocalResult = await azureTargetStorageContainer.listObjects(targetCloudStorageAsset);
                assert.ok(azureLocalResult.length > 0);
                assert.strictEqual(azureLocalResult[0].name, targetCloudStorageAsset, `Uploaded asset ${azureLocalResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);

            });

            it("AWS upload from local file", async function () {

                await awsTargetStorageContainer.upload(sourceLocalFile, targetCloudStorageAsset);
                const awsLocalResult = await awsTargetStorageContainer.listObjects(targetCloudStorageAsset);
                assert.ok(awsLocalResult.length > 0);
                assert.strictEqual(awsLocalResult[0].name, targetCloudStorageAsset, `Uploaded asset ${awsLocalResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);
            });
        });

        it("#downloadAsset()", async function () {
            const azureLocalDestinationFile = `${localFile}-azure.txt`;
            await azureSourceStorageContainer.downloadAsset(azureLocalDestinationFile, sourceCloudStorageAsset);
            assert.strictEqual(fs.existsSync(azureLocalDestinationFile), true, `Local file should exist: ${azureLocalDestinationFile}`);

            const azureUrlResult = await azureSourceStorageContainer.listObjects(sourceCloudStorageAsset);
            const azureStats = fs.statSync(azureLocalDestinationFile);
            assert.ok(azureUrlResult.length > 0);
            assert.strictEqual(azureUrlResult[0].contentLength, azureStats.size, `Local file size ${azureStats.size} should be ${azureUrlResult[0].contentLength}`);

            fs.unlinkSync(azureLocalDestinationFile);

            const awsLocalDestinationFile = `${localFile}-aws.txt`;
            await awsSourceStorageContainer.downloadAsset(awsLocalDestinationFile, sourceCloudStorageAsset);
            assert.strictEqual(fs.existsSync(awsLocalDestinationFile), true, `Local file should exist: ${awsLocalDestinationFile}`);

            const awsUrlResult = await awsSourceStorageContainer.listObjects(sourceCloudStorageAsset);
            const awsStats = fs.statSync(awsLocalDestinationFile);
            assert.ok(awsUrlResult.length > 0);
            assert.strictEqual(awsUrlResult[0].contentLength, awsStats.size, `Local file size ${awsStats.size} should be ${awsUrlResult[0].contentLength}`);

            fs.unlinkSync(awsLocalDestinationFile);
        });

        it("#getMetadata()", async function () {

            const assetName = "images/jpeg/1.JPG";
            const expectedLength = 24759;
            const expectedContentType = "image/jpeg";

            const azureMetadata = await azureSourceStorageContainer.getMetadata(assetName);
            assert.strictEqual(azureMetadata.contentLength, expectedLength, `Asset Content Length is ${azureMetadata.contentLength} but should be equal to ${expectedLength}`);
            assert.strictEqual(azureMetadata.contentType, expectedContentType, `Asset Mime Type is ${azureMetadata.contentType} but should be equal to ${expectedContentType}`);
            assert.strictEqual(azureMetadata.name, assetName, `Asset Name is ${azureMetadata.name} but should be equal to ${assetName}`);

            const awsMetadata = await awsSourceStorageContainer.getMetadata(assetName);
            assert.strictEqual(awsMetadata.contentLength, expectedLength, `Asset Content Length is ${awsMetadata.contentLength} but should be equal to ${expectedLength}`);
            assert.strictEqual(awsMetadata.name, assetName, `Asset Name is ${awsMetadata.name} but should be equal to ${assetName}`);
        });


    });
});
