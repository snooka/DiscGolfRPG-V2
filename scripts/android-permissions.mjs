// Legger de nødvendige tillatelsene inn i AndroidManifest.xml (trygt å kjøre flere ganger).
// Kun posisjon MENS APPEN ER ÅPEN (ingen bakgrunnsposisjon), som Google Play krever for denne typen app.
import fs from 'node:fs';

const file = process.argv[2] ?? 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(file)) {
  console.log(`Fant ikke ${file} – kjør «npx cap add android» først.`);
  process.exit(0);
}
const wanted = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];
let xml = fs.readFileSync(file, 'utf8');
const missing = wanted.filter((p) => !xml.includes(`android:name="${p}"`));
if (missing.length === 0) {
  console.log('AndroidManifest har allerede riktige tillatelser.');
} else {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
  xml = xml.replace('</manifest>', `${lines}\n</manifest>`);
  fs.writeFileSync(file, xml);
  console.log(`La til: ${missing.join(', ')}`);
}
if (xml.includes('ACCESS_BACKGROUND_LOCATION')) {
  console.warn('ADVARSEL: ACCESS_BACKGROUND_LOCATION er med. Fjern den, appen trenger ikke bakgrunnsposisjon.');
}

