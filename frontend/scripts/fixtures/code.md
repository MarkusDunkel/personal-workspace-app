---
titel: Frontmatter-Test
tags: [a, b]
---

# Code-Grenzfaelle

Ein Zaun mit Sprache:

```json
{
  "personalnummer": "P-00417",
  "pausen_minuten": 45,
  "aktiv": true
}
```

Ein Zaun ohne Sprache:

```
einfach nur Text
```

Ein leerer Zaun:

```json
```

Ein Zaun mit Tilden:

~~~yaml
schluessel: wert
liste:
  - eins
~~~

Ein `==` in Backticks wie `a==b` darf keine Hervorhebung erzeugen.

Zum Schluss ein nicht geschlossener Zaun:

```sql
SELECT * FROM zeiten WHERE datum > '2026-01-01'
