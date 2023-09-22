FROM eclipse-temurin:17-jre-jammy

ENV WORKING_DIR="app"
WORKDIR $WORKING_DIR

COPY target/msk-eda-producer-*-shaded.jar $WORKING_DIR/msk-eda-producer.jar
ENV CLASSPATH=$WORKING_DIR/*:$CLASSPATH

ENTRYPOINT [ "java", "com.amazonaws.services.lambda.runtime.api.client.AWSLambda" ]