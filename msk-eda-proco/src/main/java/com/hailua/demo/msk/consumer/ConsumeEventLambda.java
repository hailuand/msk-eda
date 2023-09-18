package com.hailua.demo.msk.consumer;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.KafkaEvent;
import com.amazonaws.services.schemaregistry.deserializers.avro.AWSKafkaAvroDeserializer;
import com.amazonaws.services.schemaregistry.utils.AWSSchemaRegistryConstants;
import com.amazonaws.services.schemaregistry.utils.AvroRecordType;
import com.hailua.demo.msk.TradeEvent;
import java.util.Base64;
import java.util.Collection;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.Deserializer;
import org.apache.kafka.common.serialization.StringDeserializer;

@Slf4j
public class ConsumeEventLambda implements RequestHandler<KafkaEvent, Void> {
    private final Deserializer<?> deserializer;

    public ConsumeEventLambda() {
        this.deserializer = new AWSKafkaAvroDeserializer(Map.of(
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName(),
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, AWSKafkaAvroDeserializer.class.getName(),
                AWSSchemaRegistryConstants.AWS_REGION, System.getenv("aws.region"),
                AWSSchemaRegistryConstants.AVRO_RECORD_TYPE, AvroRecordType.SPECIFIC_RECORD.name()));
    }

    public static void main(String[] args) {
        log.info("Testing - Logger");
        System.out.println("Testing - SysOut");
    }

    @Override
    public Void handleRequest(KafkaEvent kafkaEvent, Context context) {
        kafkaEvent.getRecords().values().stream()
                .flatMap(Collection::stream)
                .parallel()
                .map(kafkaEventRecord -> (TradeEvent) deserializer.deserialize(
                        kafkaEventRecord.getTopic(), Base64.getDecoder().decode(kafkaEventRecord.getValue())))
                .forEach(tradeEvent -> log.info("Look what we have here! {}", tradeEvent));
        return null;
    }
}
