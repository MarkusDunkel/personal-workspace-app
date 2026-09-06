# Tabellen-Grenzfaelle

Ein Absatz, direkt gefolgt von einer Tabelle ohne Leerzeile dazwischen:
| Anbieter | Mobil | Bewertung |
| --- | :---: | ---: |
| BMD | ja | favorisiert |
| ATOSS | ja | teuer |

Eine Zeile mit einem literalen | Pipe mitten im Text - das ist KEINE Tabelle
und darf nicht zerteilt werden.

| Spalte |
| --- |
| einspaltig |

| A | B | C |
| --- | --- | --- |
| zu wenige |
| eins | zwei | drei | vier |
|  | leer davor |  |

| Maskiert | Text |
| --- | --- |
| a \| b | enthaelt einen maskierten Pipe |

| Mit | Auszeichnung |
| --- | --- |
| ==hervorgehoben==^[eine Notiz] | **fett** und *kursiv* |
| `a==b` in Backticks | [Link](https://example.org) |

## Tabelle in einem Code-Zaun

```markdown
| das | ist | code |
| --- | --- | --- |
| und | keine | tabelle |
```

## Tabelle am Dateiende ohne abschliessenden Umbruch

| Letzte | Zeile |
| --- | --- |
| ganz | unten |
