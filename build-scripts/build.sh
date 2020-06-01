#!/bin/bash

#
# Copyright 2020 Adobe. All rights reserved.
# This file is licensed to you under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may obtain a copy
# of the License at http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed under
# the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
# OF ANY KIND, either express or implied. See the License for the specific language
# governing permissions and limitations under the License.
#

# #### Build AWS SDK Client for S3

# Doc link: https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/building-sdk-for-browsers.html#using-command-line-tools

# Clone aws-sdk repo
git clone git://github.com/aws/aws-sdk-js
cd aws-sdk-js

# Choose version
# TODO: turn into env variable
git checkout v.2.686.0

# Select service to use and build
npm i
node dist-tools/browser-builder.js s3 > ./../vendor/aws/s3/aws-sdk.js

# remove build folders
cd ..
git rm -rf aws-sdk-js