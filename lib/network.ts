/**
 * Network layer (CDK L1 / Cfn resources) — Region ca-central-1
 *
 * Builds a VPC across 2 Availability Zones, each with 1 public subnet,
 * 1 private subnet and its own NAT gateway.
 *
 *   VPC 10.20.0.0/16
 *   ├── AZ a: public-subnet-a 10.20.1.0/24 (NAT GW) | private-subnet-a 10.20.2.0/24
 *   └── AZ b: public-subnet-b 10.20.3.0/24 (NAT GW) | private-subnet-b 10.20.4.0/24
 *
 * Steps:
 *   1. Create the VPC (10.20.0.0/16) with DNS support and DNS hostnames enabled.
 *
 *   2. Create the internet gateway, attach it to the VPC, and create the
 *      public route table with a default route to the internet gateway
 *      → createInternetGatewayAndPublicRouteTable()
 *
 *   3. Availability Zone a (ca-central-1a)
 *      3.1 Create public subnet A (10.20.1.0/24) and associate it with
 *          the public route table → createPublicSubnet()
 *      3.2 Create the NAT gateway in public subnet A, then private subnet A
 *          (10.20.2.0/24) with its own route table pointing to that NAT
 *          gateway → createNatGatewayAndPrivateSubnet()
 *
 *   4. Availability Zone b (ca-central-1b), same pattern as AZ a
 *      4.1 Create public subnet B (10.20.3.0/24) → createPublicSubnet()
 *      4.2 Create the NAT gateway in public subnet B, then private subnet B
 *          (10.20.4.0/24) → createNatGatewayAndPrivateSubnet()
 *
 * Result:
 *   - Public subnets reach the internet directly (for the ALB and NAT gateways).
 *   - Private subnets have outbound-only internet access through the NAT
 *     gateway in the same AZ (for EC2 and RDS).
 *
 * The VPC and the 4 subnets are public properties, for use by the other constructs.
 */

import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

interface SubnetConfig {
  cidr: string;
  az: string;
  name: string;
}

export class Network extends Construct {
  public readonly vpc: ec2.CfnVPC;
  public readonly publicSubnetA: ec2.CfnSubnet;
  public readonly privateSubnetA: ec2.CfnSubnet;
  public readonly publicSubnetB: ec2.CfnSubnet;
  public readonly privateSubnetB: ec2.CfnSubnet;

