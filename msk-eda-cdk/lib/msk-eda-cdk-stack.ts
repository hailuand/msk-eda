import * as cdk from "aws-cdk-lib";
import { RepositoryEncryption } from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as msk from "aws-cdk-lib/aws-msk";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

export class MskEdaCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const key = new cdk.aws_kms.Key(this, "AppKey", {
      enabled: true,
    });

    const vpc = new ec2.Vpc(this, "Vpc");
    const kafkaSecurityGroup = new ec2.SecurityGroup(
      this,
      "KafkaSecurityGroup",
      {
        vpc: vpc,
        securityGroupName: "kafkaSecurityGroup",
        allowAllOutbound: true,
      }
    );
    const lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      "LambdaSecurityGroup",
      {
        vpc: vpc,
        securityGroupName: "lambdaSecurityGroup",
        allowAllOutbound: true,
      }
    );
    kafkaSecurityGroup.connections.allowFrom(
      lambdaSecurityGroup,
      ec2.Port.allTraffic(),
      "allowFromLambdaToKafka"
    );
    // MSK
    const kafkaCluster = new msk.CfnServerlessCluster(this, "MskCluster", {
      clusterName: "kafka-cluster",
      clientAuthentication: {
        sasl: {
          iam: {
            enabled: true,
          },
        },
      },
      vpcConfigs: [
        {
          securityGroups: [kafkaSecurityGroup.securityGroupId],
          subnetIds: [
            ...vpc.selectSubnets({
              subnetType: ec2.SubnetType.PUBLIC,
            }).subnetIds,
          ],
        },
      ],
    });
    // ECR Repo
    const proCoRepo = new cdk.aws_ecr.Repository(this, "Repository", {
      repositoryName: "msk-eda-proco",
      encryption: RepositoryEncryption.KMS,
      encryptionKey: key,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    // Producer Lambda
    const producerFunction = new lambda.DockerImageFunction(
      this,
      "ProducerImageFunction",
      {
        functionName: "msk-producer",
        code: lambda.DockerImageCode.fromEcr(proCoRepo, {
          tagOrDigest:
            "sha256:ac9d5f4b5d2935468adde03b97a4ffb8de02ade377c47c6345d97e7aa51c7b22",
          cmd: [
            "com.hailua.demo.msk.producer.ProduceEventLambda::handleRequest",
          ],
        }),
        architecture: lambda.Architecture.ARM_64,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(2),
        environmentEncryption: key,
        vpc: vpc,
        securityGroups: [lambdaSecurityGroup],
        environment: {
          KAFKA_CLUSTER_ARN: kafkaCluster.attrArn,
          KAFKA_TOPIC: "trade-events",
        },
      }
    );
    // kafkaCluster.
    producerFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["kafka:*"],
        resources: [kafkaCluster.ref],
      })
    );
  }
}
