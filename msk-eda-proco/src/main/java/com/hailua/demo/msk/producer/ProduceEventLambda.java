package com.hailua.demo.msk.producer;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.schemaregistry.serializers.avro.AWSKafkaAvroSerializer;
import com.amazonaws.services.schemaregistry.utils.AWSSchemaRegistryConstants;
import com.amazonaws.services.schemaregistry.utils.AvroRecordType;
import com.hailua.demo.msk.TradeEvent;
import com.hailua.demo.msk.TradeType;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import software.amazon.awssdk.services.glue.model.Compatibility;
import software.amazon.awssdk.services.glue.model.CompressionType;

@Slf4j
public class ProduceEventLambda implements RequestHandler<Void, Void> {
    private final KafkaProducer<String, TradeEvent> producer = new KafkaProducer<>(Map.of(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, System.getenv("kafka.bootstrap.servers"),
            ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName(),
            ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, AWSKafkaAvroSerializer.class.getName(),
            AWSSchemaRegistryConstants.AVRO_RECORD_TYPE, AvroRecordType.SPECIFIC_RECORD.name(),
            AWSSchemaRegistryConstants.AWS_REGION, System.getenv("aws.region"),
            AWSSchemaRegistryConstants.SCHEMA_NAME, "trade-event",
            AWSSchemaRegistryConstants.SCHEMA_AUTO_REGISTRATION_SETTING, true,
            AWSSchemaRegistryConstants.COMPATIBILITY_SETTING, Compatibility.BACKWARD.name(),
            AWSSchemaRegistryConstants.COMPRESSION_TYPE, CompressionType.GZIP.name()));
    private final String topic = System.getenv("kafka.topic.name");

    @Override
    public Void handleRequest(Void unused, Context context) {
        Random random = new Random();
        List<TradeEvent> buyEvents = IntStream.range(0, random.nextInt())
                .mapToObj(i -> TradeEvent.newBuilder()
                        .setEventTime(Instant.ofEpochMilli(System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(i)))
                        .setID(UUID.randomUUID().toString())
                        .setType(TradeType.BUY)
                        .build())
                .toList();
        List<TradeEvent> sellEvents = IntStream.range(0, random.nextInt())
                .mapToObj(i -> TradeEvent.newBuilder()
                        .setEventTime(Instant.ofEpochMilli(System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(i)))
                        .setID(UUID.randomUUID().toString())
                        .setType(TradeType.SELL)
                        .build())
                .toList();
        List<TradeEvent> tradeEvents =
                Stream.concat(buyEvents.stream(), sellEvents.stream()).toList();
        log.info("{} trade events to publish.", tradeEvents.size());
        tradeEvents.parallelStream()
                .map(te -> new ProducerRecord<>(topic, te.getID().toString(), te))
                .forEach(pr -> {
                    log.info("Publishing event {}.", pr.key());
                    producer.send(pr);
                });
        log.info("Flushing Producer before function end.");
        producer.flush();

        return null;
    }
}
