# MSK - Event Driven Architecture Playground

## Goal
To get familiar with process to build an event-driven architecture
using AWS Managed Streaming Kafka.
1. Create a MSK serverless cluster using CDK.
2. Create a Kafka producer function to publishes Avro messages to cluster.
3. Create a Kafka consumer function hooked into above topic as an event-source.
4. Build producer/consumer as image