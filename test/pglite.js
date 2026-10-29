// An in-memory Postgres (PGlite) with the service's number parsing, for tests that need the team service's database.
import { PGlite, types } from '@electric-sql/pglite';
export const pglite = () => new PGlite({ parsers: { [types.INT8]: Number, [types.NUMERIC]: Number } });
