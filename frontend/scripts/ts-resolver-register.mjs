/** Meldet den Aufloeser-Haken an (siehe ts-resolver.mjs). */
import { register } from 'node:module';

register('./ts-resolver.mjs', import.meta.url);
