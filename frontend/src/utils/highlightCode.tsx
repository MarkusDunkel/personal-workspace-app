import type { ReactNode } from 'react';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * Faerbt Quelltext in Code-Bloecken ein.
 *
 * Bewusst ueber "highlight.js/lib/core" plus einzeln registrierte Sprachen
 * statt ueber den Gesamt-Import: der zoege alle rund 190 Sprachen ins Bundle
 * (~280 KB gzip statt ~50 KB).
 *
 * Der eigentliche Kunstgriff steht weiter unten in ReactEmitter.
 */

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

/** Ein Knoten im Aufbau: entweder Text oder ein benannter Bereich. */
interface ScopeNode {
  scope?: string;
  children: (ScopeNode | string)[];
}

/**
 * Baut React-Knoten statt einer HTML-Zeichenkette.
 *
 * highlight.js liefert ueblicherweise fertiges HTML (result.value), was hier
 * dangerouslySetInnerHTML erzwingen wuerde - davon gibt es in dieser
 * Anwendung bewusst keinen einzigen Gebrauch (siehe MarkdownView). Der
 * Emitter ist der dokumentierte Weg daran vorbei: die Bibliothek meldet
 * ueber startScope/addText/endScope einen Bereichs-Stapel, aus dem sich
 * ebenso gut ein Element-Baum bauen laesst. Es entsteht zu keinem Zeitpunkt
 * eine HTML-Zeichenkette, also gibt es auch nichts zu bereinigen.
 *
 * __emitter ist in den Typen der Bibliothek oeffentlich (HLJSOptions), die
 * Emitter-Schnittstelle selbst ist dort als "technically private, but
 * exported for convenience as this has been a pretty stable API" vermerkt.
 * Sollte sie doch einmal wegfallen, bleibt die Signatur von highlightCode
 * gleich und nur dessen Rumpf wechselt auf einen DOMParser ueber
 * result.value - die Aufrufstelle in MarkdownView aendert sich nicht.
 */
class ReactEmitter {
  /**
   * NICHT privat: die Bibliothek greift in __addSublanguage direkt auf
   * emitter.root des fremden Emitters zu.
   */
  root: ScopeNode = { children: [] };
  private stack: ScopeNode[] = [this.root];

  // Die Bibliothek ruft den Konstruktor mit ihren Optionen auf; wir
  // brauchen sie nicht.
  constructor(_options: unknown) {}

  private get top(): ScopeNode {
    return this.stack[this.stack.length - 1];
  }

  addText(text: string): void {
    if (text === '') return;
    this.top.children.push(text);
  }

  /**
   * openNode/closeNode sind der eigentliche Hauptweg: die dokumentierte
   * Minimal-Schnittstelle nennt zwar nur startScope/endScope, der Parser
   * ruft an mehreren Stellen aber unmittelbar openNode/closeNode auf (bei
   * mehrteiligen Bereichen und beim Schliessen eines Modus). Fehlen sie,
   * bleibt der Baum leer und der Quelltext wird ungefaerbt ausgegeben.
   */
  openNode(scope: string): void {
    const node: ScopeNode = { scope, children: [] };
    this.top.children.push(node);
    this.stack.push(node);
  }

  closeNode(): void {
    // Nie den Wurzelknoten entfernen - ein unausgeglichenes Schliessen
    // wuerde sonst den Stapel leeren und top waere undefined.
    if (this.stack.length > 1) this.stack.pop();
  }

  startScope(scope: string): void {
    this.openNode(scope);
  }

  endScope(): void {
    this.closeNode();
  }

  __addSublanguage(emitter: ReactEmitter, name: string): void {
    const node = emitter.root;
    if (name) node.scope = `language:${name}`;
    this.top.children.push(node);
  }

  finalize(): void {
    while (this.stack.length > 1) this.stack.pop();
  }

  /** Wird nur aufgerufen, wenn jemand result.value liest - das tun wir nicht. */
  toHTML(): string {
    return '';
  }

  toReact(): ReactNode[] {
    return renderChildren(this.root.children);
  }
}

/**
 * Bereichsname in CSS-Klasse, wie highlight.js es selbst tut (scopeToCSSClass
 * in dessen Kern): "comment.line" wird zu "hljs-comment line_", eine
 * Untersprache zu "language-xml".
 */
function scopeToClass(scope: string): string {
  if (scope.startsWith('language:')) return scope.replace('language:', 'language-');
  if (scope.includes('.')) {
    const pieces = scope.split('.');
    const head = pieces.shift();
    return [`hljs-${head}`, ...pieces.map((p, n) => `${p}${'_'.repeat(n + 1)}`)].join(' ');
  }
  return `hljs-${scope}`;
}

function renderChildren(children: (ScopeNode | string)[]): ReactNode[] {
  return children.map((child, n) => {
    if (typeof child === 'string') return child;
    if (!child.scope) return <span key={n}>{renderChildren(child.children)}</span>;
    return (
      <span key={n} className={scopeToClass(child.scope)}>
        {renderChildren(child.children)}
      </span>
    );
  });
}

/** Die registrierten Sprachen - alles andere bleibt ungefaerbt. */
const SUPPORTED = new Set([
  'bash',
  'java',
  'javascript',
  'json',
  'sql',
  'typescript',
  'xml',
  'yaml',
]);

/** Uebliche Kurzformen auf die registrierten Namen abbilden. */
const ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  yml: 'yaml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  html: 'xml',
  svg: 'xml',
};

// Einmalig: unser Emitter statt des HTML-Emitters. Die Typen der Bibliothek
// erwarten hier ihren eigenen Emitter-Konstruktor; unserer erfuellt dieselbe
// Schnittstelle, traegt aber zusaetzlich toReact.
hljs.configure({ __emitter: ReactEmitter as never });

/**
 * Faerbt Quelltext ein und liefert React-Knoten.
 *
 * Liefert null, wenn die Sprache fehlt, unbekannt ist oder das Faerben
 * scheitert - der Aufrufer zeigt dann schlicht den unveraenderten Text.
 *
 * Bewusst KEINE automatische Spracherkennung (highlightAuto): sie raet bei
 * kurzen Ausschnitten oft daneben, und eine falsche Faerbung ist schlechter
 * als gar keine.
 */
export function highlightCode(code: string, lang?: string): ReactNode[] | null {
  if (!lang || code === '') return null;
  const name = ALIASES[lang] ?? lang;
  if (!SUPPORTED.has(name)) return null;
  try {
    // ignoreIllegals: KI-erzeugter Quelltext ist haeufig ein Ausschnitt und
    // laesst sich nicht immer vollstaendig parsen - dann lieber unvollkommen
    // faerben als abbrechen.
    const result = hljs.highlight(code, { language: name, ignoreIllegals: true });
    const emitter = result._emitter as unknown as ReactEmitter;
    // strict ist in diesem Projekt AUS - die Pruefung muss von Hand sein.
    if (!emitter || typeof emitter.toReact !== 'function') return null;
    return emitter.toReact();
  } catch {
    return null;
  }
}
