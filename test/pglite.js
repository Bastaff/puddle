import { PGlite, types } from '@electric-sql/pglite';
export const pglite = () => new PGlite({ parsers: { [types.INT8]: Number, [types.NUMERIC]: Number } });
