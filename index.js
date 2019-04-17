'use strict';

const semver = require('semver');
const set = require('lodash.set');

class CustomRoles {
  constructor(serverless, options) {
    if (!semver.satisfies(serverless.version, '>= 1.12')) {
      throw new Error('serverless-plugin-custom-roles requires serverless 1.12 or higher!');
    }

    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.hooks = {
      'before:package:setupProviderConfiguration': () => this.createRoles()
    };
  }

  log(message) {
    this.serverless.cli.log(`[serverless-plugin-custom-roles]: ${message}`);
  }

  getPolicyFromStatements(name, statements) {
    if (!statements || !statements.length) {
      return null;
    }

    return {
      PolicyName: name,
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: statements
      }
    };
  }

  getLoggingPolicy(functionName) {
    const statements = [
      {
        Effect: 'Allow',
        Action: ['logs:CreateLogStream'],
        Resource: [{
          'Fn::Join': [
            ':',
            [
              'arn:aws:logs',
              { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              `log-group:/aws/lambda/${functionName}:*`
            ]
          ]
        }]
      },
      {
        Effect: 'Allow',
        Action: ['logs:PutLogEvents'],
        Resource: [{
          'Fn::Join': [
            ':',
            [
              'arn:aws:logs',
              { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              `log-group:/aws/lambda/${functionName}:*:*`
            ]
          ]
        }]
      }
    ];

    return this.getPolicyFromStatements('logging', statements);
  }

  getStreamsPolicy(functionName, functionObj) {
    if (!functionObj.events) {
      return null;
    }

    const resources = functionObj.events.reduce((acc, event) => {
      if (!event.stream) {
        return acc;
      }

      let eventSourceArn;
      if (typeof event.stream === 'string') {
        eventSourceArn = event.stream;
      } else if (typeof event.stream === 'object' && event.stream.arn) {
        eventSourceArn = event.stream.arn;
      }

      if (!eventSourceArn) {
        this.log(`WARNING: Stream event source for function '${functionName}' is not configured properly. IAM permissions will not be set properly.`);
        return acc;
      }

      const streamType = event.stream.type || eventSourceArn.split(':')[2];
      if (streamType === 'dynamodb') {
        acc.dynamodb.push(eventSourceArn);
      } else if (streamType === 'kinesis') {
        acc.kinesis.push(eventSourceArn);
      } else {
        this.log(`WARNING: Stream event type for function '${functionName}' is not configured properly. IAM permissions will not be set properly.`);
      }

      return acc;
    }, { dynamodb: [], kinesis: [] });

    const statements = [];
    if (resources.dynamodb.length) {
      statements.push({
        Effect: 'Allow',
        Action: [
          'dynamodb:GetRecords',
          'dynamodb:GetShardIterator',
          'dynamodb:DescribeStream',
          'dynamodb:ListStreams'
        ],
        Resource: resources.dynamodb
      });
    }
    if (resources.kinesis.length) {
      statements.push({
        Effect: 'Allow',
        Action: [
          'kinesis:GetRecords',
          'kinesis:GetShardIterator',
          'kinesis:DescribeStream',
          'kinesis:ListStreams'
        ],
        Resource: resources.kinesis
      });
    }

    return this.getPolicyFromStatements('streams', statements);
  }

  getRole(stackName, functionName, policies) {
    return {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: ['lambda.amazonaws.com']
            },
            Action: 'sts:AssumeRole'
          }]
        },
        Policies: policies
      }
    };
  }

  getRoleId(functionName) {
    const functionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
    return `${functionLogicalId}Role`;
  }

  createRoles() {
    const service = this.serverless.service;
    const functions = this.serverless.service.getAllFunctions();
    if (!functions.length) {
      this.log('No functions to add roles to');
      return;
    }

    const sharedRoleStatements = service.provider.iamRoleStatements;
    const sharedPolicy = this.getPolicyFromStatements('shared', sharedRoleStatements);
    const stackName = this.provider.naming.getStackName();

    functions.forEach(functionName => {
      const functionObj = service.getFunction(functionName);
      const roleId = this.getRoleId(functionName);

      const policies = [this.getLoggingPolicy(functionObj.name)];
      if (sharedPolicy) {
        policies.push(sharedPolicy);
      }

      const customPolicy = this.getPolicyFromStatements('custom', functionObj.iamRoleStatements);
      if (customPolicy) {
        policies.push(customPolicy);
      }

      const streamsPolicy = this.getStreamsPolicy(functionName, functionObj);
      if (streamsPolicy) {
        policies.push(streamsPolicy);
      }

      const roleResource = this.getRole(stackName, functionName, policies);

      functionObj.role = roleId;
      set(service, `resources.Resources.${roleId}`, roleResource);
    });
  }
}

module.exports = CustomRoles;
