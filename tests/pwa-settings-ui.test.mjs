import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,modules={},globals={}){
 const exports={};const jsx=(type,props)=>({type,props});
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{...globals,exports,require:n=>n==='react/jsx-runtime'?{jsx,jsxs:jsx}:modules[n]??{}});return exports;
}
function onboarding(mode,mobile=true){
 const {PwaOnboarding}=load('app/components/PwaOnboarding.tsx',{'./ResponsiveOverlay':{ResponsiveOverlay:'Overlay'},'./PushPreferences':{PushPreferences:'PushPreferences'},'./Icon':{Icon:'Icon'},'./BrowserNotificationSettings':{BrowserNotificationSettings:'BrowserNotificationSettings'}});
 return PwaOnboarding({open:true,onClose(){},onInstall(){},ios:false,nativeInstall:true,standalone:false,updateAvailable:false,onUpdate(){},pushEnabled:false,mode,mobile,userId:'synthetic-user'});
}
test('phone install invitation is separate from notification permission and enrollment',()=>{
 const text=JSON.stringify(onboarding('invite'));assert.ok(text.includes('Install MapSilip'));assert.equal(text.includes('PushPreferences'),false);
});
test('manual notification settings preserve in-app notices and installation independently of push',()=>{
 const text=JSON.stringify(onboarding('settings'));assert.ok(text.includes('Notification settings'));assert.ok(text.includes('In-app notifications'));assert.ok(text.includes('Always on'));assert.ok(text.includes('PushPreferences'));assert.ok(text.includes('Install MapSilip'));
});
test('pre-login install capability remains usable after login and is consumed only once',()=>{
 const capture=load('app/lib/pwa/install-prompt.ts');const target=new EventTarget();const stop=capture.listenForInstallPrompt(target);
 const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{};event.userChoice=Promise.resolve({outcome:'accepted'});
 target.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(capture.getInstallPrompt(),event);
 assert.equal(capture.takeInstallPrompt(),event);assert.equal(capture.takeInstallPrompt(),null);
 target.dispatchEvent(event);target.dispatchEvent(new Event('appinstalled'));assert.equal(capture.getInstallPrompt(),null);
 stop();target.dispatchEvent(event);assert.equal(capture.getInstallPrompt(),null);
});

function manager({phone=true,storage=new Map(),earlyPrompt=false,ios=false,standalone=false}={}){
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible';
 window.innerWidth=phone?390:1440;window.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 window.matchMedia=query=>Object.assign(new EventTarget(),{matches:query.includes('standalone')?standalone:query.includes('coarse')?phone:phone});
 const decisions=load('app/lib/pwa/onboarding.ts',{}, {window,Event});
 const capture=load('app/lib/pwa/install-prompt.ts');const stopCapture=capture.listenForInstallPrompt(window);
 if(earlyPrompt){const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);}
 let cursor=0;const values=[],effects=[];const jsx=(type,props)=>({type,props});
 const react={useSyncExternalStore:(_subscribe,snapshot)=>snapshot(),useState(value){const i=cursor++;if(!(i in values))values[i]=value;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}]},useRef(value){const i=cursor++;return values[i]??={current:value}},useCallback:f=>f,useEffect:f=>effects.push(f)};
 const exports={};const source=ts.transpileModule(readFileSync('app/components/PwaManager.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,window,document,navigator:{userAgent:ios?'iPhone':phone?'Android Mobile':'Desktop Chrome',maxTouchPoints:phone?1:0},Date,Boolean,require:n=>{
  if(n==='react')return react;if(n==='react/jsx-runtime')return {jsx,jsxs:jsx};if(n==='next/dynamic')return {default:factory=>String(factory).includes('ForegroundNotifications')?'ForegroundFeed':'Onboarding'};
  if(n.endsWith('/onboarding'))return decisions;
  if(n.endsWith('/foreground'))return load('app/lib/pwa/foreground.ts');
  if(n.endsWith('/install-prompt'))return capture;if(n.endsWith('/install'))return load('app/lib/pwa/install.ts');throw Error(n);
 }});
 const render=()=>{cursor=0;effects.length=0;const tree=exports.PwaManager({userId:'synthetic-user',pushEnabled:false});return [tree.props.children].flat(Infinity).find(n=>n?.type==='Onboarding')?.props};
 render();const cleanup=effects[0]();
 return {render,window,document,storage,cleanup(){cleanup();stopCapture()}};
}
test('phone setup offers notifications before captured installation even with push off',()=>{
 const h=manager({earlyPrompt:true});try{const props=h.render();assert.equal(props.open,true);assert.equal(props.mode,'notifications');h.render().onContinue('later');assert.equal(h.render().mode,'invite');assert.equal(props.nativeInstall,true);assert.equal(props.pushEnabled,false)}finally{h.cleanup()}
});
test('dismissed invitation can be reopened manually and desktop settings survive visibility changes',()=>{
 const phone=manager();try{phone.render().onClose();assert.equal(phone.render().open,false);phone.window.dispatchEvent(new Event('mapsilip-open-app-settings'));assert.equal(phone.render().mode,'settings');assert.equal(phone.render().open,true)}finally{phone.cleanup()}
 const desktop=manager({phone:false});try{assert.equal(desktop.render().mode,'notifications');desktop.render().onContinue('later');assert.equal(desktop.render().open,false);desktop.window.dispatchEvent(new Event('mapsilip-open-app-settings'));assert.equal(desktop.render().open,true);desktop.document.dispatchEvent(new Event('visibilitychange'));assert.equal(desktop.render().open,true);assert.equal(desktop.render().mode,'settings')}finally{desktop.cleanup()}
});
test('foreground receipt opens settings and cleanup removes its listener',()=>{
 const h=manager();try{
  h.render().onClose();assert.equal(h.render().open,false);
  h.window.dispatchEvent(new Event('mapsilip-foreground-notification-received'));
  assert.equal(h.render().open,true);assert.equal(h.render().mode,'settings');
  h.render().onClose();assert.equal(h.render().open,false);
  h.cleanup();h.window.dispatchEvent(new Event('mapsilip-foreground-notification-received'));
  assert.equal(h.render().open,false);assert.equal(h.render().mode,'settings');
 }finally{try{h.cleanup()}catch{}}
});

