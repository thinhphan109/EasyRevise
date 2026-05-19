/**
 * scripts/ielts/detect-pooler-region.mjs
 *
 * Probes the common Supabase pooler hostnames to figure out which AWS
 * region this project is in. Useful when the dashboard tab is not
 * available to copy the exact connection string.
 */
import dns from 'node:dns/promises';

const REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3',
    'eu-central-1', 'eu-north-1',
    'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
    'ap-northeast-1', 'ap-northeast-2',
    'sa-east-1', 'ca-central-1'
];

console.log('Probing Supabase pooler regions...\n');
const found = [];
for (const region of REGIONS) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
        const r = await dns.lookup(host);
        // We just need *any* address — pooler hostnames resolve in every region.
        found.push({ region, host, address: r.address });
        process.stdout.write('.');
    } catch (e) {
        process.stdout.write('x');
    }
}
console.log('\n');

console.log('All pooler hostnames resolve (Supabase advertises them globally).');
console.log('Region cannot be detected via DNS alone — need to check the dashboard.\n');
console.log('Open: https://supabase.com/dashboard/project/ioqkasahsgabfcekondy/settings/database');
console.log('       → Connection string → Transaction → copy the URI.\n');
console.log('The host portion will look like:  aws-0-<REGION>.pooler.supabase.com');
console.log('And user portion will be:         postgres.ioqkasahsgabfcekondy');
