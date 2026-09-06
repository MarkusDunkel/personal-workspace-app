/**
 * Aufloeser-Haken fuer das Pruefskript.
 *
 * Die Quelldateien importieren ohne Dateiendung ("./markdownBlocks"), wie es
 * unter Vite ueblich ist; Node verlangt sie dagegen ausdruecklich. Statt die
 * Quellen fuer den Test umzuschreiben - und damit den Bundler-Stil des
 * Projekts zu verbiegen - haengt dieser Haken beim Aufloesen ".ts" an, wenn
 * der Pfad sonst nicht gefunden wird.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Nur relative Angaben ohne Endung nachbessern - Pakete bleiben unberuehrt.
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const ext of ['.ts', '.tsx']) {
        const candidate = await nextResolve(specifier + ext, context).catch(() => null);
        if (candidate && existsSync(fileURLToPath(candidate.url))) return candidate;
      }
    }
    throw err;
  }
}