  private publicRouteTable!: ec2.CfnRouteTable;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // 1. Create the VPC (10.20.0.0/16) with DNS support and DNS hostnames enabled.
    this.vpc = new ec2.CfnVPC(this, 'MyVpc', {
      cidrBlock: '10.20.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [
        {
          key: 'Name',
          value: 'my-vpc',
        },
      ],
    });

    // 2. Create the internet gateway and attach it to the VPC.
    this.publicRouteTable = this.createInternetGatewayAndPublicRouteTable();

    // ============================================================
    // 3. Availability Zone a (ca-central-1a)
    // ============================================================

    // 3.1. Create public subnet A (10.20.1.0/24) and associate it with the public route table
    this.publicSubnetA = this.createPublicSubnet('PublicSubnetA', {
      cidr: '10.20.1.0/24',
      az: 'ca-central-1a',
      name: 'public-subnet-a',
    });

    // 3.2 Create the NAT gateway in public subnet A, then private subnet A (10.20.2.0/24) 
    //     with its own route table pointing to that NAT gateway
    this.privateSubnetA = this.createNatGatewayAndPrivateSubnet(
      'PrivateSubnetA',
      {
        cidr: '10.20.2.0/24',
        az: 'ca-central-1a',
        name: 'private-subnet-a',
      },
      this.publicSubnetA
    );

    // ============================================================
    // 4. Availability Zone b (ca-central-1b)
    // ============================================================

    // 4.1. Create public subnet A (10.20.3.0/24) and associate it with the public route table
    this.publicSubnetB = this.createPublicSubnet('PublicSubnetB', {
      cidr: '10.20.3.0/24',
      az: 'ca-central-1b',
      name: 'public-subnet-b',
    });

    // 4.2 Create the NAT gateway in public subnet A, then private subnet A (10.20.4.0/24) 
    //     with its own route table pointing to that NAT gateway
    this.privateSubnetB = this.createNatGatewayAndPrivateSubnet(
      'PrivateSubnetB',
      {
        cidr: '10.20.4.0/24',
        az: 'ca-central-1b',
        name: 'private-subnet-b',
      },
      this.publicSubnetB
    );
    
  }


  /**
   * Creates the internet access for the public subnets.
   *
   * Steps:
   *   1. Create the internet gateway (Name tag: my-internet-gateway).
   *   2. Attach the internet gateway to the VPC.
   *   3. Create the public route table in the VPC (Name tag: public-rt).
   *   4. Add a default route (0.0.0.0/0) in that table pointing to the
   *      internet gateway, so all non-local traffic goes to the internet.
   *
   * Returns the public route table, so the public subnets can be
   * associated with it.
   */

  private createInternetGatewayAndPublicRouteTable(): ec2.CfnRouteTable {

     // 1. Create the internet gateway (Name tag: my-internet-gateway).
    const internetGateway = new ec2.CfnInternetGateway(this, 'MyIGW', {
      tags: [
        {
          key: 'Name',
          value: 'my-internet-gateway',
        },
      ],
    });

    // 2. Attach the internet gateway to the VPC.
    new ec2.CfnVPCGatewayAttachment(this, 'VPCIGWAttachment', {
        vpcId: this.vpc.ref,
        internetGatewayId: internetGateway.ref,
    });

    // 3. Create the public route table in the VPC (Name tag: public-rt).
    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: this.vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'public-rt',
        },
      ],
    });

    // 4. Add a default route (0.0.0.0/0) in that table pointing to the internet gateway
    new ec2.CfnRoute(this, 'PublicDefaultRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: internetGateway.ref,
    });

    return publicRouteTable;
  }


  /**
   * Creates one public subnet and connects it to the internet.
   *
   * Steps:
   *   1. Create the subnet in the VPC, using the CIDR block, Availability Zone
   *      and Name tag from cfg.
   *      - mapPublicIpOnLaunch: true → instances launched here get a public IP.
   *   2. Associate the subnet with the shared public route table
   *      (default route 0.0.0.0/0 → internet gateway).
   *      - Construct ID of the association: `${id}Assoc`.
   *
   * Returns the subnet, so it can be used for the NAT gateway, the ALB
   * and other constructs.
   *
   * Requires: this.vpc and this.publicRouteTable must be created
   * before this method is called.
   */

  private createPublicSubnet(id: string, cfg: SubnetConfig): ec2.CfnSubnet {
    // 1. Create the subnet in the VPC
    const subnet = new ec2.CfnSubnet(this, id, {
      vpcId: this.vpc.ref,
      cidrBlock: cfg.cidr,
      availabilityZone: cfg.az,
      mapPublicIpOnLaunch: true,
      tags: [
        {
          key: 'Name',
          value: cfg.name,
        },
      ],
    });

    // 2. Associate the subnet with the shared public route table
    new ec2.CfnSubnetRouteTableAssociation(this, `${id}Assoc`, {
      subnetId: subnet.ref,
      routeTableId: this.publicRouteTable.ref,
    });

    return subnet;
  }

  /**
   * Creates the NAT gateway for one AZ and the private subnet that uses it.
   *
   * Steps:
   *   1. Allocate an Elastic IP for the NAT gateway (Name: <cfg.name>-eip).
   *   2. Create the NAT gateway in the given public subnet, using that
   *      Elastic IP (Name: <cfg.name>-nat).
   *   3. Create the private subnet in the VPC, using the CIDR block,
   *      Availability Zone and Name tag from cfg.
   *      - mapPublicIpOnLaunch: false → instances get no public IP.
   *   4. Create a private route table for this subnet (Name: <cfg.name>-rt).
   *   5. Add a default route (0.0.0.0/0) to the NAT gateway, so instances
   *      can reach the internet for outbound traffic only (updates, APIs).
   *   6. Associate the route table with the private subnet.
   *
   * Returns the private subnet, for use by EC2, RDS and other constructs.
   *
   * Note: publicSubnet must be in the same AZ as cfg.az, so each AZ has
   * its own NAT gateway and keeps internet access if another AZ fails.
   */

  private createNatGatewayAndPrivateSubnet(
    id: string,
    cfg: SubnetConfig,
    publicSubnet: ec2.CfnSubnet
  ): ec2.CfnSubnet {
    // 1. Allocate an Elastic IP for the NAT gateway.
    const eip = new ec2.CfnEIP(this, `${id}Eip`, {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: `${cfg.name}-eip`,
        },
      ],
    });

    // 2. Create the NAT gateway in the given public subnet
    const nat = new ec2.CfnNatGateway(this, `${id}Nat`, {
      subnetId: publicSubnet.ref,
      allocationId: eip.attrAllocationId,
      tags: [
        { 
          key: 'Name', 
          value: `${cfg.name}-nat` 
        }
      ],
    });

    // 3. Create the private subnet in the VPC
    const subnet = new ec2.CfnSubnet(this, id, {
      vpcId: this.vpc.ref,
      cidrBlock: cfg.cidr,
      availabilityZone: cfg.az,
      mapPublicIpOnLaunch: false,
      tags: [
        { 
          key: 'Name', 
          value: cfg.name 
        }
      ],
    });

    // 4. Create a private route table for this subnet
    const rt = new ec2.CfnRouteTable(this, `${id}Rt`, {
      vpcId: this.vpc.ref,
      tags: [
        { 
          key: 'Name', 
          value: `${cfg.name}-rt` 
        }
      ],
    });

    // 5. Add a default route (0.0.0.0/0) to the NAT gateway
    new ec2.CfnRoute(this, `${id}DefaultRoute`, {
      routeTableId: rt.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: nat.ref,
    });

    // 6. Associate the route table with the private subnet.
    new ec2.CfnSubnetRouteTableAssociation(this, `${id}RtAssoc`, {
      subnetId: subnet.ref,
      routeTableId: rt.ref,
    });

    return subnet;
  }

}


