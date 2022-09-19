'use strict';

const semver = require('semver');
const set = require('lodash.set');

const FUNCTION_SCHEMA = {
  properties: {
    iamRoleStatements: { type: 'array' }
  }
};

const VPC_POLICY = {
  'Fn::Join': [
    '',
    [
      'arn:',
      { Ref: 'AWS::Partition' },
      ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
    ],
  ],
};

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

    this.addValidation();
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

  getRole(stackName, functionName, policies, managedPolicies, permissionsBoundary) {
    const role = {
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

    if (managedPolicies && managedPolicies.length) {
      role.Properties.ManagedPolicyArns = managedPolicies;
    }

    if (permissionsBoundary && permissionsBoundary.length) {
      role.Properties.PermissionsBoundary = permissionsBoundary;
    }

    return role;
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

    let sharedRoleStatements = null;
    if (service.provider.iam && service.provider.iam.role && service.provider.iam.role.statements) {
      sharedRoleStatements = service.provider.iam.role.statements;
    } else if (service.provider.iamRoleStatements) {
      sharedRoleStatements = service.provider.iamRoleStatements;
    }

    let pb = null;

    if (
      service.provider.iam
      && service.provider.iam.role
      && service.provider.iam.role.permissionsBoundary) {
      pb = service.provider.iam.role.permissionsBoundary;
    } else if (service.provider.rolePermissionsBoundary) {
      pb = service.provider.rolePermissionsBoundary;
    }

    const sharedPolicy = this.getPolicyFromStatements('shared', sharedRoleStatements);
    const stackName = this.provider.naming.getStackName();

    functions.forEach(functionName => {
      const functionObj = service.getFunction(functionName);

      if (!functionObj.role) {
        const roleId = this.getRoleId(functionName);

        const managedPolicies = [];
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

        if (service.provider.vpc || functionObj.vpc) {
          managedPolicies.push(VPC_POLICY);
        }

        const roleResource = this.getRole(stackName, functionName, policies, managedPolicies, pb);

        functionObj.role = roleId;
        set(service, `resources.Resources.${roleId}`, roleResource);
      }
    });
  }

  addValidation() {
    if (this.serverless.configSchemaHandler
      && this.serverless.configSchemaHandler.defineFunctionProperties) {
      this.serverless.configSchemaHandler.defineFunctionProperties('aws', FUNCTION_SCHEMA);
    }
  }
}

module.exports = CustomRoles;
