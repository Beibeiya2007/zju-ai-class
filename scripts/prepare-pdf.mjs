import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('public/pdfjs', { recursive: true });
for (const item of ['build/pdf.worker.min.mjs','cmaps','standard_fonts','wasm']) cpSync(resolve('node_modules/pdfjs-dist',item),resolve('public/pdfjs',item.replace('build/','')), {recursive:true});
