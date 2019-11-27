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

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const os = require('os');
const validUrl = require('valid-url');

const expect = require('expect');
const assert = require('assert');

const { CloudStorage } = require('../lib/cloudstorage.js');

describe('Cloudstorage Test', function () {

    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceCloudStorageAsset = "documents/txt/00_README.txt";
    const sourceLocalFile = `${__dirname}/resources/00_README.txt`;

    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const targetStorageContainerName = "nui-automation";

    const awsContainerRegion = "us-east-1";

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
    const scriptName = __filename.split(`${__dirname}/`).pop();

    targetCloudStoragePath = `${targetCloudStoragePath}${scriptName}/${date}/`;

    before("Check Credentials", function () {

        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if ((!process.env.AZURE_STORAGE_KEY && !process.env.AZURE_STORAGE_ACCOUNT) || (!process.env.AWS_ACCESS_KEY && !process.env.AWS_SECRET_KEY)) {

            const credentialFile = process.env.NUI_CREDENTIALS_YAML || path.join(os.homedir(), ".nui/credentials.yaml");
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
        }

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
        localFile = `${__dirname}/resources/${new Date().getTime()}.txt`;
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
                        expect(error).toEqual("Only one set of cloud storage credentials are allowed, both Azure and AWS credentials are present");
                    }
                });
            });
        });

        it("#validate()", async function () {
            expect(await azureSourceStorageContainer.validate()).toBeTruthy();
            expect(await awsSourceStorageContainer.validate()).toBeTruthy();
        });

        it("#listObjects()", async function () {
            const prefix = "images/svg";

            const azureResult = await azureSourceStorageContainer.listObjects(prefix);
            expect(azureResult.length).toBeGreaterThan(0);
            expect(azureResult.length).toBeLessThan(1000);
            expect(azureResult[0].name).toBeDefined();
            expect(azureResult[0].contentLength).toBeDefined();
            expect(azureResult[0].contentType).toBeDefined();

            const awsResult = await awsSourceStorageContainer.listObjects(prefix);
            expect(awsResult.length).toBeGreaterThan(0);
            expect(awsResult.length).toBeLessThan(1000);
            expect(awsResult[0].name).toBeDefined();
            expect(awsResult[0].contentLength).toBeDefined();
        });

        it("#presignGet", function () {
            const source = "documents/txt/00_README.txt";
            const expirery = 300;

            const azureUrl = azureSourceStorageContainer.presignGet(source, expirery);
            expect(validUrl.isWebUri(azureUrl)).toBeDefined;

            const awsUrl = awsSourceStorageContainer.presignGet(source, expirery);
            expect(validUrl.isWebUri(awsUrl)).toBeDefined;
        });

        it("#presignPut", function () {
            const source = "documents/txt/00_README.txt";
            const expirery = 300;

            const azureUrl = azureSourceStorageContainer.presignPut(source, expirery);
            expect(validUrl.isWebUri(azureUrl)).toBeDefined;

            const awsUrl = awsSourceStorageContainer.presignPut(source, expirery);
            expect(validUrl.isWebUri(awsUrl)).toBeDefined;
        });

        it("#uploadFromUrl()", async function () {
            targetCloudStorageAsset = `${targetCloudStorageAsset}.txt`;

            await azureTargetStorageContainer.uploadFromUrl(azureSourceAssetUrl, targetCloudStorageAsset);
            const azureResult = await azureTargetStorageContainer.listObjects(targetCloudStorageAsset);
            assert.equal(azureResult[0].name, targetCloudStorageAsset, `Uploaded asset ${azureResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);

            await awsTargetStorageContainer.uploadFromUrl(awsSourceAssetUrl, targetCloudStorageAsset);
            const awsResult = await awsTargetStorageContainer.listObjects(targetCloudStorageAsset);
            assert.equal(awsResult[0].name, targetCloudStorageAsset, `Uploaded asset ${awsResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);
        });

        it("#uploadFromFile()", async function () {

            await azureTargetStorageContainer.uploadFromFile(sourceLocalFile, targetCloudStorageAsset);
            const azureResult = await azureTargetStorageContainer.listObjects(targetCloudStorageAsset);
            assert.equal(azureResult[0].name, targetCloudStorageAsset, `Uploaded asset ${azureResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);

            await awsTargetStorageContainer.uploadFromFile(sourceLocalFile, targetCloudStorageAsset);
            const awsResult = await awsTargetStorageContainer.listObjects(targetCloudStorageAsset);
            assert.equal(awsResult[0].name, targetCloudStorageAsset, `Uploaded asset ${awsResult[0].name} should exist in destination: ${targetCloudStorageAsset}`);
        });

        it("#downloadAsset()", async function () {
            const azureLocalDestinationFile = `${localFile}-azure.txt`;
            await azureSourceStorageContainer.downloadAsset(azureLocalDestinationFile, sourceCloudStorageAsset);
            assert.equal(fs.existsSync(azureLocalDestinationFile), true, `Local file should exist: ${azureLocalDestinationFile}`);

            const azureResult = await azureSourceStorageContainer.listObjects(sourceCloudStorageAsset);
            const azureStats = fs.statSync(azureLocalDestinationFile);
            assert.equal(azureResult[0].contentLength, azureStats.size, `Local file size ${azureStats.size} should be ${azureResult[0].contentLength}`);

            fs.unlinkSync(azureLocalDestinationFile);

            const awsLocalDestinationFile = `${localFile}-aws.txt`;
            await awsSourceStorageContainer.downloadAsset(awsLocalDestinationFile, sourceCloudStorageAsset);
            assert.equal(fs.existsSync(awsLocalDestinationFile), true, `Local file should exist: ${awsLocalDestinationFile}`);

            const awsResult = await awsSourceStorageContainer.listObjects(sourceCloudStorageAsset);
            const awsStats = fs.statSync(awsLocalDestinationFile);
            assert.equal(awsResult[0].contentLength, awsStats.size, `Local file size ${awsStats.size} should be ${awsResult[0].contentLength}`);

            fs.unlinkSync(awsLocalDestinationFile);
        })

        it("#getMetadata()", async function () {

            const assetName = "images/jpeg/1.JPG";
            const expectedLength = 24759;
            const expectedContentType = "image/jpeg";

            const azureMetadata = await azureSourceStorageContainer.getMetadata(assetName);
            assert.equal(azureMetadata.contentLength, expectedLength, `Asset Content Length is ${azureMetadata.contentLength} but should be equal to ${expectedLength}`);
            assert.equal(azureMetadata.contentType, expectedContentType, `Asset Mime Type is ${azureMetadata.contentType} but should be equal to ${expectedContentType}`);
            assert.equal(azureMetadata.name, assetName, `Asset Name is ${azureMetadata.name} but should be equal to ${assetName}`);

            const awsMetadata = await awsSourceStorageContainer.getMetadata(assetName);
            assert.equal(awsMetadata.contentLength, expectedLength, `Asset Content Length is ${awsMetadata.contentLength} but should be equal to ${expectedLength}`);
            assert.equal(awsMetadata.name, assetName, `Asset Name is ${awsMetadata.name} but should be equal to ${assetName}`);
        });


    });
});