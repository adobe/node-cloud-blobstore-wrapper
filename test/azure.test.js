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

const path = require('path');
const os = require('os');
const fs = require('fs');

const yaml = require('js-yaml');

const azure = require('../lib/azure.js').ContainerAzure;

/* Cosmetic */
const textRed = "\x1b[31m";
const textGreen = "\x1b[32m";
const textReset = "\x1b[0m";

/* Test URL to copy asset from */
const sourceUrl = "https://adobesampleassetsrepo.blob.core.windows.net/adobe-sample-asset-repository/documents/txt/00_README.txt?sp=r&st=2019-10-16T14:00:00Z&se=2019-10-17T05:00:00Z&spr=https&sv=2018-03-28&sig=AVvnq2cqGad4LVU%2BFarlWqmGZK0Flr8Fcm9%2Fr0Jdpxw%3D&sr=b";
const destinationBlob = "node-cloudstorage-test-results/";
const storageContainerName = "nui-automation";

/* Loads storage credentials from local file or ENV pointing to a YAML file containing cloud storage credentials */
const storageCredentials = loadYaml(process.env.NUI_CREDENTIALS_YAML || path.join(os.homedir(), ".nui/credentials.yaml"));
const storageContainer = new azure(storageCredentials.azure, storageContainerName);

/* Tests to run */
testUploadFromStream();
testValidate();


async function testUploadFromStream() { /* Tests listObjects(), upload() */

    const blob = destinationBlob + new Date().getTime() + ".txt"
    try { /* Should output `PASS` */
        await storageContainer.upload(sourceUrl, blob);

        const result = await storageContainer.listObjects(blob);

        if (result[0].name == blob) {
            console.log(`${textGreen}PASS${textReset}`);
        } else {
            console.error(`${textRed}FAILED Uploading Blob: ${textReset}${blob}`);
        }
    } catch (err) {
        console.error(`${textRed}${err}${textReset}`);
    }
}

async function testValidate() { /* Tests validate() */

    const blob = destinationBlob + new Date().getTime() + ".txt"

    try { /* Should output `PASS` */
        await storageContainer.upload(sourceUrl, blob);
        const result = await storageContainer.validate();

        if (result._response.status == 200) {
            console.log(`${textGreen}PASS${textReset}`);
        } else {
            console.error(`${textRed}FAILED To Get ACL${textReset}`);
        }
    } catch (err) {
        console.error(`${textRed}${err}${textReset}`);
    }
}


/* Utility */
function loadYaml(file) {

    try {
        return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.log(err);
    }
}