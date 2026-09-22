package at.anlagenbauaustria.aiapp.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Einstellungen fuer die Verlinkung nach Azure Boards.
 *
 * Anders als aivault.root MIT Default: die Organisation ist seit jeher
 * dieselbe (DEFAULT_ORG in pipelines/azure_boards/_common/azdo_client.py), und
 * fehlte sie, entstuende nur ein toter Link - kein Grund, den Start der App zu
 * verweigern.
 *
 * Konfigurierbar bleibt sie trotzdem, damit der Name an EINER Stelle steht und
 * nicht im Frontend-Code festgeschrieben ist.
 */
@ConfigurationProperties(prefix = "azure-boards")
public class AzureBoardsProperties {

    /** Die Azure-DevOps-Organisation, z.B. "anlagenbau-austria". */
    private String organization = "anlagenbau-austria";

    /** Basis-Adresse von Azure DevOps - ohne Organisation und Projekt. */
    private String baseUrl = "https://dev.azure.com";

    public String getOrganization() {
        return organization;
    }

    public void setOrganization(String organization) {
        this.organization = organization;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }
}
