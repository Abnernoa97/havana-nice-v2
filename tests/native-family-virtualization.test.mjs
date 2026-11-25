import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Familia Android mounts a virtualized 3-column photo grid instead of all media at once',()=>{
 const f=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(f,/<FlatList/);
 assert.match(f,/data=\{mediaLoading&&!ready\.length\?\[\]:ready\}/);
 assert.match(f,/keyExtractor=\{item=>item.id\}/);
 assert.match(f,/numColumns=\{3\}/);
 assert.match(f,/initialNumToRender=\{12\}/);
 assert.match(f,/maxToRenderPerBatch=\{9\}/);
 assert.match(f,/windowSize=\{5\}/);
 assert.match(f,/useMemo<ReadyMedia\[\]>/);
 assert.doesNotMatch(f,/ready\.map\(/);
 assert.match(f,/item\.image\?<Image source=\{\{uri:item\.image,cache:'default'\}\}/);
 assert.match(f,/onPress=\{\(\)=>setFocused\(index\)\}/);
});
test('HOME must not nest Familia FlatList inside its all-modules ScrollView',()=>{
 const home=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(home,/active==='family'\s*\?<View style=\{\[styles\.root,styles\.content,styles\.familyViewport\]\}>\{content\}<\/View>/);
 assert.match(home,/<ScrollView style=\{styles\.root\} contentContainerStyle=\{styles\.content\}\s+keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator=\{false\}>\{content\}<\/ScrollView>/);
 assert.match(home,/familyViewport:\{flex:1,minHeight:0,paddingBottom:0\}/);
 assert.match(home,/active==='family'\?<NativeFamily token=\{token\} onBackHome=/);
});
test('Family stays private, modal video is only mounted on demand, BOOK unchanged',()=>{
 const f=read('apps/android/features/family/NativeFamily.tsx');
 const book=read('apps/android/features/book/NativeBook.tsx');
 const film=read('apps/android/features/shared/NativeMediaFilm.tsx');
 assert.doesNotMatch(f,/openFamilyRealtime\(|new WebSocket\(/);
 assert.match(read('apps/android/features/profile/useNativeMemberProfile.ts'),/openFamilyRealtime\(token,false/);
 assert.match(f,/lists\.directory\.load\(\(\)=>getFamilyDirectory\(token\)\)/);
 assert.match(f,/getFamilyAlbumMedia\(token,actorId\)/);
 assert.match(f,/url\.pathname\.startsWith\('\/api\/family\/media\/'\)/);
 assert.match(f,/<NativeBook token=\{token\} refreshKey=\{bookTick\} embedded/);
 assert.match(f,/chosen\?\.kind==='video'\?<NativeMediaFilm key=\{chosen\.id\} url=\{chosen\.file\}/);
 assert.match(film,/useVideoPlayer\(\{uri:url\}/);
 assert.match(film,/surfaceType="surfaceView"/);
 assert.match(book,/<WebView<object>/);
 assert.match(book,/bookContextDeliveryScript\(nativeContext\)/);
 assert.doesNotMatch(book,/injectedJavaScriptObject=/);
 assert.doesNotMatch(book,/Linking\.|Alert\.alert/);
 assert.doesNotMatch(f,/new WebSocket\(|localStorage|AsyncStorage|\.put\(/);
});

test('Unavailable storage never shows an endless album spinner or private viewer',()=>{
 const f=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(f,/const mediaLoading=mediaReady&&albumSnapshot\.loading/);
 assert.match(f,/const items=mediaReady\?\(albumSnapshot\.data\?\?\[\]\):\[\]/);
 assert.match(f,/const chosen=mediaReady&&focused!==null/);
 assert.match(f,/if\(selected&&mediaReady\)/);
});
