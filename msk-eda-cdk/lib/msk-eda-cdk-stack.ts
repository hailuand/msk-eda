import * as cdk from "aws-cdk-lib";
import { RepositoryEncryption } from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "path";
import * as ecrdeploy from "cdk-ecr-deployment";

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
    const proCoImageAsset = new DockerImageAsset(this, "ProCoLambdaImage", {
      directory: path.join(__dirname, "../../msk-eda-proco/"),
      assetName: "proco-lambda-image",
    });
    new ecrdeploy.ECRDeployment(this, "DeployProCoLambda", {
      src: new ecrdeploy.DockerImageName(proCoImageAsset.imageUri),
      dest: new ecrdeploy.DockerImageName(`${proCoRepo.repositoryUri}:latest`),
    });
  }
}
