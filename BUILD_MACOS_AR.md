# دليل بناء لبيب على الماك

هذا الدليل لإنتاج تطبيق `Labeeb.app` ومثبّت `.dmg` من مصدر لبيب **0.1.50**. يستهدف أجهزة Apple Silicon وIntel كلًّا على حدة. إعدادات المشروع موجودة، لكن نسخة macOS لم تُبنَ أو تُختبر ضمن إعداد هذا الدليل؛ قد تظهر أخطاء تحتاج تعديل المصدر على الماك.

## المتطلبات

- جهاز Mac للبناء المحلي، أو مشغّل macOS في GitHub Actions. بناء DMG يحتاج macOS؛ راجع [توثيق Tauri](https://v2.tauri.app/distribute/dmg/).
- Node.js 22 مع npm، وRust stable عبر rustup، وأدوات Xcode. راجع [متطلبات Tauri](https://v2.tauri.app/start/prerequisites/).
- نسخة كاملة من مصدر لبيب وموارد Viora المذكورة أدناه.
- الحد الأدنى المعلن لتشغيل التطبيق في `src-tauri/tauri.conf.json` هو macOS 12.0؛ يلزم التحقق منه على جهاز فعلي، وهو ليس تحديدًا لإصدار نظام جهاز البناء.

نفّذ في Terminal على الماك، وثبّت الأدوات الناقصة قبل المتابعة:

```bash
xcode-select --install
xcode-select -p
node --version
npm --version
rustup --version
rustc --version
cargo --version
```

إذا كانت أدوات Xcode مثبتة، لا تحتاج إعادة تثبيتها. جميع الأوامر التالية من جذر مجلد لبيب، إلا عند التصريح بخلاف ذلك.

## نقل المشروع وتجهيز Viora

عند النقل من جهاز Windows، انسخ المصدر والإعدادات وملفات القفل. لا تنقل `node_modules` أو `src-tauri/target` أو `.build-venv`؛ تُنشأ تبعيات البناء على الماك. تأكد من نقل تعديلاتك المحلية والملفات الجديدة؛ نسخ المستودع من Git وحده لا ينقل الملفات غير الملتزم بها.

تحتاج إعدادات `src-tauri/tauri.bundle.conf.json` إلى:

```text
viora-tauri/app/
viora-tauri/shim/
```

المجلد `viora-tauri/app` مستثنى من Git. لديك طريقتان لتجهيزه:

1. انسخ المجلدين من نسخة لبيب المحلية التي تحتوي على موارد Viora المجهّزة، مع ملفات الترخيص والمصدر المقابل للتوزيع.
2. إذا لديك مشروع Viora بواجهة مبنية داخل `dist`، شغّل من جذر لبيب، بعد استبدال المسار بمسار مشروع Viora:

```bash
node viora-tauri/tools/prepare-app.mjs "/path/to/Viora"
```

هذا السكربت ينسخ الواجهة المبنية ويفك ضغط ملفاتها؛ لا يبني Viora من المصدر، ويستبدل مجلد `viora-tauri/app` الموجود. المسار المطلوب هو جذر Viora الذي يحتوي `dist` و`LICENSE`.

تحقق من الموارد:

```bash
test -d viora-tauri/app
test -f viora-tauri/app/LICENSE-AGPL-3.0.txt
test -f viora-tauri/shim/ftElectron.js
```

إذا فشل أي أمر، أكمل تجهيز المورد قبل التحزيم. راجع [إشعارات الأطراف الخارجية](THIRD_PARTY_NOTICES.md). وجود الموارد في الحزمة لا يثبت عمل تكامل Viora على macOS.

## تثبيت التبعيات وفحص المصدر

```bash
npm ci
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
```

توقف عند أي فشل وعالجه قبل البناء. اختبارات Rust بهذا الأمر لا تشمل تكامل سطح المكتب.

للتجربة أثناء التطوير:

```bash
npm run tauri -- dev
```

الأمر `npm run dev` وحده يعرض الواجهة فقط، ولا يختبر التصفح الأصلي أو مخزن مفاتيح النظام.

## اختيار المعمارية والبناء

يفضّل بناء كل نسخة على جهاز من المعمارية نفسها، كما تفعل مصفوفة CI في المشروع. اختر قيمة واحدة للمتغير التالي:

| نوع جهاز الماك | قيمة LABEEB_TARGET |
|---|---|
| Apple Silicon من عائلة M | `aarch64-apple-darwin` |
| Intel | `x86_64-apple-darwin` |

لـApple Silicon:

```bash
export LABEEB_TARGET=aarch64-apple-darwin
```

أو لـIntel:

```bash
export LABEEB_TARGET=x86_64-apple-darwin
```

ثم نفّذ في جلسة Terminal نفسها:

```bash
rustup target add "$LABEEB_TARGET"
cargo test --locked --manifest-path src-tauri/Cargo.toml --target "$LABEEB_TARGET"
npm run tauri -- build --target "$LABEEB_TARGET" --config src-tauri/tauri.bundle.conf.json --bundles app,dmg
```

يشغّل أمر Tauri بناء الواجهة تلقائيًا من خلال `beforeBuildCommand`. لا تستخدم سكربت `scripts/package.py` لإنتاج حزمة الماك؛ مسار التغليف الموثّق له في المشروع خاص بـWindows.

المخرجات المتوقعة عند نجاح البناء:

```text
src-tauri/target/<target>/release/bundle/macos/Labeeb.app
src-tauri/target/<target>/release/bundle/dmg/*.dmg
```

لفتح مجلد المخرجات:

```bash
open "src-tauri/target/$LABEEB_TARGET/release/bundle"
```

## البناء عبر GitHub Actions

يوجد سير عمل في [.github/workflows/native-build.yml](.github/workflows/native-build.yml) يستهدف المعماريتين ويرفع المخرجات دون نشر إصدار.

قبل الاعتماد عليه:

1. تأكد من وجود المصدر الكامل في المستودع؛ الموارد المحلية المستثناة من Git لن تظهر في مشغّل GitHub.
2. ارفع `packaging/viora-app.tar.gz` و`packaging/viora-app.json` و`scripts/ci-viora.py` مع المصدر. سير العمل يستعيد موارد Viora من الأرشيف ويتحقق من SHA256 قبل البناء. الأرشيف يشمل الترخيص، ولا يحل محل توفير المصدر المقابل عند التوزيع.
3. سير العمل يثبت Rust stable وهدف المعمارية، ويستخدم `macos-15` لـApple Silicon و`macos-15-intel` لـIntel.
4. من صفحة المستودع افتح **Actions → Native build and verification → Run workflow**.
5. بعد نجاح المهمة حمّل `labeeb-aarch64-apple-darwin-unsigned` أو `labeeb-x86_64-apple-darwin-unsigned` من Artifacts.

عند تحديث واجهة Viora، أعد إنشاء الأرشيف من الموارد المجهّزة بالأمر `python scripts/ci-viora.py pack` وارفع الأرشيف وملف البصمة معًا. لا يتطلب تشغيل CI وجود مشروع Viora الأصلي على المشغّل. المخرجات المرفوعة للماك هي ملفات DMG التي تحتوي التطبيق؛ نجاح التشغيل الفعلي يحتاج اختبارًا على الماك.

## التوقيع والتوزيع

للتوزيع المباشر على المستخدمين، جهّز شهادة **Developer ID Application** وهوية توقيع في Keychain، ثم اضبط التوقيع والتوثيق لدى Apple وفق [دليل Tauri للتوقيع وNotarization](https://v2.tauri.app/distribute/sign/macos/). مسار Mac App Store له إعداد منفصل، ولا تغطيه أوامر DMG هنا.

احفظ كلمات المرور والشهادات في مخزن أسرار محلي أو GitHub Secrets، وأعد البناء بعد ضبط التوقيع. لا تضعها في المصدر أو الدليل. بعد التوقيع والتوثيق يمكن التحقق من التطبيق بهذه الأوامر:

```bash
codesign --verify --deep --strict --verbose=2 "src-tauri/target/$LABEEB_TARGET/release/bundle/macos/Labeeb.app"
spctl --assess --type execute --verbose=2 "src-tauri/target/$LABEEB_TARGET/release/bundle/macos/Labeeb.app"
xcrun stapler validate "src-tauri/target/$LABEEB_TARGET/release/bundle/macos/Labeeb.app"
```

النسخة التجريبية غير الموثّقة قد لا تجتاز فحص Gatekeeper. لا تعتبرها نسخة توزيع نهائية.

## اختبار النسخة وحدود الميزات

ثبّت التطبيق من DMG إلى Applications واختبر النسخة المثبتة، ثم سجّل نتيجة كل بند على كل معمارية:

- بدء التطبيق وإغلاقه وإعادة فتحه.
- العربية واتجاه RTL والإنجليزية وحجم النافذة واختصارات لوحة المفاتيح.
- فتح المواقع والتبويبات والتنقل والسجل والمفضلة وبقاء البيانات بعد إعادة التشغيل.
- المساعد وحفظ مفتاحه واستعادته من مخزن النظام، دون إدراج المفتاح في تقرير الاختبار.
- التنزيلات العادية والأذونات واختيار مجلد الحفظ.
- الترقية من نسخة سابقة، عند توفر نسخة سابقة للماك.

هناك حدود مؤكدة في المصدر الحالي يجب التعامل معها قبل الإعلان عن تكافؤ نسخة الماك مع Windows:

| الوظيفة | الوضع الحالي في المصدر |
|---|---|
| تحميل الفيديو | `src-tauri/src/video.rs` يرفض التشغيل خارج Windows |
| البحث داخل الصفحة | مسار `tab_find` في `src-tauri/src/desktop.rs` يرجع أنه مدعوم على Windows حاليًا |
| فتح ملف تنزيل أو مجلده من الواجهة | `download_open` و`download_reveal` يرجعان عدم الدعم خارج Windows |
| Viora وحفظ كلمات مرور المواقع | يحتاجان تحققًا خاصًا على الماك؛ لا تفترض أن دمج Windows يعمل على WKWebView |

احفظ تقرير الاختبار في `docs/verification/` باسم مثل `macos-0.1.50-aarch64.md`، يتضمن إصدار macOS والمعمارية وإصدارات الأدوات ومرجع المصدر والنتائج والأخطاء. احسب بصمة الحزمة النهائية، بعد التوقيع، باستبدال المسار التالي باسم DMG الفعلي:

```bash
shasum -a 256 "/path/to/Labeeb.dmg"
```

## معالجة الأعطال الشائعة

| المشكلة | الإجراء |
|---|---|
| مورد Viora غير موجود | جهّز `app` و`shim` ثم أعد التحزيم |
| أدوات Xcode غير موجودة | ثبّتها وتحقق باستخدام `xcode-select -p` |
| هدف Rust غير مثبت | نفّذ `rustup target add "$LABEEB_TARGET"` |
| خطأ Rust خاص بـmacOS أو WKWebView | احفظ أول خطأ وسياقه؛ يحتاج معالجة في المصدر ولا يُحل بتغيير اسم الحزمة |
| التطبيق يعمل من التطوير ويفشل بعد التثبيت | افحص الموارد داخل `Labeeb.app` والتوقيع وسجل تشغيل النسخة المثبتة |
| Gatekeeper يرفض نسخة التوزيع | تحقق من هوية التوقيع ونتيجة notarization وتثبيت تذكرة Apple |

راجع أيضًا [تعليمات البناء العامة](BUILD.md) و[خطة الاختبار](TEST_PLAN.md).
