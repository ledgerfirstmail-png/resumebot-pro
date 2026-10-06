/**
 * pdf.js ships its worker as an unbundled .mjs with no type declarations.
 * Importing it on the main thread is pdf.js's documented in-process ("fake
 * worker") mode: the module self-registers `globalThis.pdfjsWorker`, and the
 * types describe exactly what this app uses from it.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
