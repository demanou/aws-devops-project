/**
 * Security groups layer (CDK L1 / Cfn resources)
 *
 * Creates 3 security groups that form a chain:
 *   Internet --> ALB --> EC2 instances --> PostgreSQL database
 *
 * Steps:
 *   1. Create the ALB security group (albSg)
 *      - Inbound: HTTP (80) and HTTPS (443) from anywhere (0.0.0.0/0).
 *      - Outbound: all traffic allowed.
 *
 *   2. Create the EC2 security group (ec2Sg)
 *      - Inbound: HTTP (80) and HTTPS (443) only from the ALB security group.
 *        Instances cannot be reached directly from the internet.
 *      - Outbound: all traffic allowed.
 *
 *   3. Create the database security group (dbSg)
 *      - Inbound: PostgreSQL (5432) only from the EC2 security group.
 *        Only the application instances can connect to the database.
 *      - Outbound: all traffic allowed.
 *
 * The 3 groups are public properties, so other constructs (Compute, Database, load balancer) can use them.
 */

import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class SecurityGroups extends Construct {
  public readonly albSg: ec2.CfnSecurityGroup;
  public readonly ec2Sg: ec2.CfnSecurityGroup;
  public readonly dbSg: ec2.CfnSecurityGroup;

  constructor(scope: Construct, id: string, vpcId: string) {
    super(scope, id);

    // 1. Create the ALB security group (albSg)
    this.albSg = buildCfnSecurityGroup(
        this,
        'AlbSecurityGroup',
        vpcId,
        'Security Group for ALB',
        [
            { protocol: 'tcp', from: 80,  to: 80,  cidr: '0.0.0.0/0' },
            { protocol: 'tcp', from: 443, to: 443, cidr: '0.0.0.0/0' }
        ],
        [
            { protocol: '-1', cidr: '0.0.0.0/0' }
        ]
    );

    // 2. Create the EC2 security group (ec2Sg)
    this.ec2Sg = buildCfnSecurityGroup(
        this,
        'Ec2SecurityGroup',
        vpcId,
        'Security Group for EC2 Instances',
        [
            { protocol: 'tcp', from: 80,  to: 80,  sourceSg: this.albSg.ref },
            { protocol: 'tcp', from: 443, to: 443, sourceSg: this.albSg.ref }
        ],
        [
            { protocol: '-1', cidr: '0.0.0.0/0' }
        ]
    );

    // 3. Create the database security group (dbSg)
    this.dbSg = buildCfnSecurityGroup(
        this,
        'DbSecurityGroup',
        vpcId,
        'Security Group for Database',
        [
            { protocol: 'tcp', from: 5432, to: 5432, sourceSg: this.ec2Sg.ref }
        ],
        [
            { protocol: '-1', cidr: '0.0.0.0/0' }
        ]
    );

  }
}

/**
 * Helper: builds one security group with its ingress and egress rules.
 *
 * Steps:
 *   1. Create the security group in the given VPC, with a description and a Name tag (cfn<id>).
 *   2. Create one ingress rule resource per entry in ingressRules
 *      - The source is either a CIDR block (cidr) or another security group (sourceSg).
 *   3. Create one egress rule resource per entry in egressRules
 *      - protocol '-1' means all protocols and all ports.
 *   4. Return the security group so the caller can use its ID (sg.ref).
 *
 * Rules are created as separate resources (CfnSecurityGroupIngress / Egress)
 * rather than inline. This lets security groups reference each other
 * without creating a circular dependency.
 */

function buildCfnSecurityGroup(
    scope: Construct,
    id: string,
    vpcId: string,
    description: string,
    ingressRules: {
        protocol: string;
        from: number;
        to: number;
        cidr?: string;
        sourceSg?: string;
    }[],
    egressRules: {
        protocol: string;
        cidr: string;
    }[]
): ec2.CfnSecurityGroup {

    // Create SG
    const sg = new ec2.CfnSecurityGroup(scope, `cfn${id}`, {
        groupDescription: description,
        vpcId,
        tags: [{ key: 'Name', value: `cfn${id}` }],
    });

    // Add ingress rules
    ingressRules.forEach((rule, index) => {
        new ec2.CfnSecurityGroupIngress(scope, `cfn${id}Ingress${index}`, {
            groupId: sg.ref,
            ipProtocol: rule.protocol,
            fromPort: rule.from,
            toPort: rule.to,
            cidrIp: rule.cidr,
            sourceSecurityGroupId: rule.sourceSg,
        });
    });

    // Add egress rules
    egressRules.forEach((rule, index) => {
        new ec2.CfnSecurityGroupEgress(scope, `cfn${id}Egress${index}`, {
            groupId: sg.ref,
            ipProtocol: rule.protocol,
            cidrIp: rule.cidr,
        });
    });

    return sg;
}

