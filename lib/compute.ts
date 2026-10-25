/**
 * Compute layer (CDK L1 / Cfn resources)
 *
 * Steps:
 *   1. Read settings from CDK context, with default values
 *      - asgMin          --> minimum instances (default 1)
 *      - asgMax          --> maximum instances (default 4)
 *      - asgDesired      --> desired instances (default 2)
 *      - ec2InstanceType --> instance type     (default t3.micro)
 *      Example override: cdk deploy -c asgMin=2 -c ec2InstanceType=t3.small
 *
 *   2. Create the EC2 launch template (cfnLaunchTemplate)
 *      - AMI: Amazon Linux 2023 (the AMI ID is specific to one Region).
 *      - Instance type from step 1.
 *      - Attaches the EC2 security group passed in props.ec2SecurityGroupId.
 *      - Tags every launched instance with Name = cfnEc2Instance.
 *
 *   3. Create the Auto Scaling group (cfnAutoScalingGroup)
 *      - Min, max and desired capacity from step 1
 *        (converted to strings, as the L1 resource requires).
 *      - Launches instances in the private subnets (props.subnetIds).
 *      - Uses the latest version of the launch template from step 2.
 *
 *   4. Add a target tracking scaling policy (cfnCpuScalingPolicy)
 *      - Keeps the group's average CPU utilization near 50%.
 *      - Adds instances when CPU goes above 50%, removes them when it drops below,
 *        always staying between min and max capacity.
 */

import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';

export interface ComputeProps {
  subnetIds: string[];            // private subnets
  ec2SecurityGroupId: string;     // SG for EC2 instances
}

export class Compute extends Construct {
  constructor(scope: Construct, id: string, props: ComputeProps) {
    super(scope, id);

    // 1. Read settings from CDK context, with default values
    const minCapacity = this.node.tryGetContext('asgMin') ?? 1;
    const maxCapacity = this.node.tryGetContext('asgMax') ?? 4;
    const desiredCapacity = this.node.tryGetContext('asgDesired') ?? 2;
    const instanceType = this.node.tryGetContext('ec2InstanceType') ?? 't3.micro';

    // 2. Create the EC2 launch template (cfnLaunchTemplate) 
    const launchTemplate = new ec2.CfnLaunchTemplate(this, 'cfnLaunchTemplate', {
      launchTemplateName: 'cfnLaunchTemplate',
      launchTemplateData: {
          imageId: 'ami-0fdababfa12184397',   // Amazon Linux 2023
          instanceType: instanceType,
          securityGroupIds: [props.ec2SecurityGroupId],
          tagSpecifications: [
            {
              resourceType: 'instance',
              tags: [
                { 
                  key: 'Name', 
                  value: 'cfnEc2Instance'
                }
              ],
            }
          ],
        },

    });

    // 3. Create the Auto Scaling group (cfnAutoScalingGroup)
    const asg = new autoscaling.CfnAutoScalingGroup(this, 'cfnAutoScalingGroup', {
      autoScalingGroupName: 'cfnAutoScalingGroup',
      minSize: String(minCapacity),
      maxSize: String(maxCapacity),
      desiredCapacity: String(desiredCapacity),

      vpcZoneIdentifier: props.subnetIds, // private subnets

      launchTemplate: {
        launchTemplateId: launchTemplate.ref,
        version: launchTemplate.attrLatestVersionNumber,
      },
    });

    // 4. Add a target tracking scaling policy (cfnCpuScalingPolicy)
    new autoscaling.CfnScalingPolicy(this, 'cfnCpuScalingPolicy', {
      autoScalingGroupName: asg.ref,
      policyType: 'TargetTrackingScaling',

      targetTrackingConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ASGAverageCPUUtilization',
        },
        targetValue: 50.0, // CPU target
      },
    });

  }
}
