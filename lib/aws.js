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

const S3 = require('../vendor/aws/s3/aws-sdk-2.686.0');
const fetch = require('@adobe/node-fetch-retry');
const fs = require('fs-extra');
const validUrl = require('valid-url');
const { promisify } = require('util');
const URL = require('url');

const { StringUtils } = require('./string-utils.js');
const { CDN } = require('./cdn.js');

class ContainerAws {

    /**
     * @typedef {Object} S3BucketOptions
     * @property {String} [cdnUrl=] - Overrides the protocol and host of presigned GET/PUT urls, e.g. https://cdnhost
     * @property {String} [bucketRegion=] - S3 bucket region
     */
    /**
     * @typedef {Object} Auth
     * @property {String} accessKeyId - AWS access key
     * @property {String} secretAccessKey - AWS secret key
     */
    /**
     * Creates an S3 service object to run actions against
     *
     * @param {Auth} auth - S3 bucket credentials
     * @param {String} bucketName - Name of the S3 bucket
     * @param {S3BucketOptions} [options=] - Options
     */
    constructor(auth, bucketName, options) {

        if (!auth ||
                Object.keys(auth).length === 0 ||
                StringUtils.isBlankString(auth.secretAccessKey) ||
                StringUtils.isBlankString(auth.accessKeyId)) {

            throw "Authentication was not provided";
        }

        if (!bucketName || StringUtils.isBlankString(bucketName)) {
            throw "S3 bucket name was not provided";
        }

        this.bucketName = bucketName.trim();

        const params = {
            accessKeyId: auth.accessKeyId,
            secretAccessKey: auth.secretAccessKey,
            signatureVersion: "v4"
        };

        if(options) {

            if(options &&
                    (options.bucketRegion) &&
                    !StringUtils.isBlankString(options.bucketRegion)) {
                params.region = options.bucketRegion.trim();
            }

            if(options.cdnUrl) {
                this.uri = CDN.getAwsUri(options.cdnUrl);
            }
        }

        this.s3 = new S3(params);
    }

    /**
     * Validates S3 bucket by retrieving the ACL
     *
     * @return {Boolean} True if bucket is valid
     */
    async validate() {
        const params = {
            Bucket: this.bucketName
        };

        const getBucketAcl = promisify(this.s3.getBucketAcl).bind(this.s3);
        const result = await getBucketAcl(params);

        if (result && result.Grants) {
            return true;
        }
    }

    /**
     * Creates a read-only presigned URL to retrieve object in S3 bucket
     *
     * @param {String} keyName - Source S3 object key name
     * @param {Number} ttl - Length of time in milliseconds before expiration
     * @return {String} Read-only presigned URL
     */
    presignGet(keyName, ttl) {
        return this._createSharedAccessSignatureURI(keyName, ttl, "getObject");
    }

    /**
     * Creates a write-only presigned URL to upload asset to S3 bucket
     *
     * @param {String} keyName - Desired key name of the target S3 object
     * @param {Number} ttl - Length of time in milliseconds before expiration
     * @return {String} Write-only presigned URL
     */
    presignPut(keyName, ttl) {
        return this._createSharedAccessSignatureURI(keyName, ttl, "putObject");
    }

    /**
     * Uploads asset to S3 object from a local path or URL
     *
     * @param {String} path - Either a fully qualified local path or URL
     * @param {String} keyName - Target S3 object key name
     */
    async upload(path, keyName) {

        if (validUrl.isWebUri(path)) {

            const res = await fetch(path);

            if (res.ok) {
                return this._upload(res.body, keyName);
            }

            throw `Unable to request ${path}: ${res.status}`;

        } else {

            const fileStat = await fs.stat(path);

            if (fileStat.isFile()) {
                return this._upload(fs.createReadStream(path), keyName);

            } else {
                throw `Asset path is invalid: ${path}`;
            }
        }
    }

