FROM eclipse-temurin:17-jre-jammy

ENV WORKING_DIR="app"
WORKDIR $WORKING_DIR

COPY target/msk-eda-consumer-*-shaded.jar $WORKING_DIR/msk-eda-consumer.jar
ENV CLASSPATH=$WORKING_DIR/*:$CLASSPATH

ENTRYPOINT ["java", "com.hailua.demo.msk.consumer.ConsumeEvents"]