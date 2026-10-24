/**
 * Main stack — assembles the full application architecture.
 *
 *   Internet → ALB (public subnets) → EC2 Auto Scaling group (private subnets)
 *                                    → RDS PostgreSQL (private subnets)
 *
 * Steps:
 *   1. Create the network (Network)
 *      - VPC 10.20.0.0/16, internet gateway, 2 public and 2 private subnets
 *        across 2 AZs, and 1 NAT gateway per AZ.
 *
 *   2. Create the security groups in the VPC (SecurityGroups)
 *      - albSg: HTTP/HTTPS from the internet.
 *      - ec2Sg: HTTP/HTTPS only from the ALB.
 *      - dbSg:  PostgreSQL (5432) only from the EC2 instances.
 *
 *   3. Create the compute layer (Compute)
 *      - Launch template + Auto Scaling group in the 2 private subnets,
 *        using the EC2 security group.
 *      - CPU target tracking scaling policy.
 *
 *   4. Create the Application Load Balancer (Alb)
 *      - Internet-facing, in the 2 public subnets, using the ALB security group.
 *      - Target group on port 80, health check on /health.
 *
 *   5. Create the database (Database)
 *      - Storage size from CDK context "storageSize" (default 20 GB).
 *        Example: cdk deploy -c storageSize=50
 *      - RDS PostgreSQL in the 2 private subnets, using the DB security group.
 *      - Single-AZ (multiAz: false) to reduce cost.
 */

import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { Network } from './network';
import { SecurityGroups } from './security-groups';
import { Compute } from './compute';
import { Alb } from './alb';
import { Database } from './database';

export class AwsDevopsProjectStack extends cdk.Stack {
  public readonly vpc: ec2.CfnVPC;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Create the network (Network)
    const network = new Network(this, 'Network');

    // 2. Create the security groups in the VPC (SecurityGroups)
    const sgs = new SecurityGroups(this, 'SecurityGroups', network.vpc.ref);

    // 3. Create the compute layer (Compute)
    const compute = new Compute(this, 'Compute', {
        subnetIds: [
            network.privateSubnetA.ref,
            network.privateSubnetB.ref
        ],
        ec2SecurityGroupId: sgs.ec2Sg.ref
    });

    // 4. Create the Application Load Balancer (Alb)
    const alb = new Alb(this, 'Alb', {
        vpcId: network.vpc.ref,
        publicSubnetIds: [
            network.publicSubnetA.ref,
            network.publicSubnetB.ref
        ],
        albSecurityGroupId: sgs.albSg.ref,
        targetGroupPort: 80,
        healthCheckPath: '/health'
    });

    // 5. Create the database (Database)
    const storage = this.node.tryGetContext('storageSize') ?? 20; // default 20 GB
    const database = new Database(this, 'Database', {
        vpcId: network.vpc.ref,
        privateSubnetIds: [
            network.privateSubnetA.ref,
            network.privateSubnetB.ref
        ],
        dbSecurityGroupId: sgs.dbSg.ref,
        multiAz: false,
        allocatedStorage: storage
    });

  }

}
