/**
 * Application Load Balancer layer (CDK L1 / Cfn resources)
 *
 *   Internet → ALB :80 (public subnets) → target group → EC2 instances :<targetGroupPort>
 *
 * Steps:
 *   1. Set the health check path (props.healthCheckPath, default /health).
 *
 *   2. Create the Application Load Balancer (cfnAlb)
 *      - Internet-facing, in the public subnets (props.publicSubnetIds).
 *      - Uses the ALB security group (props.albSecurityGroupId).
 *
 *   3. Create the target group (cfnTargetGroup)
 *      - Targets are EC2 instances (targetType: instance), registered by the
 *        Auto Scaling group.
 *      - Sends HTTP traffic on props.targetGroupPort (usually 80).
 *      - Health check: HTTP GET <healthPath> every 30 s, 5 s timeout.
 *        3 successes → healthy, 3 failures → unhealthy.
 *
 *   4. Create the HTTP listener on port 80 (cfnHttpListener)
 *      - Forwards all requests to the target group.
 *
 * The ALB, target group and listener are public properties. The Auto Scaling
 * group needs targetGroup.ref (the target group ARN) in its targetGroupArns
 * to register its instances.
 */

import { Construct } from 'constructs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export interface AlbProps {
  vpcId: string;
  publicSubnetIds: string[];
  albSecurityGroupId: string;
  targetGroupPort: number;       // usually 80
  healthCheckPath?: string;      // default: /health
}

export class Alb extends Construct {
  public readonly alb: elbv2.CfnLoadBalancer;
  public readonly targetGroup: elbv2.CfnTargetGroup;
  public readonly listener: elbv2.CfnListener;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // 1. Set the health check path (props.healthCheckPath, default /health).
    const healthPath = props.healthCheckPath ?? '/health';

    // 2. Create the Application Load Balancer (cfnAlb)
    this.alb = new elbv2.CfnLoadBalancer(this, 'cfnAlb', {
        name: 'cfnAlb',
        scheme: 'internet-facing',
        type: 'application',
        securityGroups: [props.albSecurityGroupId],
        subnets: props.publicSubnetIds,
    });

    // 3. Create the target group (cfnTargetGroup)
    this.targetGroup = new elbv2.CfnTargetGroup(this, 'cfnTargetGroup', {
        name: 'cfnTargetGroup',
        port: props.targetGroupPort,
        protocol: 'HTTP',
        targetType: 'instance',

        healthCheckEnabled: true,
        healthCheckProtocol: 'HTTP',
        healthCheckPath: healthPath,
        healthCheckIntervalSeconds: 30,
        healthCheckTimeoutSeconds: 5,
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,

        vpcId: props.vpcId,
    });

    // 4. Create the HTTP listener on port 80 (cfnHttpListener)
    this.listener = new elbv2.CfnListener(this, 'cfnHttpListener', {
      loadBalancerArn: this.alb.ref,
      port: 80,
      protocol: 'HTTP',
      defaultActions: [
        {
          type: 'forward',
          targetGroupArn: this.targetGroup.ref,
        },
      ],
    });

  }
}
