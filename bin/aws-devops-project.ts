#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AwsDevopsProjectStack } from '../lib/aws-devops-project-stack';

const app = new cdk.App();
new AwsDevopsProjectStack(app, 'AwsDevopsProjectStack', {

  env: {
      account: '962500058125',
      region: 'ca-central-1',
    },

});
