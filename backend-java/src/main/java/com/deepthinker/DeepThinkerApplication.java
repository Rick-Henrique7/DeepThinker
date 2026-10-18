package com.deepthinker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Ponto de entrada da API. O Spring Boot escaneia este pacote e os
 * subpacotes, encontra as classes anotadas (@RestController, @Service...)
 * e monta tudo sozinho.
 */
@SpringBootApplication
@ConfigurationPropertiesScan // procura os records @ConfigurationProperties (ex.: LlmProperties)
public class DeepThinkerApplication {

    public static void main(String[] args) {
        SpringApplication.run(DeepThinkerApplication.class, args);
    }
}
