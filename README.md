# node-cloudstorage
General Cloud Storage library currently for Azure and AWS.
Currently only supports Linux and macOS.

# Summary
This is an agnostic wrapper for various cloud storage providers (currently: AWS and Azure) that help with uploading, downloading, generating pre-signed urls, listing objects in storage, storage validation, and retrieve metadata about an object in storage.

# Install
```
npm install --save node-cloudstorage
```

# Use
```
const CloudStorage = require('CloudStorage');
```

Credentials for the cloud storage must be provided.

## Azure
Azure credentials requires an object containing the attributes `accountKey` and `accountName` with their related values.
```
const CloudStorage = require('CloudStorage');

const azureAccountKey = "myAzureAccountKey";
const azureAccountName = "myAzureAccountName";
const azureStorageContainerName = "adobe-sample-asset-repository";

const cloudStorage = new CloudStorage({
            accountKey: azureAccountKey,
            accountName: azureAccountName
        },
        azureStorageContainerName);
```

## AWS
AWS credentials requires an object containing the attributes `accessKeyId` and `secretAccessKey` with their related values.
```
const CloudStorage = require('CloudStorage');

const awsAccessKeyId = "myAwsAccessKeyId";
const awsSecretAccessKey = "myAwsSecretAccessKey";
const awsStorageContainerName = "adobe-sample-asset-repository";

const cloudStorage = new CloudStorage({
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey
        },
        awsStorageContainerName);
```

## Upload
Upload can take either a local file path or a URL as the source asset that will be uploaded
```
const awsTargetKey = "my/aws/upload/path/uploaded-asset.jpg";

/* Using a URL as the source to upload */
const sourceAssetUrl = "https://myDomain.com/my/asset.jpg";
await cloudStorage.upload(sourceAssetUrl, awsTargetKey);

/* Using a local path as the source to upload */
const sourceAssetLocalPath = "/User/myUser/downloads/myAsset.jpg";
await cloudStorage.upload(sourceAssetLocalPath, awsTargetKey);
```

## Download
```
const localDestinationFile = "/User/myUser/downloads/myAsset.jpg";
const awsSourceCloudStorageAssetPath = "my/asset/to/download.jpg";

await awsSourceStorageContainer.downloadAsset(localDestinationFile, awsSourceCloudStorageAssetUrl);
```

## Presigned URLs
```
const awsSourceCloudStorageAssetPath = "my/asset/to/download.jpg";
const expiry = 60000; /* Length the presigned URL has to live once created */

/* Presigned GET URL */
const preSignedGetUrl = awsSourceStorageContainer.presignGet(awsSourceCloudStorageAssetPath, expiry);

/* Presigned PUT URL */
const preSignedPutUrl = awsSourceStorageContainer.presignPut(awsSourceCloudStorageAssetPath, expiry);
```

## Objects in Cloud Storage
`prefix` is optional and can also be a single object instead of a path
Returns an array of objects
```
const prefixPath = "my/cloud/storage/asset/path/containing/multiple/objects";
const resultsPath = await awsSourceStorageContainer.listObjects(prefixPath);

const prefixSingleObject = "my/cloud/storage/single/asset.jpg";
const resultsSingleObject = await awsSourceStorageContainer.listObjects(prefixSingleObject);

/* Prefix optional which will result in returning all objects that live in the cloud storage container */
const results = await awsSourceStorageContainer.listObjects();
```

## Object Metadata
```
const objectKey = "my/cloud/storage/single/asset.jpg";
const metadata = await awsSourceStorageContainer.getMetadata(objectKey);
```

## Validate Cloud Storage Container
This does a simple check to see if the container exists by requesting the containers ACL
```
const booleanResult = await awsSourceStorageContainer.validate();
```

# Tests

## Setup
When unit tests are run, they require credentials which you can provide one of two ways:

1. Local Configuration File
You can either place `credentials.yaml` in `~/.adobe-asset-compute` (Ex: `~/.adobe-asset-compute/credentials.yaml`) or export the environment variable `ASSET_COMPUTE_CREDENTIALS_YAML` with the fully qualified path of `credentials.yaml`

1. Environment Variables
\
\
For Azure, export the following environment variables with their related values:
\
`AZURE_STORAGE_ACCOUNT`
\
`AZURE_STORAGE_KEY`
\
\
For AWS, export the following environment variables with their related values:
\
`AWS_ACCESS_KEY`
\
`AWS_SECRET_KEY`

## Running
```
npm test
```

### Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

### Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
