import * as cdk from "aws-cdk-lib";
import { RepositoryEncryption } from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as msk from "@aws-cdk/aws-msk-alpha";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { LogGroup } from "aws-cdk-lib/aws-logs";

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
    const fargateSecurityGroup = new ec2.SecurityGroup(
      this,
      "FargateSecurityGroup",
      {
        vpc: vpc,
        securityGroupName: "fargateSecurityGroup",
        allowAllOutbound: true,
      }
    );
    kafkaSecurityGroup.connections.allowFrom(
      lambdaSecurityGroup,
      ec2.Port.allTraffic(),
      "allowFromLambdaToKafka"
    );
    kafkaSecurityGroup.connections.allowFrom(
      fargateSecurityGroup,
      ec2.Port.allTraffic(),
      "allowFromFargateToKafka"
    );
    lambdaSecurityGroup.connections.allowFrom(
      kafkaSecurityGroup,
      ec2.Port.allTraffic(),
      "allowFromKafkaToLambda"
    );
    fargateSecurityGroup.connections.allowFrom(
      kafkaSecurityGroup,
      ec2.Port.allTraffic(),
      "allowFromKafkaToFargate"
    );
    // MSK - Provisioned (NB: ~45 minutes to deploy)
    const kafkaBrokerLogGroup = new LogGroup(this, "KafkaLogGroup");
    const kafkaCluster = new msk.Cluster(this, "MskCluster2", {
      clusterName: "kafka-cluster-prov2",
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      }),
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
      logging: {
        cloudwatchLogGroup: kafkaBrokerLogGroup,
      },
    });

    // ECR Repo
    const producerRepo = new cdk.aws_ecr.Repository(this, "ProducerRepo", {
      repositoryName: "msk-eda-producer",
      encryption: RepositoryEncryption.KMS,
      encryptionKey: key,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      lifecycleRules: [
        {
          maxImageCount: 3,
        },
      ],
    });
    const consumerRepo = new cdk.aws_ecr.Repository(this, "ConsumerRepo", {
      repositoryName: "msk-eda-consumer",
      encryption: RepositoryEncryption.KMS,
      encryptionKey: key,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      lifecycleRules: [
        {
          maxImageCount: 3,
        },
      ],
    });

    // Producer Lambda
    const kafkaTopicName = "trade-events";
    const producerFunction = new lambda.DockerImageFunction(
      this,
      "ProducerImageFunction",
      {
        functionName: "msk-producer",
        code: lambda.DockerImageCode.fromEcr(producerRepo, {
          tagOrDigest:
            "sha256:1c1347368f3c5680ca3568528fb362cb962ee7556f2aad426631ba1df955aef1",
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
        resources: [kafkaCluster.clusterArn],
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

    // Schema Registry AuthZ
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
    // Kafka consumer app
    const ecsCluster = new ecs.Cluster(this, "EcsCluster", {
      clusterName: "msk-eda-ecs-cluster",
      containerInsights: true,
      vpc: vpc,
    });
    const consumerTaskDefn = new ecs.FargateTaskDefinition(
      this,
      "KafkaConsumerFg",
      {
        cpu: 256,
        memoryLimitMiB: 2048,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      }
    );
    consumerTaskDefn.addContainer("ConsumerTaskDefn", {
      image: ecs.ContainerImage.fromEcrRepository(
        consumerRepo,
        "sha256:2528176b204f7c1d3f0b4f88d4bd4d8de36ecb094223bd913de9d156fb5dd358"
      ),

      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "msk-eda-consumer",
      }),
      environment: {
        KAFKA_CLUSTER_ARN: kafkaCluster.clusterArn,
        KAFKA_TOPIC: kafkaTopicName,
      },
    });
    consumerTaskDefn.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["kafka:GetBootstrapBrokers", "kafka-cluster:Connect"],
        resources: [kafkaCluster.clusterArn],
      })
    );
    consumerTaskDefn.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "kafka-cluster:Connect",
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:DescribeGroup",
          "kafka-cluster:AlterGroup",
          "kafka-cluster:ReadData",
        ],
        resources: [
          kafkaCluster.clusterArn,
          `arn:aws:kafka:${region}:${accountId}:topic/${kafkaCluster.clusterName}/*${kafkaTopicName}`,
          `arn:aws:kafka:${region}:${accountId}:group/${kafkaCluster.clusterName}/*msk-eda-consumer-group`,
        ],
      })
    );
    consumerTaskDefn.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["glue:GetSchemaByDefinition", "glue:GetSchemaVersion"],
        resources: ["*"],
      })
    );
    new ecs.FargateService(this, "EcsFgService", {
      cluster: ecsCluster,
      taskDefinition: consumerTaskDefn,
      securityGroups: [fargateSecurityGroup],
      desiredCount: 1,
    });
  }
}
