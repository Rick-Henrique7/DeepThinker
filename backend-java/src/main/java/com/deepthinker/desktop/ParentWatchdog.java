package com.deepthinker.desktop;

import java.io.IOException;
import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * No app desktop, desliga este backend quando a janela some, mesmo que ela feche à força
 * (Gerenciador de Tarefas, travamento).
 *
 * Como funciona: o app Tauri inicia o Java com um "cano" (pipe) ligado à entrada padrão.
 * Enquanto o app estiver vivo, o cano fica aberto e a leitura espera. Quando o app morre,
 * o sistema fecha o cano, a leitura devolve "fim" (-1) e encerramos o Spring.
 *
 * Ligado por DEEPTHINKER_WATCH_STDIN=true, que só o app desktop passa.
 */
@Component
@ConditionalOnProperty(name = "deepthinker.desktop.watch-stdin", havingValue = "true")
public class ParentWatchdog {

    private static final Logger log = LoggerFactory.getLogger(ParentWatchdog.class);

    private final ApplicationContext context;

    public ParentWatchdog(ApplicationContext context) {
        this.context = context;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void start() {
        Thread.ofPlatform().daemon().name("parent-watchdog").start(() -> {
            try (InputStream in = System.in) {
                while (in.read() != -1) {
                    // ignoramos qualquer coisa que chegue; só importa o fim
                }
            } catch (IOException e) {
                // cano quebrado também significa que o app fechou
            }
            log.info("O app desktop fechou; desligando o backend.");
            System.exit(SpringApplication.exit(context, () -> 0));
        });
    }
}
