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

const aws = require('../lib/aws.js').ContainerAws;


describe.skip("AWS Test", function () {
    const DELIVERY_TIMEOUT = 30000; // max time to wait for test
    this.timeout(DELIVERY_TIMEOUT); // Timeout length

    const sourceObject = "documents/txt/00_README.txt";
    const sourceStorageContainerName = "adobe-sample-asset-repository";
    const sourceLocalFile = `${__dirname}/resources/00_README.txt`;
    const targetStorageContainerName = "nui-automation";
    const expiry = 1000;
    const containerRegion = "us-east-1";
    const cdnUrl = "http://fake.site.com:8080";

    let sourceAssetUrl;
    let sourceStorageContainer;
    let targetObject = "Unit/node-cloudstorage/Results/";
    let targetStorageContainer;
    let s3Object;
    let localFile;
    let regexPresignedUrlPut = [];
    let regexPresignedUrlGet = [];


    /* Create destination S3 object prefix for run */
    let date = new Date();
    date = `${(date.getMonth() + 1)}-${(date.getDate() + 1)}-${date.getHours()}-${date.getMinutes()}`;
    const scriptName = __filename.split(`${__dirname}/`).pop();

    targetObject = `${targetObject}${scriptName}/${date}/`;

    before("Check AWS Credentials", async function () {
        /* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
        if (!process.env.AWS_ACCESS_KEY && !process.env.AWS_SECRET_KEY) {

            const credentialFile = process.env.ASSET_COMPUTE_CREDENTIALS_YAML || path.join(os.homedir(), ".adobe-asset-compute/credentials.yaml");
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

        sourceAssetUrl = sourceStorageContainer.presignGet(sourceObject, 600000);

        /* Create target storage container object */
        targetStorageContainer = new aws({
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_KEY},
        targetStorageContainerName,
        {bucketRegion: containerRegion});

        regexPresignedUrlGet = [
            new RegExp(`^https:\\/\\/${sourceStorageContainerName}\\.s3\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
            new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
            new RegExp(`.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/${containerRegion}/s3/aws4_request.*`, "i"),
            new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
            new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
            new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
            new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
        ];
    });

    beforeEach("Build destinations", function (done) {

        s3Object = `${targetObject}${new Date().getTime()}.txt`;
        localFile = `${__dirname}/resources/${new Date().getTime()}`;

        regexPresignedUrlPut = [
            new RegExp(`^https:\\/\\/${targetStorageContainerName}\\.s3(\\.?[a-z]{2}-[a-z]+?-?[0-9]{1}\\.|\\.)amazonaws\\.com/${s3Object}\\?.*`, "i"),
            new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
            new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
            new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
            new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
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

            it("West Coast Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                sourceStorageContainerName,
                { bucketRegion: "us-west-1" });

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
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }

                try{
                    new aws({},
                        sourceStorageContainerName,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }
            });

            it("secretAccessKey only", function () {
                try{
                    new aws({secretAccessKey: process.env.AWS_SECRET_KEY},
                        sourceStorageContainerName,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
                }
            });

            it("accessKeyId only", function () {
                try{
                    new aws({accessKeyId: process.env.AWS_ACCESS_KEY},
                        sourceStorageContainerName,
                        {bucketRegion: containerRegion});
                } catch (error) {
                    assert.strictEqual(error, "Authentication was not provided", "Should fail if credentials are not provided");
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
                    assert.strictEqual(error, "S3 bucket name was not provided", "Should fail if AWS S3 bucket was not defined");
                }
            });
        });
    });

    describe("#presignPut()", function () {

        describe("Positive", function () {

            it("Presigning should be valid", async function () {

                let url = targetStorageContainer.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));
                for (const regex of regexPresignedUrlPut) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                await targetStorageContainer.upload(sourceLocalFile, s3Object);
                const result = await targetStorageContainer.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it.only("Missing region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                `${targetStorageContainerName}-frankfurt`);

                let url = container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${targetStorageContainerName}-frankfurt\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${s3Object}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                await container.upload(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it("EU Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                targetStorageContainerName,
                { bucketRegion: "eu-central-1" });

                let url = container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${targetStorageContainerName}\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${s3Object}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                await container.upload(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it.only("East Coast Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                targetStorageContainerName,
                { bucketRegion: "us-east-1" });

                let url = container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${targetStorageContainerName}\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${s3Object}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                await container.upload(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it("West Coast Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                targetStorageContainerName,
                { bucketRegion: "us-west-1" });

                let url = container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${targetStorageContainerName}\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${s3Object}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
                    new RegExp('.*&X-Amz-Signature=[a-f0-9]+.*', "i"),
                    new RegExp('.*&X-Amz-SignedHeaders=host.*', "i")
                ];
                for (const regex of regexDifferentRegion) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                await container.upload(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });

            it.only("Fake region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                targetStorageContainerName,
                {region: "fake-region-1"});

                let url = container.presignPut(s3Object, expiry);
                url = decodeURIComponent(decodeURI(url));
                for (const regex of regexPresignedUrlPut) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                await container.upload(sourceLocalFile, s3Object);
                const result = await container.listObjects(s3Object);
                assert.strictEqual(result[0].name, s3Object, `Uploaded S3 Object ${result[0].name} should exist in destination: ${s3Object}`);
            });
        });
    });

    describe("#presignGet()", function () {

        describe("Positive", function () {

            it.only("Presigning should be valid", async function () {

                let url = sourceStorageContainer.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                for (const regex of regexPresignedUrlGet) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                const localDestinationFile = `${localFile}.txt`;
                await sourceStorageContainer.downloadAsset(localDestinationFile, sourceObject);
                const result = await sourceStorageContainer.listObjects(sourceObject);
                const stats = fs.statSync(localDestinationFile);
                assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });

            it("Missing region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                `${sourceStorageContainerName}-frankfurt`);

                let url = container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${sourceStorageContainerName}-frankfurt\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
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
                assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });

            it("East Coast Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                sourceStorageContainerName,
                { bucketRegion: "us-east-1" });

                let url = container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${sourceStorageContainerName}\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
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
                assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });

            it.only("West Coast Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                sourceStorageContainerName,
                { bucketRegion: "us-west-1" });

                let url = await container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${sourceStorageContainerName}\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
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
                assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });

            it.only("EU Region", async function () {

                const container = new aws({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_KEY},
                `${sourceStorageContainerName}-frankfurt`,
                { bucketRegion: "eu-central-1" });

                let url = container.presignGet(sourceObject, expiry);
                url = decodeURIComponent(decodeURI(url));

                const regexDifferentRegion = [
                    new RegExp(`^https:\\/\\/${sourceStorageContainerName}-frankfurt\\.s3(\\.[a-z]{2}-[a-z]+?-?[0-9]{1})?\\.amazonaws\\.com/${sourceObject}\\?.*`, "i"),
                    new RegExp('.*X-Amz-Algorithm=AWS4-HMAC-SHA256.*', "i"),
                    new RegExp('.*&X-Amz-Credential=[A-Z0-9]{20}/[0-9]{8}/[a-z]{2}-[a-z]+?-?[0-9]{1}/s3/aws4_request.*', "i"),
                    new RegExp('.*&X-Amz-Date=[0-9]{8}T[0-9]{6}Z.*', "i"),
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
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
                assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

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
                for (const regex of regexPresignedUrlGet) {
                    assert.strictEqual(regex.test(url), true, `Presigned URL should contain ${regex}`);
                }

                const localDestinationFile = `${localFile}.txt`;
                await container.downloadAsset(localDestinationFile, sourceObject);
                const result = await container.listObjects(sourceObject);
                const stats = fs.statSync(localDestinationFile);
                assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

                fs.unlinkSync(localDestinationFile);
            });
        });
    });

    describe("#validate()", function () {

        it("Positive", async function () {
            assert.strictEqual(await sourceStorageContainer.validate(), true);
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
                    assert.strictEqual(error.code, "NoSuchBucket", `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
                }
            });
        });
    });

    describe("#listObjects()", function () {
        describe("Positive", function () {
            it("Looping without prefix", async function () {

                const result = await sourceStorageContainer.listObjects();
                assert.isAbove(result.length, 1000, "Listing objects should page after 1000 objects");

                assert.isDefined(result[0].name, "Object should contain 'name'");
                assert.isDefined(result[0].contentLength, "Object should contain 'contentLength'");
            });

            it("Looping with prefix", async function () {

                const result = await sourceStorageContainer.listObjects("images");
                assert.isAbove(result.length, 1000, "Listing objects should page after 1000 objects");

                assert.isDefined(result[0].name, "Object should contain 'name'");
                assert.isDefined(result[0].contentLength, "Object should contain 'contentLength'");
            });

            it("No looping with prefix", async function () {

                const prefix = "images/svg";
                const result = await sourceStorageContainer.listObjects(prefix);
                assert.isAtLeast(result.length, 1, `Listing objects in ${prefix} should return at least one object`);
                assert.isAtMost(result.length, 1000, `Listing objects in ${prefix} should not page`);

                assert.isDefined(result[0].name, "Object should contain 'name'");
                assert.isDefined(result[0].contentLength, "Object should contain 'contentLength'");
            });

            it("Prefix does not exist", async function () {

                const prefix = "fake/path";
                const result = await sourceStorageContainer.listObjects(prefix);
                assert.strictEqual(result.length, 0, `Listing objects from ${prefix} should not return any objects`);
            });
        });
    });

    describe("#getMetadata()", function () {

        it("Positive", async function () {

            const s3ObjectName = "images/jpeg/1.JPG";
            const expectedLength = 24759;

            const metadata = await sourceStorageContainer.getMetadata(s3ObjectName);
            assert.strictEqual(metadata.contentLength, expectedLength, `S3 Object Content Length is ${metadata.contentLength} but should be equal to ${expectedLength}`);
            assert.strictEqual(metadata.name, s3ObjectName, `S3 Object Name is ${metadata.name} but should be equal to ${s3ObjectName}`);
        });

        it("Negative", async function () {

            const s3ObjectName = "fakeS3Object";
            assert.strictEqual(await sourceStorageContainer.getMetadata(s3ObjectName), undefined, "Non existent object should return no metadata");
        });
    });

    describe("#downloadAsset()", function () {

        it("Positive", async function () {

            const localDestinationFile = `${localFile}.txt`;
            await sourceStorageContainer.downloadAsset(localDestinationFile, sourceObject);
            assert.strictEqual(fs.existsSync(localDestinationFile), true, `Local file should exist: ${localDestinationFile}`);

            const result = await sourceStorageContainer.listObjects(sourceObject);
            const stats = fs.statSync(localDestinationFile);
            assert.strictEqual(result[0].contentLength, stats.size, `Local file size ${stats.size} should be ${result[0].contentLength}`);

            fs.unlinkSync(localDestinationFile);
        });

        it("Negative", async function () {

            const objectName = "fake.txt";
            const localDestinationFile = `${localFile}.txt`;

            try {
                await sourceStorageContainer.downloadAsset(localDestinationFile, objectName);

            } catch (error) {
                assert.isDefined(error, "Error should be thrown");
                assert.strictEqual(error.code, "NoSuchKey", "Error code should be present");

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
                    new RegExp(`.*&X-Amz-Expires=${expiry/1000}.*`, "i"),
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

                for (const regex of regexPresignedUrlGet) {
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
                    assert.strictEqual(error, `CDN URL is not valid, it may be missing protocol: ${cdnUrl}`, `Some other error may have occurred : ${JSON.stringify(error, null, 4)}`);
                }
            });
        });
    });

    describe("#upload()", function () {

        describe("Positive", function () {

            it("Upload from local file", async function () {

                await targetStorageContainer.upload(sourceLocalFile, s3Object);
                const result = await targetStorageContainer.listObjects(s3Object);

                assert.isDefined(result, "Result should be defined");
                assert.strictEqual(result.length, 1, "Result should contain an object");
                assert.isAtLeast(Object.keys(result[0]).length, 2, "Object should have 2 or more elements");
                assert.strictEqual(result[0].name, s3Object, "Uploaded asset key name should match the passed in key name");
                assert.isAbove(result[0].contentLength, 0, "Content Length value should be greater than 0");
            });

            it("Upload from URL", async function () {

                await targetStorageContainer.upload(sourceAssetUrl, s3Object);
                const result = await targetStorageContainer.listObjects(s3Object);

                assert.isDefined(result, "Result should be defined");
                assert.strictEqual(result.length, 1, "Result should contain an object");
                assert.isAtLeast(Object.keys(result[0]).length, 2, "Object should have 2 or more elements");
                assert.strictEqual(result[0].name, s3Object, "Uploaded asset key name should match the passed in key name");
                assert.isAbove(result[0].contentLength, 0, "Content Length value should be greater than 0");
            });

            it("Force Multipart with a 500MB+ asset", async function () {
                this.timeout(3000000);
                const sourceObjectLarge = "images/psd/Sunflower-text-500MB.psd";
                s3Object = s3Object.replace("txt", "psd");

                const sourceAssetUrlLarge = await sourceStorageContainer.presignGet(sourceObjectLarge, 100000);
                await targetStorageContainer.upload(sourceAssetUrlLarge, s3Object);

                const result = await targetStorageContainer.listObjects(s3Object);

                assert.isDefined(result, "Result should be defined");
                assert.strictEqual(result.length, 1, "Result should contain an object");
                assert.isAtLeast(Object.keys(result[0]).length, 2, "Object should have 2 or more elements");
                assert.strictEqual(result[0].name, s3Object, "Uploaded asset key name should match the passed in key name");
                assert.isAtLeast(result[0].contentLength, 500000000, "Content Length value should be greater than 500000000");
            });
        });

        describe("Negative", function () {

            it("Bad URL syntax", async function () {

                const url = "just a string";

                try {
                    await targetStorageContainer.upload(url, s3Object);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });

            it("Missing protocol", async function () {

                const url = "www.google.com";

                try {
                    await targetStorageContainer.upload(url, s3Object);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });

            it("Incorrect protocol", async function () {

                const url = "file://www.google.com";

                try {
                    await targetStorageContainer.upload(url, s3Object);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });

            it("Domain does not exist", async function () {

                const url = "https://fake.domain.com";

                try {
                    await targetStorageContainer.upload(url, s3Object);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ECONNREFUSED");
                    assert.strictEqual(error.message, `request to ${url}/ failed, reason: connect ECONNREFUSED 127.0.0.1:443`, "Error message should match");
                }
            }).timeout(70000);

            it("Local file does not exist", async function () {

                const file = "no/such/file.txt";

                try {
                    await targetStorageContainer.upload(file, s3Object);

                } catch (error) {
                    assert.isDefined(error, "Error should be thrown");
                    assert.strictEqual(error.code, "ENOENT", "Error code should match");
                }
            });
        });
    });
});
