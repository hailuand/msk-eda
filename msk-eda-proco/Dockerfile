FROM eclipse-temurin:17-jdk-jammy

WORKDIR app/

COPY target/msk-eda-proco-1.0-SNAPSHOT-shaded.jar .

ENTRYPOINT [ "java", "-jar", "msk-eda-proco-1.0-SNAPSHOT-shaded.jar", "com.hailua.demo.msk.producer.ProduceEventLambda" ]