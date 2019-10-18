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

    /**
     * Creates an Azure container object to run actions against blobs
     *
     * @param {object} auth - contains both Azure `accountName` and `accountKey`
     * @param {string} containerName - Name of the Azure container
     */
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

    /**
     * Validates Azure container by getting the ACL
     *
     * @return {object} Output of requesting the ACL
     */
    async validate() {
        return this.containerURL.getAccessPolicy();
    }

    /**
     * Lists all blobs based on prefix
     *
     * @param {string} prefix - The virtual path of the blob(s) to list`
     * @return {object} List of blobs containing `name`, `contentLength`, and `contentType`
     */
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

    /**
     * Creates read only pre-signed blob URL for container
     *
     * @param {string} blobName - The virtual path of the blob
     * @param {int} ttl - Length of time in milliseconds before expiration
     * @return {string} Read only pre-signed URL
     */
    presignGet(blobName, ttl) {
        return this._createSharedAccessSignatureURI(blobName, ttl, 'r');
    }

    /**
     * Uploads asset to blob from URL as a stream
     *
     * @param {string} sourceUrl - Asset URL to create stream from
     * @param {string} blobName - Destination blob name
     */
    async uploadFromUrl(sourceUrl, blobName) {
        try {
            const stream = request.get(sourceUrl);
            await this._upload(stream, blobName);

        } catch (err) {
            console.error(err);
        }
    }

    /**
     * Uploads asset to blob from local disk asset as a stream
     *
     * @param {string} file - Local disk asset to upload
     * @param {string} blobName - Destination blob name
     */
    async uploadFromFile(file, blobName) {
        try {
            const stream = fs.createReadStream(file, {encoding: "UTF-8"});
            await this._upload(stream, blobName);

        } catch (err) {
            console.error(err);
        }
    }

    /**
     * Downloads blob to local disk
     *
     * @param {string} file - Asset path on local disk to save blob as
     * @param {string} blobName - Target blob name
     */
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

    /**
     * Uploads asset to blob from stream
     *
     * @param {stream} stream
     * @param {string} blobName - Destination blob name
     */
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

    /**
     * Creates pre-signed url using container credentials
     *
     * @param {string} blobName - Destination blob name
     * @param {int} ttl - Length of time in milliseconds before expiration
     * @param {string} permissions - Read/write permissions of pre-signed blob URL
     * @return {string} Pre-signed URL
     */
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
