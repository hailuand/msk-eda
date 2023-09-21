package com.hailua.demo.msk.producer;

import com.amazonaws.services.kafka.AWSKafka;
import com.amazonaws.services.kafka.AWSKafkaClientBuilder;
import com.amazonaws.services.kafka.model.GetBootstrapBrokersRequest;
import com.amazonaws.services.kafka.model.GetBootstrapBrokersResult;
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.schemaregistry.serializers.avro.AWSKafkaAvroSerializer;
import com.amazonaws.services.schemaregistry.utils.AWSSchemaRegistryConstants;
import com.amazonaws.services.schemaregistry.utils.AvroRecordType;
import com.hailua.demo.msk.TradeEvent;
import com.hailua.demo.msk.TradeType;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.record.CompressionType;
import org.apache.kafka.common.serialization.StringSerializer;
import software.amazon.awssdk.services.glue.model.Compatibility;

@Slf4j
public class ProduceEventLambda extends KafkaBase implements RequestHandler<Void, Void> {
    private final String KAFKA_CLUSTER_ARN = System.getenv("KAFKA_CLUSTER_ARN");
    private final String TOPIC_NAME = System.getenv("KAFKA_TOPIC");

    private KafkaProducer<String, TradeEvent> producer;

    @Override
    public Void handleRequest(Void unused, Context context) {
        initProducer();
        List<TradeEvent> tradeEvents = generateEvents();
        log.info("{} trade events to publish.", tradeEvents.size());
        tradeEvents.stream()
                .map(te -> new ProducerRecord<>(TOPIC_NAME, te.getID().toString(), te))
                .forEach(pr -> {
                    log.info("Publishing event {}.", pr.key());
                    producer.send(pr);
                });
        log.info("Flushing Producer before function end.");
        producer.flush();
        log.info("Flushed.");

        return null;
    }

    private void initProducer() {
        if (producer != null) {
            return;
        }

        log.info("Initializing Producer.");
        AWSKafka client = AWSKafkaClientBuilder.defaultClient();
        GetBootstrapBrokersRequest getBootstrapBrokersRequest = new GetBootstrapBrokersRequest();
        getBootstrapBrokersRequest.setClusterArn(KAFKA_CLUSTER_ARN);
        log.info("Looking up Kafka bootstrap brokers.");
        GetBootstrapBrokersResult getBootstrapBrokersResult = client.getBootstrapBrokers(getBootstrapBrokersRequest);
        log.info("Bootstrap brokers result: {}", getBootstrapBrokersResult);
        String bootstrapBrokersString = getBootstrapBrokersResult.getBootstrapBrokerStringSaslIam();

        try (AdminClient adminClient = createAdminClient(bootstrapBrokersString)) {
            ListTopicsOptions lto = new ListTopicsOptions();
            lto.timeoutMs((int) TimeUnit.MINUTES.toMillis(2));
            ListTopicsResult listTopicsResult = adminClient.listTopics(lto);
            Set<String> topics = listTopicsResult.names().get();
            log.info("Topics: {}", topics);
            if (!topics.contains(TOPIC_NAME)) {
                log.info("Topic {} does not exist. Creating...", TOPIC_NAME);
                NewTopic newTopic = new NewTopic(TOPIC_NAME, 1, (short) 2);
                CreateTopicsResult result = adminClient.createTopics(Collections.singleton(newTopic));
                result.all().get();
            }
        } catch (ExecutionException | InterruptedException e) {
            throw new RuntimeException(e);
        }

        producer = new KafkaProducer<>(producerConfig(bootstrapBrokersString));
        log.info("Producer initialization complete.");
    }

    private Map<String, Object> producerConfig(String bootstrapBrokersString) {
        Map<String, Object> writeSpecificConfig = Map.of(
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,
                StringSerializer.class.getName(),
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG,
                AWSKafkaAvroSerializer.class.getName(),
                ProducerConfig.LINGER_MS_CONFIG,
                20,
                ProducerConfig.COMPRESSION_TYPE_CONFIG,
                CompressionType.GZIP.name,
                AWSSchemaRegistryConstants.AWS_REGION,
                System.getenv("AWS_REGION"),
                AWSSchemaRegistryConstants.AVRO_RECORD_TYPE,
                AvroRecordType.SPECIFIC_RECORD.name(),
                AWSSchemaRegistryConstants.SCHEMA_AUTO_REGISTRATION_SETTING,
                true,
                AWSSchemaRegistryConstants.COMPATIBILITY_SETTING,
                Compatibility.BACKWARD,
                AWSSchemaRegistryConstants.COMPRESSION_TYPE,
                AWSSchemaRegistryConstants.COMPRESSION.ZLIB.name());
        return Stream.concat(
                        adminClientConfig(bootstrapBrokersString).entrySet().stream(),
                        writeSpecificConfig.entrySet().stream())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private static List<TradeEvent> generateEvents() {
        Random random = new Random();
        List<TradeEvent> buyEvents = IntStream.range(0, random.nextInt(200))
                .mapToObj(i -> TradeEvent.newBuilder()
                        .setEventTime(Instant.ofEpochMilli(System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(i)))
                        .setID(UUID.randomUUID().toString())
                        .setType(TradeType.BUY)
                        .build())
                .toList();
        List<TradeEvent> sellEvents = IntStream.range(0, random.nextInt(200))
                .mapToObj(i -> TradeEvent.newBuilder()
                        .setEventTime(Instant.ofEpochMilli(System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(i)))
                        .setID(UUID.randomUUID().toString())
                        .setType(TradeType.SELL)
                        .build())
                .toList();
        return Stream.concat(buyEvents.stream(), sellEvents.stream()).toList();
    }
}
