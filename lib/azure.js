/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

const storage = require('@azure/storage-blob');
const fetch = require('@adobe/node-fetch-retry');
const fs = require('fs-extra');
const validUrl = require('valid-url');

const { StringUtils } = require('./string-utils.js');
const { CDN } = require('./cdn.js');

class ContainerAzure {

    /**
     * @typedef {Object} ContainerAzureOptions
     * @property {String} [cdnUrl=] Overrides the protocol and host of presigned GET/PUT urls, e.g. https://cdnhost
     */
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
     * @param {ContainerAzureOptions} [options=] - Options
     */
    constructor(auth, containerName, options) {

        if (!auth ||
                Object.keys(auth).length === 0 ||
                StringUtils.isBlankString(auth.accountName) ||
                StringUtils.isBlankString(auth.accountKey)) {
            throw "Authentication was not provided";
        }

        if (!containerName || StringUtils.isBlankString(containerName)) {
            throw "Azure container name was not provided";
        }

        this.accountName = auth.accountName.trim();
        this.containerName = containerName.trim();
        this.uri = CDN.getAzureUri(options || {}, this.accountName);

        this.storageSharedKeyCredentials = new storage.StorageSharedKeyCredential(
            this.accountName,
            auth.accountKey
        );

        const url = `https://${this.accountName}.blob.core.windows.net/${this.containerName}`;
        this.containerClient = new storage.ContainerClient(
            url,
            storage.ContainerClient.newPipeline(this.StorageSharedKeyCredentials, {})
        );
    }

    /**
     * Validates Azure container by getting the ACL
     *
     * @return {Boolean} True if container is valid
     */
    async validate() {

        const result = await this.containerClient.getAccessPolicy();
        if(result._response.status === 200) {
            return true;
        }
    }

    /**
     * @typedef {Object} ListObjectsBlob
     * @property {String} name Name of the blob
     * @property {Number} contentLength Length of the blob in bytes
     * @property {String} contentType Mime Type of the blob
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
            const response = await this.containerClient.listBlobFlatSegment(storage.Aborter.none, marker, options);
            for (const blobItem of response.segment.blobItems) {
                result.push({
                    name: blobItem.name,
                    contentLength: blobItem.properties.contentLength,
                    contentType: blobItem.properties.contentType
                });
            }
            marker = response.nextMarker;
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
        return this.multiPartPresignPut(blobName, ttl).urls[0];
    }

    /**
     * @typedef {Object} MultiPartContents //Probably a bad name for this
     * @param {Number} minPartSize - Min size for a part
     * @param {Number} maxPartSize - Max size for a part
     * @param {Array} urls - Presigned URLs for each part
     */
    /**
     * Create a multi-part presigned set of urls
     *
     * @param {String} blobName - Target blob name
     * @param {Number} ttl  - Length of time in milliseconds before expiration
     * @param {Number} [estimatedSize=] - Estimated size of the uploaded file
     * @param {Number} [maxUrls=1] - Maximum number of urls
     * @returns {MultiPartContents}
     */
    multiPartPresignPut(blobName, ttl, estimatedSize, maxUrls) {
        const url = this._createSharedAccessSignatureURI(blobName, ttl, "cw");

        const minPartSize = 10*1024*1024;
        const maxPartSize = 100*1024*1024;

        let numUrls = maxUrls || 1;
        if (estimatedSize) {
            numUrls = Math.ceil(estimatedSize / minPartSize);
            if (maxUrls) {
                numUrls = Math.min(numUrls, maxUrls);
            }
        }

        const urls = [];
        for (let block = 0; block < numUrls; ++block) {
            const rawBlockId = `${block}`.padStart(6, "0");
            const blockId = encodeURIComponent(Buffer.from(rawBlockId, "utf-8").toString("base64"));
            urls.push(`${url}&comp=block&blockid=${blockId}`);
        }

        return {
            minPartSize,
            maxPartSize,
            urls
        };
    }

    /**
     * Commit blocks uploaded to the presigned PUT url
     *
     * @param {String} blobName - The virtual path of the blob
     */
    async commitPut(blobName) {
        const blobUrl = storage.BlobClient.fromContainerURL(this.containerClient, blobName);
        const blockBlobClient = storage.BlockBlobClient.fromBlobURL(blobUrl);
        const blockList = await blockBlobClient.getBlockList(
            storage.Aborter.none,
            "uncommitted"
        );
        await blockBlobClient.commitBlockList(
            storage.Aborter.none,
            blockList.uncommittedBlocks.map(x => x.name)
        );
    }

    /**
     * Uploads asset to blob from a local path or URL
     *
     * @param {String} path - Either a fully qualified local path or URL
     * @param {String} blobName - Target blob name
     */
    async upload(path, blobName) {

        if (validUrl.isWebUri(path)) {
            const res = await fetch(path);

            if (res.ok) {
                return this._upload(res.body, blobName);
            }

            throw `Unable to request ${path}: ${res.status}`;

        } else {
            const fileStat = await fs.stat(path);

            if (fileStat.isFile()) {
                return this._upload(fs.createReadStream(path), blobName);

            } else {
                throw `Asset path is invalid: ${path}`;
            }
        }
    }

    /**
     * Downloads blob to local disk
     *
     * @param {String} file - Asset path on local disk to save blob as
     * @param {String} blobName - Target blob name
     */
    async downloadAsset (file, blobName) {

        const blobUrl = storage.BlobClient.fromContainerURL(this.containerClient, blobName);
        const blockBlobClient = storage.BlockBlobClient.fromBlobURL(blobUrl);

        const downloadResponse = await blockBlobClient.download(storage.Aborter.none, 0);
        const writeStream = fs.createWriteStream(file);

        return new Promise((resolve, reject) => {
            writeStream.on("error", error => {
                reject(error);
            });

            downloadResponse.readableStreamBody
                .pipe(writeStream)
                .on("error", error => reject(error))
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
            maxBuffers: 20 // 20 concurrency
        };

        const blobUrl = storage.BlobClient.fromContainerURL(this.containerClient, blobName);
        const blockBlobClient = storage.BlockBlobClient.fromBlobURL(blobUrl);

        await storage.uploadStreamToBlockBlob(
            storage.Aborter.none,
            stream,
            blockBlobClient,
            uploadOptions.bufferSize,
            uploadOptions.maxBuffers);
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
        }, this.storageSharedKeyCredentials).toString();

        const pathName = `/${encodeURI(`${this.containerName}/${blobName}`)}?${query}`;

        return `${this.uri}${pathName}`;
    }

    /**
     * @typedef {Object} BlobMetadata
     * @param {String} name - Name of blob
     * @param {String} contentType - Mime Type of blob
     * @param {Number} contentLength - Size of blob
     */
    /**
     * Returns metadata of a single blob
     *
     * @param {String} blobName
     * @returns {BlobMetadata}
     */
    async getMetadata (blobName) {

        const list = await this.listObjects(blobName);

        if (list.length !== 1) {
            return;
        }
        return list[0];
    }
}

module.exports = {
    ContainerAzure
};
