// Natural Earth v5.1.2 is public domain. This runs during development, never in the app.
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

const source =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_map_subunits.geojson';
const response = await fetch(source);
if (!response.ok) throw new Error(`Boundary download failed: ${response.status}`);
const polygon = z.array(z.array(z.array(z.number())));
const collection = z
  .object({
    features: z.array(
      z.object({
        properties: z.object({ ADM0_A3: z.string(), NAME: z.string() }),
        geometry: z.discriminatedUnion('type', [
          z.object({ type: z.literal('Polygon'), coordinates: polygon }),
          z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon) }),
        ]),
      }),
    ),
  })
  .parse(await response.json());
/** @type {Record<string, string>} */
const countries = {
  UGA: 'UG',
  KEN: 'KE',
  TZA: 'TZ',
  RWA: 'RW',
  ZAF: 'ZA',
  ARE: 'AE',
  GBR: 'GB',
  USA: 'US',
  CAN: 'CA',
};
const boundaries = collection.features
  .filter((feature) => countries[feature.properties.ADM0_A3])
  .map((feature) => ({
    country: countries[feature.properties.ADM0_A3],
    region:
      feature.properties.NAME === 'Scotland'
        ? 'scotland'
        : feature.properties.NAME === 'N. Ireland'
          ? 'northern-ireland'
          : feature.properties.ADM0_A3 === 'GBR'
            ? 'england-and-wales'
            : 'national',
    polygons: (feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
    ).map((part) =>
      part.map((ring) =>
        ring.map((point) => point.map((value) => Math.round(value * 100000) / 100000)),
      ),
    ),
  }));
await writeFile(
  new URL('../packages/core/src/config/country-boundaries.json', import.meta.url),
  JSON.stringify(boundaries) + '\n',
);
console.log(`Saved ${boundaries.length} country/region boundaries.`);
