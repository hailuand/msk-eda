import * as cdk from "aws-cdk-lib";
import { RepositoryEncryption } from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as msk from "@aws-cdk/aws-msk-alpha";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as glue from "aws-cdk-lib/aws-glue";
import {
  Effect,
  ManagedPolicy,
  Policy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { log } from "console";

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
    // MSK - Provisioned (NB: ~45 minutes to deploy)
    const kafkaCluster = new msk.Cluster(this, "MskCluster", {
      clusterName: "kafka-cluster-prov",
      vpc: vpc,
      kafkaVersion: msk.KafkaVersion.V3_4_0,
      instanceType: new ec2.InstanceType("kafka.t3.small"),
      encryptionInTransit: {
        enableInCluster: true,
      },
      clientAuthentication: {
        saslProps: {
          iam: true,
        },
      },
      ebsStorageInfo: {
        encryptionKey: key,
        volumeSize: 5,
      },
      securityGroups: [kafkaSecurityGroup],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // MSK - Serverless (NB - quick to deploy :))
    /**
    const kafkaCluster = new msk.CfnServerlessCluster(this, "MskCluster", {
      clusterName: "kafka-cluste-svlss",
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
    */

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
    const kafkaTopicName = "trade-events";
    const producerFunction = new lambda.DockerImageFunction(
      this,
      "ProducerImageFunction",
      {
        functionName: "msk-producer",
        code: lambda.DockerImageCode.fromEcr(proCoRepo, {
          tagOrDigest:
            "sha256:eb007e48f770dc777158370db3ad14e50c9adc5b9ed12bec90b028dbb39b53c0",
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
          KAFKA_CLUSTER_ARN: kafkaCluster.clusterArn,
          KAFKA_TOPIC: kafkaTopicName,
        },
      }
    );

    producerFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["kafka:GetBootstrapBrokers", "kafka-cluster:Connect"],
        resources: [kafkaCluster.clusterArn], // MSK - Provisioned
        // resources: [kafkaCluster.ref], // MSK - Serverless
      })
    );
    // The following were pulled after the fact to avoid having to cdk destroy + cdk bootstrap.
    // This could be avoided by uncommenting DEFAULT_ACCOUNT and DEFAULT_REGION
    const region = "us-east-1";
    const accountId = "443535183963";

    producerFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "kafka-cluster:CreateTopic",
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:DescribeTopicDynamicConfiguration",
          "kafka-cluster:WriteData",
          "kafka-cluster:WriteDataIdempotently",
        ],
        resources: [
          kafkaCluster.clusterArn,
          `arn:aws:kafka:${region}:${accountId}:topic/${kafkaCluster.clusterName}/*${kafkaTopicName}`,
        ],
      })
    );

    // Schema Registry authz
    producerFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "glue:GetSchemaByDefinition",
          "glue:CreateSchema",
          "glue:RegisterSchemaVersion",
          "glue:PutSchemaVersionMetadata",
        ],
        resources: [
          "*", // Only wildcard supported due to https://github.com/awslabs/aws-glue-schema-registry/issues/68
        ],
      })
    );
  }
}
