const fs=require('fs');
const A='android/app/src/main',R=A+'/res/values/';
const must=(ok,msg)=>{if(!ok){console.error('EROARE patch-android: '+msg);process.exit(1)}};

/* ---------- AndroidManifest: permisiuni + serviciu în fundal ---------- */
let m=fs.readFileSync(A+'/AndroidManifest.xml','utf8');
const perms=['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','CAMERA','VIBRATE','WAKE_LOCK','ACCESS_NETWORK_STATE',
 'FOREGROUND_SERVICE','FOREGROUND_SERVICE_LOCATION','POST_NOTIFICATIONS','USE_FULL_SCREEN_INTENT','REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'];
m=m.replace('</manifest>',perms.filter(p=>!m.includes('android.permission.'+p)).map(p=>`    <uses-permission android:name="android.permission.${p}" />\n`).join('')
 +'    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>');
if(!m.includes('screenOrientation'))m=m.replace('<activity','<activity android:screenOrientation="portrait"');
if(!m.includes('.GameService'))m=m.replace('</application>','    <service android:name=".GameService" android:exported="false" android:foregroundServiceType="location" />\n    </application>');
must(m.includes('.GameService'),'nu am putut adauga serviciul in manifest');
fs.writeFileSync(A+'/AndroidManifest.xml',m);

/* ---------- cod Java nativ ---------- */
const dir=A+'/java/com/deasnuru/app';fs.mkdirSync(dir,{recursive:true});
for(const f of['MainActivity.java','SaveImagePlugin.java','GamePlugin.java','GameService.java'])fs.copyFileSync('android-src/'+f,dir+'/'+f);

/* ---------- resurse: logo mare + iconiță mică pentru notificări ---------- */
fs.mkdirSync(A+'/res/drawable-nodpi',{recursive:true});
fs.copyFileSync('app/static/icon-192.png',A+'/res/drawable-nodpi/logo_large.png');
fs.mkdirSync(A+'/res/drawable',{recursive:true});
fs.writeFileSync(A+'/res/drawable/ic_stat_dn.xml',`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,2C8.13,2 5,5.13 5,9c0,5.25 7,13 7,13s7,-7.75 7,-13c0,-3.87 -3.13,-7 -7,-7zM12,11.5c-1.38,0 -2.5,-1.12 -2.5,-2.5s1.12,-2.5 2.5,-2.5 2.5,1.12 2.5,2.5 -1.12,2.5 -2.5,2.5z"/>
</vector>
`);

/* ---------- culori / teme ---------- */
if(fs.existsSync(R+'colors.xml')){let c=fs.readFileSync(R+'colors.xml','utf8').replace(/(<color name="colorPrimary(Dark)?">)[^<]*/g,'$1#000000');fs.writeFileSync(R+'colors.xml',c)}
let st=fs.readFileSync(R+'styles.xml','utf8');
st=st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/,'$1\n        <item name="android:statusBarColor">#000000</item>\n        <item name="android:navigationBarColor">#000000</item>');
fs.writeFileSync(R+'styles.xml',st);

/* ---------- build.gradle: semnare release + versiune + encoding ---------- */
const GP='android/app/build.gradle';
let g=fs.readFileSync(GP,'utf8');
must(/buildTypes\s*\{\s*release\s*\{/.test(g),'nu gasesc buildTypes { release { in build.gradle');
g=g.replace(/buildTypes\s*\{\s*release\s*\{/,`signingConfigs {
        release {
            storeFile file(System.getenv('DN_KS'))
            storePassword System.getenv('DN_KS_PASS')
            keyAlias System.getenv('DN_KEY_ALIAS')
            keyPassword System.getenv('DN_KEY_PASS')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release`);
g=g.replace(/versionCode\s+\d+/,"versionCode(System.getenv('DN_VC') ? System.getenv('DN_VC').toInteger() : 1)")
   .replace(/versionName\s+"[^"]*"/,'versionName "2.2"');
g=g.replace(/android\s*\{/,'android {\n    lint {\n        abortOnError false\n        checkReleaseBuilds false\n    }');
g+="\ntasks.withType(JavaCompile) { options.encoding = 'UTF-8' }\n";
must(g.includes('signingConfig signingConfigs.release')&&g.includes('lint {'),'patch build.gradle esuat');
fs.writeFileSync(GP,g);
console.log('android patched (semnare release + serviciu fundal)');
