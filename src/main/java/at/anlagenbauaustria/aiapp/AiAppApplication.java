package at.anlagenbauaustria.aiapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AiAppApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiAppApplication.class, args);
    }
}
