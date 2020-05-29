#!/bin/bash

# Doc link: https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/building-sdk-for-browsers.html#using-command-line-tools
# Note: The last part, building for browsers, may not need to be done!

# Clone aws-sdk repo
git clone git://github.com/aws/aws-sdk-js
cd aws-sdk-js

# Choose version
git checkout v.2.686.0

# Select service to use and build
npm i
node dist-tools/browser-builder.js s3 > ./vendor/aws/s3/aws-sdk-2.686.0.js

# remove build folders
cd ..
git rm -rf aws-sdk-js