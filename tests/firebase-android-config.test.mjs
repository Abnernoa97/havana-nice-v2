import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));

test('Firebase Android installation configuration matches the current HAVANA NICE V2 app',()=>{
 const config=read('apps/android/google-services.json');
 const expo=read('apps/android/app.json').expo;
 const manifest=read('releases/android-batch.json');
 assert.equal(expo.android.package,'com.havananice.v2');
 assert.equal(config.project_info.project_id,'havana-nice-v2-push');
 assert.equal(config.project_info.project_number,'33085079931');
 assert.equal(config.client.length,1);
 assert.equal(config.client[0].client_info.android_client_info.package_name,expo.android.package);
 assert.equal(config.client[0].client_info.mobilesdk_app_id,'1:33085079931:android:cceb173ae0c6e844377dde');
 assert.equal(expo.android.googleServicesFile,'./google-services.json');
 // The config file is for client initialization only; never add a
 // Firebase Admin service-account private key to the repository.
 assert.equal(Object.hasOwn(config,'private_key'),false);
 assert.equal(Object.hasOwn(config,'client_email'),false);
 assert.equal(Object.hasOwn(config,'type'),false);
 assert.equal(expo.version,'0.0.29');
 assert.equal(expo.android.versionCode,29);
 assert.equal(manifest.version,'0.0.29');
 assert.equal(manifest.versionCode,29);
});