test('manual install consumes one browser prompt and reports Installed only after appinstalled',async()=>{
 const h=manager({phone:false,earlyPrompt:true});try{
  h.window.dispatchEvent(new Event('mapsilip-open-app-settings'));h.render().onInstall();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.render().nativeInstall,false);assert.equal(h.render().standalone,false);assert.equal(h.render().open,true);
  h.window.dispatchEvent(new Event('appinstalled'));
  assert.equal(h.render().standalone,true);assert.equal(h.render().open,true);
 }finally{h.cleanup()}
});

test('desktop settings mount browser permission controls instead of mobile push controls',()=>{
 const desktop=JSON.stringify(onboarding('settings',false));assert.ok(desktop.includes('BrowserNotificationSettings'));assert.equal(desktop.includes('PushPreferences'),false);
 const mobile=JSON.stringify(onboarding('settings',true));assert.ok(mobile.includes('PushPreferences'));assert.equal(mobile.includes('BrowserNotificationSettings'),false);
});
test('mobile standard overlays keep default sheet positioning while onboarding stays full-screen',()=>{
 const css=readFileSync('app/globals.css','utf8');
 const mobileStart=css.lastIndexOf('@media (max-width: 767px)');
 const mobileEnd=css.indexOf('@media (max-width: 520px)',mobileStart);
 const mobile=css.slice(mobileStart,mobileEnd);
 assert.match(mobile, /\.ps-overlay,\s*\.ps-overlay--drawer\s*\{[\s\S]*?inset:\s*auto\s+0\s+0;/);
 assert.match(mobile, /\.ps-overlay,\s*\.ps-overlay--drawer\s*\{[\s\S]*?width:\s*100%;/);
 assert.match(mobile, /\.ps-overlay,\s*\.ps-overlay--drawer\s*\{[\s\S]*?border-radius:\s*24px\s+24px\s+0\s+0;/);
 assert.match(css, /\.onboarding-overlay\.ps-overlay\s*\{[^}]*width:100vw;[^}]*height:100dvh;[^}]*inset:0;/);
});
test('mobile toolbar popovers float upper-right instead of above bottom navigation',()=>{
 const css=readFileSync('app/globals.css','utf8');
 assert.match(css, /inset:\s*78px\s+12px\s+auto\s+auto;/);
 assert.match(css, /width:\s*min\(390px,\s*calc\(100vw\s*-\s*24px\)\);/);
 assert.match(css, /transform-origin:\s*top\s+right;/);
 assert.doesNotMatch(css, /inset:\s*auto\s+12px\s+calc\(86px\s*\+\s*env\(safe-area-inset-bottom\)\)/);
});

 test('saved desktop decision prevents repeated onboarding after remount',()=>{const storage=new Map();let h=manager({phone:false,storage});h.render().onContinue('later');h.cleanup();h=manager({phone:false,storage});try{assert.equal(h.render(),undefined)}finally{h.cleanup()}});
 test('iPhone gets installation instructions after notifications, while standalone skips installation',()=>{let h=manager({ios:true});try{h.render().onContinue('later');assert.equal(h.render().mode,'invite');assert.equal(h.render().ios,true);assert.equal(h.render().nativeInstall,false)}finally{h.cleanup()}h=manager({ios:true,standalone:true});try{h.render().onContinue('later');assert.equal(h.render().open,false)}finally{h.cleanup()}});
