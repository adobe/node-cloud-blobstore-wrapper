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
const fetch = require('node-fetch');
const fs = require('fs');

class ContainerAzure {

    /**
     * @typedef {Object} Auth
     * @property {String} accountName Azure account name
     * @property {String} accountKey Azure account key
     */
    /**
     * Creates an Azure container Object to run actions against blobs
     *
     * @param {Auth} auth - contains both Azure `accountName` and `accountKey`
     * @param {String} containerName - Name of the Azure container
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
     * @return {Object} Output of requesting the ACL
     */
    async validate() {
        return this.containerURL.getAccessPolicy();
    }

    /**
     * @typedef {Object} ListObjectsBlob
     * @property {String} name Name of the blob
     * @property {Number} contentLength Length of the blob in bytes
     * @property {String} contentType Mimetype of the blob
     */
    /**
     * Lists all blobs based on prefix
     *
     * @param {String} prefix - The virtual path of the blob(s) to list`
     * @return {ListObjectsBlob[]} List of blobs containing `name`, `contentLength`, and `contentType`
     */
    async listObjects(prefix) {
        const result = [];
        let marker = null;
        do {
            let options;
            if (prefix && prefix.length > 0) {
                options = { prefix };
            }
            const response = await this.containerURL.listBlobFlatSegment(storage.Aborter.none, marker, options);
            for (const blobItem of response.segment.blobItems) {
                result.push({
                    name: blobItem.name,
                    contentLength: blobItem.properties.contentLength,
                    contentType: blobItem.properties.contentType
                });
            }
            marker = response.nextMarker
        } while (marker);
        return result;
    }

    /**
     * Creates a read only pre-signed blob URL for container
     *
     * @param {String} blobName - The virtual path of the blob
     * @param {Number} ttl - Length of time in milliseconds before expiration
     * @return {String} Read only pre-signed URL
     */
    presignGet(blobName, ttl) {
        return this._createSharedAccessSignatureURI(blobName, ttl, "r");
    }

    /**
     * Creates a write only pre-signed blob URL for container
     * 
     * @param {String} blobName - The virtual path of the blob
     * @param {Number} ttl  - Length of time in milliseconds before expiration
     * @return {String} Write only pre-signed URL
     */
    presignPut(blobName, ttl) {
        return this._createSharedAccessSignatureURI(blobName, ttl, "cw");
    }

    /**
     * Commit blocks uploaded to the presigned PUT url
     * 
     * @param {String} blobName - The virtual path of the blob
     */
    async commitPut(blobName) {
        const blobUrl = storage.BlobURL.fromContainerURL(this.containerURL, blobName);
        const blockBlobURL = await storage.BlockBlobURL.fromBlobURL(blobUrl);
        const blockList = await blockBlobURL.getBlockList(
            storage.Aborter.none, 
            "uncommitted"
        );
        await blockBlobURL.commitBlockList(
            storage.Aborter.none,
            blockList.uncommittedBlocks.map(x => x.name)
        );  
    }

    /**
     * Uploads asset to blob from URL as a stream
     *
     * @param {String} sourceUrl - Asset URL to create stream from
     * @param {String} blobName - Destination blob name
     */
    async uploadFromUrl(sourceUrl, blobName) {

        const res = await fetch(sourceUrl);
        if (!res.ok) {
            throw Error(`Unable to request ${sourceUrl}: ${res.status}`);
        }
        return this._upload(res.body, blobName);
    }

    /**
     * Uploads asset to blob from local disk asset as a stream
     *
     * @param {String} file - Local disk asset to upload
     * @param {String} blobName - Destination blob name
     */
    async uploadFromFile(file, blobName) {
        const stream = fs.createReadStream(file, {encoding: "UTF-8"});
        return this._upload(stream, blobName);
    }

    /**
     * Downloads blob to local disk
     *
     * @param {String} file - Asset path on local disk to save blob as
     * @param {String} blobName - Target blob name
     */
    async downloadBlob (file, blobName) {

        const blobUrl = await storage.BlobURL.fromContainerURL(this.containerURL, blobName);
        const blockBlobURL = await storage.BlockBlobURL.fromBlobURL(blobUrl);

        const downloadResponse = await blockBlobURL.download(storage.Aborter.none, 0);
        const writeStream = fs.createWriteStream(file);

        return new Promise((resolve, reject) => {
            writeStream.on("error", err => {
                reject(err);
            });
            downloadResponse.readableStreamBody
                .pipe(writeStream)
                .on("error", err => reject(err))
                .on("finish", () => resolve());
        });
    }

    /**
     * Uploads asset to blob from stream
     *
     * @param {Stream} stream
     * @param {String} blobName - Destination blob name
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
            throw err;
        }
    }

    /**
     * Creates pre-signed url using container credentials
     *
     * @param {String} blobName - Destination blob name
     * @param {Number} ttl - Length of time in milliseconds before expiration
     * @param {String} permissions - Read/write permissions of pre-signed blob URL
     * @return {String} Pre-signed URL
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

    /**
     * Returns mimetype of blob
     *
     * @param {String} blobName
     * @returns{String} Blob mimetype
     */
    async getContentType (blobName) {

        const list = await this.listObjects(blobName);
        return list[0].contentType;
    }

    /**
     * Returns size of blob
     *
     * @param {String} blobName
     * @returns{Number} Blob size
     */
    async getContentLength(blobName) {

        const list = await this.listObjects(blobName);
        return list[0].contentLength;
    }
}

module.exports = {
    ContainerAzure
}