    /**
     * Downloads S3 object to local disk
     *
     * @param {String} file - Local path to save S3 object
     * @param {String} keyName - S3 object key name to download
     */
    async downloadAsset (file, keyName) {

        const writeStream = fs.createWriteStream(file);

        const options = {
            Bucket: this.bucketName,
            Key: keyName
        };

        return new Promise((resolve, reject) => {
            writeStream.on("error", error => {
                reject(error);
            });

            this.s3.getObject(options)
                .createReadStream()
                .on("error", error => { // NoSuchKey: The specified key does not exist
                    reject(error);
                })
                .pipe(writeStream)
                .on("error", error => { // Errors that occur when writing data
                    reject(error);
                })
                .on("close", () => {
                    resolve();
                });
        });
    }

    /**
     * @typedef {Object} ListS3Objects[]
     * @property {String} keyName - S3 object key name
     * @property {Number} contentLength - Length of the S3 object in bytes
     */
    /**
     * Lists all S3 objects based on prefix
     *
     * @param {String} [prefix=] - The virtual path of the S3 objects to list`
     * @return {ListS3Objects[]} List of S3 objects
     */
    async listObjects(prefix) {

        let response;
        const results = [];

        const params = {
            Bucket: this.bucketName
        };

        if (prefix && prefix.length > 0) {
            params.Prefix = prefix;
        }

        do {
            response = await this.s3.listObjects(params).promise();
            response.Contents.forEach(item => {
                results.push({
                    name: item.Key,
                    contentLength: item.Size
                });
            });

            if (response.IsTruncated) {
                params.Marker = response.Contents.slice(-1)[0].Key;
            }
        } while (response.IsTruncated);

        return results;
    }

    /**
     * @typedef {Object} BlobMetadata
     * @param {String} name - Name of blob
     * @param {Number} contentLength - Size of blob
     */
    /**
     * Returns size of S3 object
     *
     * @param {String} keyName - S3 object key name
     * @returns {Number} S3 object size else undefined
     */
    async getMetadata(keyName) {

        const list = await this.listObjects(keyName);

        if (list.length !== 1) {
            return;
        }
        return list[0];
    }

    /**
     * Uploads stream creating an S3 object
     *
     * @param {Stream} stream - Readable stream
     * @param {String} keyName - Target S3 object key name
     */
    async _upload(stream, keyName) {

        const uploadOptions = {
            // Do we want to try and calculate the size and then set part size or let AWS.S3.upload() => AWS.S3.ManagedUpload() do it?
            // Same for multipart - do we want to create more code just to match azure.js?
            queueSize: 20 // concurrency
        };

        const params = {
            Bucket: this.bucketName,
            Key: keyName,
            Body: stream
        };

        return new Promise( (resolve, reject) => {

            this.s3.upload(params, uploadOptions, function (error, results) {
                if (error) {
                    reject(error);
                }
                resolve(results);
            });
        });
    }

    /**
     * Creates pre-signed url using container credentials
     *
     * @param {String} keyName - S3 object Key name
     * @param {Number} ttl - Length of time in milliseconds before expiration
     * @param {String} action - Action value for S3.getSignedUrl()
     * @return {String} Pre-signed URL
     */
    _createSharedAccessSignatureURI(keyName, ttl, action) {

        /* AWS TTL value is measured in seconds for their SDK
         *
         * In order to keep all cloud storage services generic for incoming values,
         * the incoming TTL measurement will remain as milliseconds and be converted
         * for AWS into seconds (milliseconds divided by 1000)
         */
        ttl = ( ttl / 1000 );

        const params = {
            Bucket: this.bucketName,
            Key: keyName,
            Expires: ttl
        };

        const url = URL.parse(this.s3.getSignedUrl(action, params));
        const pathName = `${encodeURI(url.pathname)}${url.search}`;

        if(this.uri) {
            return `${this.uri}${pathName}`;
        }

        return url.href;
    }
}

module.exports = {
    ContainerAws
};
