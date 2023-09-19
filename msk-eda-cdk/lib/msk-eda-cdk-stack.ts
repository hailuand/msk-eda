import * as cdk from "aws-cdk-lib";
import { RepositoryEncryption } from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export class MskEdaCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const key = new cdk.aws_kms.Key(this, "AppKey", {
      enabled: true,
    });

    const proCoRepo = new cdk.aws_ecr.Repository(this, "Repository", {
      repositoryName: "msk-eda-proco",
      encryption: RepositoryEncryption.KMS,
      encryptionKey: key,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    // Producer Lambda
    new lambda.DockerImageFunction(this, "ProducerImageFunction", {
      functionName: "msk-producer",
      code: lambda.DockerImageCode.fromEcr(proCoRepo, {
        tagOrDigest: "latest",
        cmd: ["com.hailua.demo.msk.producer.ProduceEventLambda::handleRequest"],
      }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.minutes(2),
      environmentEncryption: key,
    });
  }
}
