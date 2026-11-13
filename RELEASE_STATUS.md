# Current trial: 0.1.12

Downloaded media library with cached local thumbnails, persistent records, search, OS playback and folder opening. See [verification](docs/verification/windows-0.1.12.md).

# Current trial: 0.1.11

Inline download buttons on video players, trusted format dialog, YouTube and direct HTTPS video support. See [verification](docs/verification/windows-0.1.11.md).

# Current trial: 0.1.10

YouTube video/audio downloads, lazy verified tool installation, one active job with a queue, cancellation and retry. See [verification](docs/verification/windows-0.1.10.md).

# لبيب | Labeeb — حالة التسليم

Current revision: **0.1.9** reduces idle UI polling, avoids unchanged library/keychain/frame work, restores sessions with lazy background loading, uses background memory targets, adds native Ctrl+F and explicit download retry. TypeScript, 46 frontend tests and 20 Rust tests passed. Native restore and find were verified. See `docs/verification/windows-0.1.9.md`. The following 0.1.6 notes describe an earlier revision.

الإصدار الحالي **0.1.6** يختصر صفحة «عن لبيب» في عرض واحد يجمع هوية المتصفح وبيانات شايع الشايع وموقع alshaye.ai ومنشأ التطوير والتراخيص. يحتفظ بالقائمة المضغوطة واقتراحات العنوان والزوم والاختصارات.

هذه نسخة مصدر قابلة للتطوير مع **مثبت Windows تجريبي غير موقّع**، وليست شهادة جاهزية للإنتاج أو ضماناً بأنها خالية من الأخطاء.

## الملفات والنتائج الفعلية
- مصدر Tauri 2 / React / TypeScript / Rust، عربي افتراضياً بخط تجوال، مع الإنجليزية.
- تبويبات أصلية، سجل ومفضلة SQLite، مفاتيح AI في مخزن النظام، محادثة AI، موافقات، تنزيلات، وربط Obscura v0.2.6 الحقيقي.
- نجحت 36 تجربة آلية للواجهة وفحص TypeScript لهذه النسخة. نتائج Rust الأربعة عشر تخص 0.1.4؛ لم تتغير وظائف الخلفية في 0.1.6. اختبارات CDP التسعة والتغليف الأربعة السابقة تخص 0.1.2.
- نجح البناء الأصلي Windows x64/MSVC وتغليف NSIS. تشغيل الواجهة العربية وحالة «جاهز» تحققا في 0.1.5. تحققت بصمة المحرك في الحزمة المحمولة الجديدة.
- ملفات التجربة في artifacts: مثبت NSIS، وملف ZIP محمول، ومجلد تشغيل مباشر. سجل هذه النسخة في docs/verification/windows-0.1.6.md.
- سجلات النتائج والبصمات في docs/verification. تعليمات التشغيل والبناء في BUILD.md.

## الاسم المعتمد
الاسم الحالي «لبيب | Labeeb». تغيرت أسماء الواجهة والحزم ومعرّف التطبيق إلى app.labeeb.browser دون تغيير الوظائف. النسخة السابقة تحت الاسم التجريبي القديم ليست ترقية بيانات تلقائية: إن استُخدمت، تبقى بياناتها ومفتاحها في موضعهما السابق ولا تُنقل أو تُحذف.

## قبل الاستخدام
المثبت مرشح اختبار غير موقّع؛ لم تُختبر دورة تثبيته وإزالته، بينما نجح تشغيل التطبيق المحمول فعلياً على Windows. يلزم Windows حديث وWebView2 وMicrosoft Visual C++ x64 Redistributable لتشغيل Obscura. المثبت يتعامل مع WebView2، لكنه لا يثبت حزمة Visual C++ نيابة عنك. استخدم المصدر الرسمي المرتبط في BUILD.md. لا تعطل حماية النظام لتشغيله.

فحص التشغيل السابق يخص 0.1.5؛ لم يُكرر التحقق البصري في 0.1.6. نجحت اختبارات الواجهة والبناء الأصلي لتعديل صفحة «عن لبيب». لا يُدّعى اكتمال التحقق اليدوي لجميع مقاسات النافذة. لم يُستخدم مفتاح AI للاختبار.

لم تتوفر بيئة macOS، ولذلك **لا توجد حزمة macOS مبنية أو مختبرة**. مسار بناء أصلي لـ Windows وmacOS موجود في GitHub Actions لكنه لم يُشغّل.

المساعد الحالي يجيب عن النص الذي ترسله فقط ولا ينفّذ تلقائياً خطة تصفح. إجراءات الأتمتة يطلبها المستخدم وتخضع للموافقة. لا توجد أدوات نموذج ذاتية أو رفع ملفات مؤتمت. جلسة Obscura منفصلة عن جلسة التصفح الأصلية. الموافقات لا تعترض جميع النماذج والإجراءات اليدوية داخل المواقع.

يلزم اختبار الواجهة الأصلية، مخزن المفاتيح، التنزيلات، العزل، ودورة الحياة على النظامين، والتوقيع/التوثيق ومراجعة أمنية قبل النشر الإنتاجي. راجع COMPATIBILITY.md وSECURITY.md وTEST_PLAN.md.

## English
The Windows 0.1.6 candidate compacts the About page. All 36 frontend tests passed; backend behavior is unchanged from 0.1.4. Runtime accessibility observations belong to 0.1.5 and were not repeated for this revision. The installer is unsigned and its install/uninstall cycle was not tested. No macOS artifact was produced.
