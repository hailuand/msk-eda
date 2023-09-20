package com.hailua.demo.msk.producer;

import java.util.Map;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.common.config.SaslConfigs;
import org.apache.kafka.common.security.auth.SecurityProtocol;
import software.amazon.msk.auth.iam.IAMClientCallbackHandler;
import software.amazon.msk.auth.iam.IAMLoginModule;

public abstract class KafkaBase {
    protected Map<String, Object> adminClientConfig(final String bootstrapBrokersString) {
        return Map.of(
                AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG,
                bootstrapBrokersString,
                AdminClientConfig.SECURITY_PROTOCOL_CONFIG,
                SecurityProtocol.SASL_SSL.name(),
                SaslConfigs.SASL_MECHANISM,
                "AWS_MSK_IAM",
                SaslConfigs.SASL_JAAS_CONFIG,
                IAMLoginModule.class.getName() + " required;",
                SaslConfigs.SASL_CLIENT_CALLBACK_HANDLER_CLASS,
                IAMClientCallbackHandler.class.getName());
    }

    protected AdminClient createAdminClient(String bootstrapBrokersString) {
        return AdminClient.create(adminClientConfig(bootstrapBrokersString));
    }
}
