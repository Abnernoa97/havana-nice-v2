import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Familia Android mounts a virtualized 3-column photo grid instead of all media at once',()=>{
 const f=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(f,/<FlatList/);
 assert.match(f,/data=\{mediaLoading\?\[\]:ready\}/);
 assert.match(f,/keyExtractor=\{item=>item.id\}/);
 assert.match(f,/numColumns=\{3\}/);
 assert.match(f,/initialNumToRender=\{12\}/);
 assert.match(f,/maxToRenderPerBatch=\{9\}/);
 assert.match(f,/windowSize=\{5\}/);
 assert.match(f,/useMemo<ReadyMedia\[\]>/);
 assert.doesNotMatch(f,/ready\.map\(/);
 assert.match(f,/item\.image\?<Image source=\{\{uri:item\.image\}\}/);
 assert.match(f,/onPress=\{\(\)=>setFocused\(index\)\}/);
});
test('HOME must not nest Familia FlatList inside its all-modules ScrollView',()=>{
 const home=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(home,/active==='family'\s*\?<View style=\{\[styles\.root,styles\.content,styles\.familyViewport\]\}>\{content\}<\/View>/);
 assert.match(home,/:<ScrollView style=\{styles\.root\} contentContainerStyle=\{styles\.content\}>\{content\}<\/ScrollView>/);
 assert.match(home,/familyViewport:\{flex:1,minHeight:0,paddingBottom:0\}/);
 assert.match(home,/active==='family'\?<NativeFamily token=\{token\}/);
});
test('Family stays private, modal video is only mounted on demand, BOOK unchanged',()=>{
 const f=read('apps/android/features/family/NativeFamily.tsx');
 const book=read('apps/android/features/book/NativeBook.tsx');
 assert.match(f,/openFamilyRealtime\(token,false/);
 assert.match(f,/getFamilyAlbumMedia\(token,actorId\)/);
 assert.match(f,/url\.pathname\.startsWith\('\/api\/family\/media\/'\)/);
 assert.match(f,/<NativeBook token=\{token\} refreshKey=\{bookTick\} onClose=\{back\}/);
 assert.match(f,/chosen\?\.kind==='video'\?<NativeVideo key=\{chosen\.id\} url=\{chosen\.file\}/);
 assert.match(f,/useVideoPlayer\(\{uri:url\}/);
 assert.match(f,/surfaceType="surfaceView"/);
 assert.match(book,/<WebView<object>/);
 assert.match(book,/injectedJavaScriptObject=\{nativeContext\}/);
 assert.doesNotMatch(book,/Linking\.|Alert\.alert/);
 assert.doesNotMatch(f,/new WebSocket\(|localStorage|AsyncStorage|\.put\(/);
});
