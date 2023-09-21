package com.hailua.demo.msk.consumer;

import com.amazonaws.services.kafka.AWSKafka;
import com.amazonaws.services.kafka.AWSKafkaClientBuilder;
import com.amazonaws.services.kafka.model.GetBootstrapBrokersRequest;
import com.amazonaws.services.kafka.model.GetBootstrapBrokersResult;
import com.amazonaws.services.schemaregistry.deserializers.avro.AWSKafkaAvroDeserializer;
import com.amazonaws.services.schemaregistry.utils.AWSSchemaRegistryConstants;
import com.amazonaws.services.schemaregistry.utils.AvroRecordType;
import com.hailua.demo.msk.TradeEvent;
import com.hailua.demo.msk.producer.KafkaBase;
import java.time.Duration;
import java.util.Collections;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringDeserializer;

@Slf4j
public class ConsumeEvents extends KafkaBase {
    public static void main(String[] args) {
        log.info("Initializing consumer.");
        AWSKafka client = AWSKafkaClientBuilder.defaultClient();
        GetBootstrapBrokersRequest getBootstrapBrokersRequest = new GetBootstrapBrokersRequest();
        getBootstrapBrokersRequest.setClusterArn(KafkaBase.KAFKA_CLUSTER_ARN);
        log.info("Looking up Kafka bootstrap brokers.");
        GetBootstrapBrokersResult getBootstrapBrokersResult = client.getBootstrapBrokers(getBootstrapBrokersRequest);
        log.info("Bootstrap brokers result: {}", getBootstrapBrokersResult);
        String bootstrapBrokersString = getBootstrapBrokersResult.getBootstrapBrokerStringSaslIam();
        try (KafkaConsumer<String, TradeEvent> consumer = new KafkaConsumer<>(consumerConfig(bootstrapBrokersString))) {
            consumer.subscribe(Collections.singleton(KafkaBase.TOPIC_NAME));
            while (true) {
                ConsumerRecords<String, TradeEvent> consumerRecords = consumer.poll(Duration.ofMillis(1000L));
                consumerRecords
                        .records(KafkaBase.TOPIC_NAME)
                        .forEach(r -> log.info(
                                "Look at this event that I got! {}", r.value().getID()));
            }
        }
    }

    private static Map<String, Object> consumerConfig(String bootstrapBrokersString) {
        Map<String, Object> consumerSpecificConfig = Map.of(
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,
                StringDeserializer.class.getName(),
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
                AWSKafkaAvroDeserializer.class.getName(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,
                OffsetResetStrategy.EARLIEST.toString(),
                ConsumerConfig.GROUP_ID_CONFIG,
                "msk-eda-consumer-group",
                AWSSchemaRegistryConstants.AWS_REGION,
                System.getenv(KafkaBase.AWS_REGION_PROP),
                AWSSchemaRegistryConstants.AVRO_RECORD_TYPE,
                AvroRecordType.SPECIFIC_RECORD.name());
        return Stream.concat(
                        KafkaBase.adminClientConfig(bootstrapBrokersString).entrySet().stream(),
                        consumerSpecificConfig.entrySet().stream())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }
}
