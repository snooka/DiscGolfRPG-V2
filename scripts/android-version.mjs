// Setter versionCode og versionName i android/app/build.gradle fra package.json ("version" og "androidVersionCode").
// Android godtar bare en installasjon over en eksisterende app hvis versionCode er høyere, så øk tallet for hver ny bygg.
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const file = process.argv[2] ?? 'android/app/build.gradle';
if (!fs.existsSync(file)) {
  console.log(`Fant ikke ${file} – kjør «npx cap add android» først.`);
  process.exit(0);
}
const code = Number(pkg.androidVersionCode);
if (!Number.isInteger(code) || code < 1) throw new Error('androidVersionCode i package.json må være et heltall ≥ 1');
let gradle = fs.readFileSync(file, 'utf8');
const before = gradle;
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
if (gradle === before && !before.includes(`versionCode ${code}`)) {
  console.warn('Fant ikke versionCode/versionName i build.gradle – sjekk filen manuelt.');
} else {
  fs.writeFileSync(file, gradle);
  console.log(`Android-versjon: ${pkg.version} (versionCode ${code})`);
}
