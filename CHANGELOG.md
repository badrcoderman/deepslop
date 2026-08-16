# 📜 سجل التغييرات (Changelog)

> تنسيق [Keep a Changelog](https://keepachangelog.com/) — جميع التحديثات والترقيات موثقة هنا بالتفصيل.

---

## ⚡ v3.1.0 — Arbitrary Read Primitive & Streaming Dumper (2026-08-17)

- **`window.aimRead(addr, len)` (ميزة جوهرية)**:
  - إضافة دالة قراءة حقيقية لأي عنوان في الذاكرة عبر إعادة توجيه الـ carrier (`aimCarrier`) والنسخ بأمان داخل كتلة `finally`.
  - تجاوز قيد الـ 8KB Arena القديم الذي كان يرجع أصفاراً صامتة عند القراءة خارج النطاق.
- **`payloads/sprx_dumper2.js` (جديد)**:
  - دمج الدامبر المتدفق فائق الخفة الذي يقرأ ترويسة الـ ELF لمعرفة حجم الموديول الفعلي من `PT_LOADs` ويبث البيانات على دفعات 2KB عبر Beacons لتجنب أي ضغط على الذاكرة.
- **ترقية `payloads/sprx_dumper.js`**:
  - تحديثه ليستخدم `aimRead` لقراءة موديول `libkernel_web` على دفعات 4KB وحفظه مباشرة لملفات التحميل بالمتصفح.
- **إصلاح `payloads/syscore_connect_probe.js`**:
  - تحويل مسح توقيعات الـ stubs إلى `aimRead` لضمان قراءة نداءات `ipmimgr_call` (0x26e) و `dlsym` (0x24e) الحقيقية من الذاكرة بدلاً من مسح الأصفار.
- **المحاقن الشامل للحمولات (Universal Payload Injector)**:
  - تحديث قائمة الحمولات في `index.html` لتشمل جميع الـ 16 حمولة بحثية مع إمكانية الحقن المباشر.

---

## 🛡️ v3.0.0 — Standalone Modern Redesign & OOM Mitigations (2026-08-16)

- **تصميم Glassmorphic عصري وخفيف (`index.html`)**:
  - إعادة بناء الواجهة بالكامل بتصميم داكن فاخر (Obsidian `#080c14` مع حواف شفافة وألوان تركواز/زمردية) بحجم أقل من 20KB وبدون أي خطوط خارجية (Zero WebFonts) للحفاظ على كفاءة الذاكرة.
- **حل مشكلة الـ OOM (Fast OOM-Safe Mode)**:
  - ضبط زر `RUN` ليمرر `scan=0` افتراضياً، مما يعني استخدام الإزاحات المعتمدة لـ FW 13.60 مباشرة في 0.1 ثانية وبدون استنزاف للذاكرة.
  - إلغاء حجز المصفوفات المتكررة في حلقات الفحص (`scanChunk` buffer reuse).
  - إضافة زر اختيار `[ ] Auto-scan offsets` في الواجهة لتفعيل الفحص يدوياً عند الرغبة.
- **محرك `Audio WakeLock` لمنع خمول المتصفح**:
  - دمج مذبذب صوتي صامت (`1Hz Inaudible Oscillator`) يمنع نظام PS5 من تجميد تبويب المتصفح أو خفض طاقة المعالج أثناء الفحص.
- **محلل الرموز الديناميكي في الذاكرة (`_ds.dlsym` / `window.resolveSymbol`)**:
  - قراءة ترويسات `ELF64` ومصفوفات `PT_DYNAMIC`, `DT_SYMTAB`, `DT_STRTAB` مباشرة من الذاكرة لحل عناوين الدوال ورموز Sony NIDs ديناميكياً بدون جداول أوفستس صلبة.
- **مفتش الذاكرة التفاعلي (In-Browser Hex Inspector)**:
  - فحص الذاكرة الحية بأي عنوان مع إمكانية القفز السريع لقواعد `libkernel_web` و `WebKit` و `Arena`، وتنزيل تفريغ ثنائي مباشر بنقرة واحدة (`Download Dump`).
- **مسجل الأخطاء والإنقاذ الجنائي (Crash-Safe Forensic Recorder)**:
  - حفظ مراحل التنفيذ في `localStorage` لعرض تنبيه جنائي في حال حدوث إعادة تشغيل مفاجئة أو كراش.
- **استقلالية تامة (100% Standalone On-Device)**:
  - حذف جميع خوادم وملفات الـ PC (`ws_server.py`, `remote.js`, `host/`) ليعمل الكيت بالكامل وبشكل فوري عبر GitHub Pages.

---

## 🔬 v2.0.0 — DeepSlop Userland Research Framework (2026-08-11)

- **Core Runtime (`ds-research-core.js`)**: محرك لجمع القياسات (telemetry) والأداء (benchmarks)، واكتشاف القدرات (capabilities)، وإدارة حمولات البحث.
- **Research Payloads (31 حمولة بحثية)**: حمولات مقسمة إلى 7 أقسام تعمل كـ IIFEs معتمدة على `manifest.json`.
- **Dashboard (`research-dashboard.html`)**: واجهة تعرض القدرات وتشغل الحمولات.

---

## 🧪 v2.0.0-rc1 — scanKernelStubs أصبح وحدة قابلة للاختبار (2026-08-10)

- **`kernel-stubs.js`**: الماسح النقي لنمط stubs الكيرنل — بلا DOM ولا آثار جانبية.
- **`tools/scan-test.js`**: اختبار تنفيذي لمنطق المسح عبر محاكاة 23 إصدار FW.
