/**
 * Database layer (CDK L1 / Cfn resources)
 *
 * Steps:
 *   1. Create the database credentials in AWS Secrets Manager (cfnDbSecret)
 *      - Username is fixed to "dbuser".
 *      - Password is generated automatically and stored under the "password" key.
 *      - Characters " @ / \ are excluded, because RDS does not allow them in passwords.
 *
 *   2. Create a DB subnet group in the private subnets (cfnDbSubnetGroup)
 *      - Uses props.privateSubnetIds so the database is not reachable from the internet.
 *      - RDS needs a subnet group to know which subnets it can use.
 *
 *   3. Create the RDS PostgreSQL instance (cfnDbInstance)
 *      - Placed in the subnet group from step 2.
 *      - Uses the username and password from the secret in step 1.
 */

import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface DatabaseProps {
  vpcId: string;
  privateSubnetIds: string[];
  dbSecurityGroupId: string;
  multiAz?: boolean;
  allocatedStorage?: number; // default 20 GB
}

export class Database extends Construct {
  public readonly secret: secretsmanager.CfnSecret;
  public readonly dbSubnetGroup: rds.CfnDBSubnetGroup;
  public readonly dbInstance: rds.CfnDBInstance;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const dbStorage = props.allocatedStorage ?? 20;
    const multiAz = props.multiAz ?? false;
    const dbEngine = this.node.tryGetContext('rdsEngineType') ?? 'postgres';
    const dbInstanceType = this.node.tryGetContext('rdsInstanceType') ?? 'db.t3.micro';

    // 1. Create the database credentials in AWS Secrets Manager (cfnDbSecret)
    this.secret = new secretsmanager.CfnSecret(this, 'cfnDbSecret', {
        name: 'cfnDbSecret',
        generateSecretString: {
            secretStringTemplate: JSON.stringify({ username: 'dbuser' }),
            generateStringKey: 'password',
            excludeCharacters: '"@/\\',
        },
    });

    // 2. Create a DB subnet group in the private subnets (cfnDbSubnetGroup)
    this.dbSubnetGroup = new rds.CfnDBSubnetGroup(this, 'cfnDbSubnetGroup', {
        dbSubnetGroupName: 'cfnDbSubnetGroup',
        subnetIds: props.privateSubnetIds,
        dbSubnetGroupDescription: 'Private subnets for RDS',
    });

    // 3. Create the RDS PostgreSQL instance (cfnDbInstance)
    this.dbInstance = new rds.CfnDBInstance(this, 'cfnDbInstance', {
        dbInstanceIdentifier: 'cfnDbInstance',

        engine: dbEngine,
        dbInstanceClass: dbInstanceType,

        allocatedStorage: String(dbStorage),
        storageType: 'gp2',
        storageEncrypted: true,   // enable encryption

        multiAz: multiAz,

        masterUsername:
            '{{resolve:secretsmanager:' +
            this.secret.ref +
            ':SecretString:username}}',

        masterUserPassword:
            '{{resolve:secretsmanager:' +
            this.secret.ref +
            ':SecretString:password}}',

        vpcSecurityGroups: [props.dbSecurityGroupId],
        dbSubnetGroupName: this.dbSubnetGroup.dbSubnetGroupName,

        publiclyAccessible: false,
    });

  }
}
