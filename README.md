# serverless-plugin-custom-roles

[![Build Status][ci-image]][ci-url]
[![Coverage Status][coverage-image]][coverage-url]
[![NPM version][npm-image]][npm-url]
[![Dependencies Status][dependencies-image]][dependencies-url]
[![DevDependencies Status][devdependencies-image]][devdependencies-url]

A [Serverless][serverless-url] plugin that makes creation of per function [IAM roles][iam-lambda-roles-url] easier. It mimics [serverless][serverless-url] behavior, but creates separate roles for each function instead of a shared one. If you want to create per function roles without using this plugin, you are responsible for providing the corresponding permissions for your function logs and stream events and need to repeat the same permissions from function to function.

## Usage

```yaml
service: my-service

plugins:
  - serverless-plugin-custom-roles

provider:
  name: aws
  iamRoleStatements: # [Optional] these statements will be applied to all functions
    - Effect: "Allow"
      Action:
        - "xray:PutTraceSegments"
        - "xray:PutTelemetryRecords"
      Resource: "*"

functions:
  function1:
    handler: 'src/function1.js'
    iamRoleStatements: # [Optional] these statements will be applied to this function only (in addition to statements that are applied to all functions)
      - Effect: "Allow"
        Action:
          - "cloudwatch:GetMetricStatistics"
          - "cloudwatch:DescribeAlarms"
          - "cloudwatch:PutMetricData"
        Resource: "*"

  function2:
    handler: 'src/function2.js'
    events:
      - stream: # Appropriate permissions will be applied automatically
          type: dynamodb
          arn: "<stream-arn>"
```

## License

The MIT License (MIT)

Copyright (c) 2018-2021 Anton Bazhal

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[aws-lambda-url]: https://aws.amazon.com/lambda/details/
[ci-image]: https://circleci.com/gh/AntonBazhal/serverless-plugin-custom-roles.svg?style=shield&circle-token=28800635c8d59d71dc3de2373e7ad893219e4838
[ci-url]: https://circleci.com/gh/AntonBazhal/serverless-plugin-custom-roles
[cloudwatch-rules-url]: http://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html
[coverage-image]: https://coveralls.io/repos/github/AntonBazhal/serverless-plugin-custom-roles/badge.svg?branch=master
[coverage-url]: https://coveralls.io/github/AntonBazhal/serverless-plugin-custom-roles?branch=master
[dependencies-url]: https://david-dm.org/antonbazhal/serverless-plugin-custom-roles
[dependencies-image]: https://david-dm.org/antonbazhal/serverless-plugin-custom-roles/status.svg
[devdependencies-url]: https://david-dm.org/antonbazhal/serverless-plugin-custom-roles?type=dev
[devdependencies-image]: https://david-dm.org/antonbazhal/serverless-plugin-custom-roles/dev-status.svg
[iam-lambda-roles-url]: https://docs.aws.amazon.com/lambda/latest/dg/intro-permission-model.html
[npm-url]: https://www.npmjs.org/package/serverless-plugin-custom-roles
[npm-image]: https://img.shields.io/npm/v/serverless-plugin-custom-roles.svg
[serverless-url]: https://serverless.com/
