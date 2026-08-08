package at.anlagenbauaustria.aiapp.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

/**
 * Vite gibt jedem Build von index.html einen frischen Dateinamen fuer die
 * gebuendelten JS/CSS-Dateien (Content-Hash im Namen, z.B. index-Cy...js),
 * aber index.html selbst behaelt IMMER denselben Namen. Ohne explizite
 * Cache-Control-Header entscheidet der Browser nach eigenen Heuristiken, ob
 * er index.html cached - haelt er die alte Version im Cache, verweist sie
 * auf die alten (nicht mehr existierenden oder inhaltlich veralteten)
 * Bundle-Dateien, und ein Rebuild des Backends aendert am angezeigten Stand
 * im Browser scheinbar nichts (Symptom, das wiederholt aufgetreten ist).
 * index.html bekommt daher explizit no-cache, waehrend die gehashten Dateien
 * unter /assets/** unbedenklich langfristig gecacht werden duerfen - ihr
 * Name aendert sich ja bei jeder inhaltlichen Aenderung ohnehin.
 */
@Configuration
public class StaticResourceCacheConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/index.html")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.noCache());

        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/static/assets/")
                .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable());
    }
}
