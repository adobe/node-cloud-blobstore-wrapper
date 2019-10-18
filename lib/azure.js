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

const storage = require('@azure/storage-blob');
const request = require('request');
const fs = require('fs');

class ContainerAzure {

    constructor(auth, containerName) {
        this.accountName = auth.accountName;
        this.sharedKeyCredentials = new storage.SharedKeyCredential(
            this.accountName,
            auth.accountKey
        );
        this.containerName = containerName;
    
        const url = `https://${this.accountName}.blob.core.windows.net/${this.containerName}`;
        this.containerURL = new storage.ContainerURL(
            url,
            storage.ContainerURL.newPipeline(this.sharedKeyCredentials, {})
        );
    }

    async validate() {
        return this.containerURL.getAccessPolicy();
    }

    async listObjects(prefix) {
        const result = [];
        let marker = null;
        do {
            const response = await this.containerURL.listBlobFlatSegment(storage.Aborter.none, marker, { prefix });
            for (const blobItem of response.segment.blobItems) {
                result.push({
                    name: blobItem.name,
                    contentLength: blobItem.properties.contentLength,
                    contentType: blobItem.properties.contentType
                });
            }
            marker = response.marker
        } while (marker != null);
        return result;
    }

    presignGet(path, ttl) {
        return this._createSharedAccessSignatureURI(path, ttl, 'r');
    }

    async uploadFromStream(sourceUrl, blobName) {
        try {
            const stream = request.get(sourceUrl);
            await this._upload(stream, blobName);

        } catch (err) {
            console.error(err);
        }
    }

    async uploadFromFile(file, blobName) {
        try {
            const stream = fs.createReadStream(file, {encoding: "UTF-8"});
            await this._upload(stream, blobName);

        } catch (err) {
            console.error(err);
        }
    }


    async downloadBlob (file, blobName) {

        const downloadOptions = {
            blockSize: (4 * 1024 * 1024), // 4MB block size
            parallelism: 20 // 20 concurrency
        }

        try {
            const blobUrl = await storage.BlobURL.fromContainerURL(this.containerURL, blobName);
            const blockBlobURL = await storage.BlockBlobURL.fromBlobURL(blobUrl);

            const result = await this.listObjects(blobName);
            const buffer = Buffer.alloc(result[0].contentLength);

            await storage.downloadBlobToBuffer(
                storage.Aborter.none,
                buffer,
                blockBlobURL,
                0,
                undefined,
                downloadOptions
            );

            fs.writeFileSync(file, buffer);

        } catch (err) {
            console.error(err);
        }
    }

    async _upload(stream, blobName) {

        const uploadOptions = {
            bufferSize: (4 * 1024 * 1024), // 4MB block size
            maxBuffers: 20, // 20 concurrency
        };

        try {
            const blobUrl = await storage.BlobURL.fromContainerURL(this.containerURL, blobName);
            const blockBlobURL = await storage.BlockBlobURL.fromBlobURL(blobUrl);

            await storage.uploadStreamToBlockBlob(
                storage.Aborter.none,
                stream,
                blockBlobURL,
                uploadOptions.bufferSize,
                uploadOptions.maxBuffers);

        } catch (err) {
            console.error(err);
        }
    }

    _createSharedAccessSignatureURI(blobName, ttl, permissions) {
        const query = storage.generateBlobSASQueryParameters({
            protocol: storage.SASProtocol.HTTPS,
            expiryTime: new Date(Date.now() + ttl),
            containerName: this.containerName,
            blobName,
            permissions
        }, this.sharedKeyCredentials).toString();
        const path = encodeURIComponent(`${this.containerName}/${blobName}`);
        return `https://${this.accountName}.blob.core.windows.net/${path}?${query}`;
    }

}

module.exports = {
    ContainerAzure
}
