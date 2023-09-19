FROM eclipse-temurin:17-jdk-jammy

ENV WORKING_DIR="app"
WORKDIR $WORKING_DIR

COPY target/msk-eda-proco-*-shaded.jar $WORKING_DIR/msk-eda-proco.jar
ENV CLASSPATH=$WORKING_DIR/*:$CLASSPATH

ENTRYPOINT [ "java", "com.amazonaws.services.lambda.runtime.api.client.AWSLambda" ]